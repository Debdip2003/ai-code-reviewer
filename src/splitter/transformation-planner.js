/**
 * Transformation Planner module for ACR Code Splitter.
 * Orchestrates full preview pipeline: candidate verification, target validation,
 * boundary contract formulation, prop planning, import/export planning, cycle detection,
 * AST code generation, and validation.
 */

import fsSync from 'node:fs';
import path from 'node:path';
import { parseAst, containsJsx, containsTypeScriptSyntax } from './ast-utils.js';
import { buildDependencyGraph } from './dependency-graph.js';
import { detectSplitCandidates } from './candidate-detector.js';
import { proposeFileName, getDefaultTargetDirectory, normalizePath } from './target-path.js';
import { planDependencyPlacement } from './dependency-placement.js';
import { createExtractionContract } from './extraction-contract.js';
import { planReactProps } from './prop-planner.js';
import { planImports } from './import-planner.js';
import { planExports } from './export-planner.js';
import { buildLocalModuleGraph } from './module-graph.js';
import { detectImportCycles } from './cycle-detector.js';
import { generateTransformationPreviews } from './preview-generator.js';
import { TransformationPlanSchema } from './transformation-plan-schema.js';
import {
  CandidateNotFoundError,
  TargetCollisionError,
  TargetOutsideProjectError,
  TransformationValidationError
} from './split-errors.js';
import { calculateSha256 } from './apply/write-utils.js';

/**
 * Creates a validated in-memory code-splitting transformation plan for a selected candidate.
 *
 * @param {Object} params
 * @param {string} [params.projectRoot=process.cwd()] - Project root directory.
 * @param {string} params.filePath - Source file path.
 * @param {string} params.candidateId - Selected candidate identifier.
 * @param {string} [params.targetPathOverride] - User-supplied target file path.
 * @param {boolean} [params.includePreview=false] - Whether to include full source code preview.
 * @param {Object} [params.config={}] - Configuration options.
 * @param {AbortSignal} [params.signal] - Cancellation signal.
 * @returns {Promise<{
 *   plan: Object,
 *   proposedSourceCode: string,
 *   proposedTargetCode: string
 * }>}
 */
export async function createTransformationPlan({
  projectRoot = process.cwd(),
  filePath,
  candidateId,
  targetPathOverride = null,
  includePreview = false,
  config = {},
  signal = null
}) {
  const absProjectRoot = path.resolve(projectRoot);
  const absFilePath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(absProjectRoot, filePath);

  if (!absFilePath.startsWith(absProjectRoot)) {
    throw new TargetOutsideProjectError(`Source file "${filePath}" is outside the project root.`, {
      targetPath: filePath,
      projectRoot: absProjectRoot
    });
  }

  const relativeSourcePath = normalizePath(path.relative(absProjectRoot, absFilePath));
  const sourceCode = fsSync.readFileSync(absFilePath, 'utf-8');

  if (signal?.aborted) {
    const abortErr = new Error('Transformation planning aborted.');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  // 1. Parse AST
  const ast = parseAst(sourceCode, relativeSourcePath);

  // 2. Build Dependency Graph
  const dependencyGraph = buildDependencyGraph({
    ast,
    relativePath: relativeSourcePath
  });

  // 3. Detect Candidates
  const candidates = detectSplitCandidates({
    ast,
    source: sourceCode,
    relativePath: relativeSourcePath,
    dependencyGraph,
    options: config.splitter || {}
  });

  // 4. Find Selected Candidate
  const selectedCandidate = candidates.find(
    (c) => c.id === candidateId || c.symbolName === candidateId
  );

  if (!selectedCandidate) {
    const validIds = candidates.map((c) => c.id);
    throw new CandidateNotFoundError(
      `Candidate "${candidateId}" was not found in "${relativeSourcePath}".\n` +
        `Available candidates: ${validIds.length > 0 ? validIds.join(', ') : 'none'}`,
      {
        candidateId,
        validCandidates: validIds,
        filePath: relativeSourcePath
      }
    );
  }

  // 5. Target Path Resolution & Validation
  let targetFile;
  const validationErrors = [];
  const validationWarnings = [];

  if (targetPathOverride) {
    const absOverride = path.isAbsolute(targetPathOverride)
      ? path.resolve(targetPathOverride)
      : path.resolve(absProjectRoot, targetPathOverride);

    if (!absOverride.startsWith(absProjectRoot)) {
      throw new TargetOutsideProjectError(
        `Target path "${targetPathOverride}" is outside the project root.`,
        {
          targetPath: targetPathOverride,
          projectRoot: absProjectRoot
        }
      );
    }

    targetFile = normalizePath(path.relative(absProjectRoot, absOverride));
  } else {
    const defaultDir = config.splitter?.targetDirectory || getDefaultTargetDirectory(relativeSourcePath);
    let fileName = proposeFileName(selectedCandidate, relativeSourcePath);

    // Adjust extension if candidate contains JSX
    const isJsx = containsJsx(ast);
    const isTs = containsTypeScriptSyntax(ast);
    if (isJsx && selectedCandidate.kind === 'react-component' && !fileName.endsWith('.jsx') && !fileName.endsWith('.tsx')) {
      fileName = isTs ? fileName.replace(/\.ts$/, '.tsx') : fileName.replace(/\.js$/, '.jsx');
    }

    targetFile = normalizePath(path.join(defaultDir, fileName));
  }

  if (targetFile === relativeSourcePath) {
    validationErrors.push(`Target path "${targetFile}" cannot be the same as the source file.`);
  }

  // Check target file collision on disk
  const absTarget = path.resolve(absProjectRoot, targetFile);
  if (fsSync.existsSync(absTarget)) {
    const collisionMsg = `Target file already exists on disk: "${targetFile}"`;
    validationErrors.push(collisionMsg);
  }

  // 6. Plan Dependency Placement
  const depPlacement = planDependencyPlacement({
    candidate: selectedCandidate,
    dependencyGraph
  });

  // 7. Formulate Extraction Boundary Contract
  const contract = createExtractionContract({
    candidate: selectedCandidate,
    dependencyGraph,
    ast,
    movedDependencies: depPlacement.movedDependencies,
    remainingDependencies: depPlacement.remainingDependencies
  });

  // 8. Plan React Props and Parameters
  const propPlan = planReactProps({
    candidate: selectedCandidate,
    capturedBindings: contract.capturedBindings
  });

  // 9. Plan Imports and Exports
  const importPlan = planImports({
    sourceFile: relativeSourcePath,
    targetFile,
    candidate: selectedCandidate,
    movedDependencies: depPlacement.movedDependencies,
    remainingDependencies: depPlacement.remainingDependencies,
    dependencyGraph
  });

  const exportPlan = planExports({
    candidate: selectedCandidate,
    movedDependencies: depPlacement.movedDependencies,
    dependencyGraph,
    targetFile,
    sourceFile: relativeSourcePath
  });

  // 10. Generate AST Previews
  const previewResult = generateTransformationPreviews({
    ast,
    candidate: selectedCandidate,
    sourceFile: relativeSourcePath,
    targetFile,
    extractionContract: contract,
    propPlan,
    importPlan,
    exportPlan,
    movedDependencies: depPlacement.movedDependencies
  });

  // 11. Validate Generated Code
  let sourceParseable = false;
  let targetParseable = false;

  try {
    parseAst(previewResult.proposedSourceCode, relativeSourcePath);
    sourceParseable = true;
  } catch (parseErr) {
    validationErrors.push(`Proposed source file failed to parse: ${parseErr.message}`);
  }

  try {
    parseAst(previewResult.proposedTargetCode, targetFile);
    targetParseable = true;
  } catch (parseErr) {
    validationErrors.push(`Proposed target file failed to parse: ${parseErr.message}`);
  }

  // 12. Check Circular Imports in Local Module Graph
  const fileContentOverrides = new Map([
    [relativeSourcePath, previewResult.proposedSourceCode],
    [targetFile, previewResult.proposedTargetCode]
  ]);

  let detectedCycles = [];
  try {
    const moduleGraph = await buildLocalModuleGraph({
      entryFiles: [relativeSourcePath, targetFile],
      projectRoot: absProjectRoot,
      fileContentOverrides
    });

    const cycleResult = detectImportCycles(moduleGraph, relativeSourcePath);
    if (cycleResult.hasCycle) {
      detectedCycles = cycleResult.cyclePath;
      validationErrors.push(`Circular dependency detected: ${cycleResult.cyclePath.join(' -> ')}`);
    }
  } catch {
    // Module graph error
  }

  // 13. Determine Final Safety Classification
  let safety = selectedCandidate.safety;

  if (
    validationErrors.length > 0 ||
    detectedCycles.length > 0 ||
    !sourceParseable ||
    !targetParseable ||
    contract.capturedBindings.some((b) => b.resolution === 'unresolved')
  ) {
    safety = 'blocked';
  } else if (contract.capturedBindings.length > 0 || selectedCandidate.risks?.length > 0) {
    safety = 'manual-review';
  } else {
    safety = 'automatic-ready';
  }

  // 14. Assemble Plan Object
  const unresolvedBindings = contract.capturedBindings
    .filter((b) => b.resolution === 'unresolved')
    .map((b) => b.name);

  const sourceHash = calculateSha256(sourceCode);
  const targetExisted = fsSync.existsSync(absTarget);

  const plan = {
    version: 2,
    mode: 'preview',
    sourceFile: relativeSourcePath,
    candidate: {
      id: selectedCandidate.id,
      symbol: selectedCandidate.symbolName,
      kind: selectedCandidate.kind,
      safety
    },
    targetFile,
    contract,
    operations: previewResult.operations,
    validation: {
      sourceParseable,
      targetParseable,
      unresolvedBindings,
      nameCollisions: exportPlan.nameCollisions || [],
      cycles: detectedCycles,
      errors: validationErrors,
      warnings: validationWarnings
    },
    sourceHash,
    before: {
      sourceHash,
      targetExisted
    },
    filesModified: 0
  };

  if (includePreview) {
    plan.preview = {
      source: previewResult.proposedSourceCode,
      target: previewResult.proposedTargetCode
    };
  }

  // Validate with Zod schema
  const validatedPlan = TransformationPlanSchema.parse(plan);

  return {
    plan: validatedPlan,
    proposedSourceCode: previewResult.proposedSourceCode,
    proposedTargetCode: previewResult.proposedTargetCode
  };
}
