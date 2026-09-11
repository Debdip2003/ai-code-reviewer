/**
 * Pre-write and Post-write Validation Engine for ACR Split Apply Transactions.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  calculateFileSha256,
  isRegularFile,
  isSymlink
} from './write-utils.js';
import { parseAst } from '../ast-utils.js';
import { buildDependencyGraph } from '../dependency-graph.js';
import { buildLocalModuleGraph } from '../module-graph.js';
import { detectImportCycles } from '../cycle-detector.js';
import {
  ApplyNotAllowedError,
  PostWriteValidationError,
  SourceChangedError,
  SplitInputError,
  SymlinkRejectedError,
  TargetCollisionError,
  TargetOutsideProjectError,
  UnsafeFileTypeError
} from '../split-errors.js';
import { normalizePath } from '../target-path.js';

/**
 * Validates all pre-conditions before any disk mutation begins.
 *
 * @param {Object} params
 * @param {Object} params.plan - The transformation plan object.
 * @param {string} params.projectRoot - Project root directory.
 * @param {string} params.sourceFile - Source file relative path.
 * @param {string} params.targetFile - Target file relative path.
 * @param {string} [params.plannedSourceHash] - Expected source file SHA-256 hash.
 * @returns {{ success: boolean, currentSourceHash: string }}
 */
export function validatePreApply({
  plan,
  projectRoot,
  sourceFile,
  targetFile,
  plannedSourceHash
}) {
  const absProjectRoot = path.resolve(projectRoot);
  const absSource = path.resolve(absProjectRoot, sourceFile);
  const absTarget = path.resolve(absProjectRoot, targetFile);

  // 1. Candidate safety must be automatic-ready
  if (plan.candidate.safety !== 'automatic-ready') {
    const reasons = [];
    if (plan.validation?.errors?.length > 0) {
      reasons.push(...plan.validation.errors);
    }
    if (plan.validation?.unresolvedBindings?.length > 0) {
      reasons.push(`Unresolved bindings: ${plan.validation.unresolvedBindings.join(', ')}`);
    }
    if (plan.candidate.safety === 'manual-review') {
      reasons.push('Candidate requires manual review before extraction.');
    } else if (plan.candidate.safety === 'blocked') {
      reasons.push('Candidate extraction is blocked by safety invariants.');
    }

    throw new ApplyNotAllowedError(
      `Cannot apply split for candidate "${plan.candidate.id}" (safety: ${plan.candidate.safety}).\n` +
        `Only "automatic-ready" candidates can be applied automatically.\n` +
        reasons.map((r) => `  - ${r}`).join('\n'),
      {
        candidateId: plan.candidate.id,
        safety: plan.candidate.safety,
        reasons
      }
    );
  }

  // 2. Source file existence and type checks
  if (!fs.existsSync(absSource)) {
    throw new SplitInputError(`Source file "${sourceFile}" does not exist.`, {
      filePath: sourceFile,
      reason: 'file-not-found'
    });
  }

  if (isSymlink(absSource)) {
    throw new SymlinkRejectedError(
      `Source file "${sourceFile}" is a symbolic link. Symbolic links are not supported for safety.`,
      { filePath: sourceFile }
    );
  }

  if (!isRegularFile(absSource)) {
    throw new UnsafeFileTypeError(
      `Source file "${sourceFile}" is not a regular file.`,
      { filePath: sourceFile }
    );
  }

  // 3. Target file checks
  if (!absTarget.startsWith(absProjectRoot)) {
    throw new TargetOutsideProjectError(
      `Target path "${targetFile}" resolves outside project root "${projectRoot}".`,
      { targetPath: targetFile, projectRoot }
    );
  }

  if (isSymlink(absTarget)) {
    throw new SymlinkRejectedError(
      `Target path "${targetFile}" is a symbolic link.`,
      { filePath: targetFile }
    );
  }

  if (fs.existsSync(absTarget)) {
    throw new TargetCollisionError(
      `Target file already exists on disk: "${targetFile}". Automatic overwrite is not permitted.`,
      { targetPath: targetFile, reason: 'target-exists' }
    );
  }

  // 4. Optimistic Concurrency Protection: check current source hash against plan
  const currentSourceHash = calculateFileSha256(absSource);
  const expectedHash = plannedSourceHash || plan.before?.sourceHash || plan.sourceHash;

  if (expectedHash && currentSourceHash !== expectedHash) {
    throw new SourceChangedError(
      `The source file changed after the split plan was generated.\n` +
        `Expected hash: ${expectedHash}\n` +
        `Actual hash:   ${currentSourceHash}\n` +
        `Run the split command again to create a fresh plan.`,
      {
        filePath: sourceFile,
        expectedHash,
        actualHash: currentSourceHash
      }
    );
  }

  // 5. Check in-memory validation results from plan
  if (!plan.validation.sourceParseable || !plan.validation.targetParseable) {
    throw new ApplyNotAllowedError(
      `Cannot apply split: proposed source or target failed parse validation.`,
      {
        candidateId: plan.candidate.id,
        safety: plan.candidate.safety,
        reasons: plan.validation.errors || []
      }
    );
  }

  if (plan.validation.unresolvedBindings && plan.validation.unresolvedBindings.length > 0) {
    throw new ApplyNotAllowedError(
      `Cannot apply split: unresolved outer bindings detected (${plan.validation.unresolvedBindings.join(', ')}).`,
      {
        candidateId: plan.candidate.id,
        safety: plan.candidate.safety,
        reasons: plan.validation.unresolvedBindings
      }
    );
  }

  if (plan.validation.cycles && plan.validation.cycles.length > 0) {
    throw new ApplyNotAllowedError(
      `Cannot apply split: circular dependency detected (${plan.validation.cycles.join(' -> ')}).`,
      {
        candidateId: plan.candidate.id,
        safety: plan.candidate.safety,
        reasons: plan.validation.cycles
      }
    );
  }

  return {
    success: true,
    currentSourceHash
  };
}

/**
 * Validates the final written files on disk after atomic renames have completed.
 *
 * @param {Object} params
 * @param {string} params.projectRoot
 * @param {string} params.sourceFile
 * @param {string} params.targetFile
 * @param {{ id: string, symbol: string, kind: string }} params.candidate
 * @param {Object} params.contract
 * @param {string} [params.expectedSourceHash]
 * @param {string} [params.expectedTargetHash]
 * @returns {Promise<{
 *   preWrite: string,
 *   postWrite: string,
 *   sourceHash: string,
 *   targetHash: string
 * }>}
 */
export async function validatePostWrite({
  projectRoot,
  sourceFile,
  targetFile,
  candidate,
  contract,
  expectedSourceHash = null,
  expectedTargetHash = null
}) {
  const absProjectRoot = path.resolve(projectRoot);
  const absSource = path.resolve(absProjectRoot, sourceFile);
  const absTarget = path.resolve(absProjectRoot, targetFile);
  const validationErrors = [];

  // 1. Existence and symlink check
  if (!fs.existsSync(absSource)) {
    validationErrors.push(`Post-write: Source file "${sourceFile}" is missing.`);
  }
  if (!fs.existsSync(absTarget)) {
    validationErrors.push(`Post-write: Target file "${targetFile}" was not created.`);
  }

  if (validationErrors.length > 0) {
    throw new PostWriteValidationError(
      `Post-write validation failed:\n  - ${validationErrors.join('\n  - ')}`,
      { validationErrors }
    );
  }

  if (isSymlink(absSource) || isSymlink(absTarget)) {
    throw new PostWriteValidationError(
      'Post-write validation failed: symbolic links detected.',
      { validationErrors: ['Symbolic links are not allowed in project files.'] }
    );
  }

  // 2. Recalculate file hashes
  const sourceHash = calculateFileSha256(absSource);
  const targetHash = calculateFileSha256(absTarget);

  if (expectedSourceHash && sourceHash !== expectedSourceHash) {
    validationErrors.push(`Source hash mismatch. Expected ${expectedSourceHash}, got ${sourceHash}.`);
  }
  if (expectedTargetHash && targetHash !== expectedTargetHash) {
    validationErrors.push(`Target hash mismatch. Expected ${expectedTargetHash}, got ${targetHash}.`);
  }

  // 3. Read and parse written contents
  const sourceContent = fs.readFileSync(absSource, 'utf8');
  const targetContent = fs.readFileSync(absTarget, 'utf8');

  let sourceAst;
  let targetAst;

  try {
    sourceAst = parseAst(sourceContent, sourceFile);
  } catch (err) {
    validationErrors.push(`Post-write source parse failure: ${err.message}`);
  }

  try {
    targetAst = parseAst(targetContent, targetFile);
  } catch (err) {
    validationErrors.push(`Post-write target parse failure: ${err.message}`);
  }

  if (validationErrors.length > 0) {
    throw new PostWriteValidationError(
      `Post-write AST parse validation failed:\n  - ${validationErrors.join('\n  - ')}`,
      { validationErrors }
    );
  }

  // 4. Dependency graph verification
  const sourceGraph = buildDependencyGraph({ ast: sourceAst, relativePath: sourceFile });
  const targetGraph = buildDependencyGraph({ ast: targetAst, relativePath: targetFile });

  // Extracted symbol must exist in target graph declarations
  const targetDeclaredSymbols = targetGraph.declarations.map((d) => d.name || d.symbolName);
  if (!targetDeclaredSymbols.includes(candidate.symbol)) {
    validationErrors.push(
      `Target file "${targetFile}" does not declare extracted symbol "${candidate.symbol}".`
    );
  }

  // Extracted symbol must not be declared in source graph declarations
  const sourceDeclaredSymbols = sourceGraph.declarations.map((d) => d.name || d.symbolName);
  if (sourceDeclaredSymbols.includes(candidate.symbol)) {
    validationErrors.push(
      `Source file "${sourceFile}" still declares extracted symbol "${candidate.symbol}".`
    );
  }

  // Source graph should import extracted symbol
  const sourceImportedSymbols = sourceGraph.imports.map((imp) => imp.localName || imp.importedName);
  if (!sourceImportedSymbols.includes(candidate.symbol)) {
    validationErrors.push(
      `Source file "${sourceFile}" does not import extracted symbol "${candidate.symbol}".`
    );
  }

  // 5. Circular dependency check on updated local module graph
  try {
    const moduleGraph = await buildLocalModuleGraph({
      entryFiles: [sourceFile, targetFile],
      projectRoot: absProjectRoot
    });
    const cycleResult = detectImportCycles(moduleGraph, sourceFile);
    if (cycleResult.hasCycle) {
      validationErrors.push(
        `Circular dependency detected after writing files: ${cycleResult.cyclePath.join(' -> ')}`
      );
    }
  } catch (graphErr) {
    validationErrors.push(`Module graph verification failed: ${graphErr.message}`);
  }

  if (validationErrors.length > 0) {
    throw new PostWriteValidationError(
      `Post-write structural validation failed:\n  - ${validationErrors.join('\n  - ')}`,
      { validationErrors }
    );
  }

  return {
    preWrite: 'passed',
    postWrite: 'passed',
    sourceHash,
    targetHash
  };
}
