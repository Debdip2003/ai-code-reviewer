/**
 * Split Planner Orchestration module.
 * Safely parses source files, builds dependency graphs, detects extraction candidates,
 * validates target paths, and creates dry-run split plans with zero disk side-effects.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseJavaScript } from '../parser/parse-javascript.js';
import { buildDependencyGraph } from './dependency-graph.js';
import { detectSplitCandidates } from './candidate-detector.js';
import { resolveTargetPaths, normalizePath } from './target-path.js';
import { validateSplitPlan } from './plan-validator.js';
import { SplitInputError, SplitValidationError, SplitAIPlanningError } from './split-errors.js';

const SUPPORTED_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs']);

/**
 * Validates and reads input source file according to strict security and format rules.
 *
 * @param {string} filePath - Target file path.
 * @param {string} projectRoot - Absolute project root directory.
 * @param {number} [maxFileSizeKb=150] - Maximum file size in kilobytes.
 * @returns {Promise<{ absolutePath: string, relativePath: string, source: string }>}
 */
async function validateAndReadSource(filePath, projectRoot, maxFileSizeKb = 150) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new SplitInputError('File path must be a non-empty string.', {
      filePath,
      reason: 'empty-path'
    });
  }

  const absProjectRoot = path.resolve(projectRoot || process.cwd());
  const absFilePath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(absProjectRoot, filePath);

  // 1. Project containment check
  if (!absFilePath.startsWith(absProjectRoot)) {
    throw new SplitInputError(`File "${filePath}" is outside the project root directory.`, {
      filePath,
      reason: 'outside-project-root'
    });
  }

  // 2. Existence and file type check
  let lstat;
  try {
    lstat = await fs.lstat(absFilePath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new SplitInputError(`File not found: "${filePath}"`, {
        filePath,
        reason: 'not-found',
        cause: err
      });
    }
    throw new SplitInputError(`Failed to access file "${filePath}": ${err.message}`, {
      filePath,
      reason: 'access-error',
      cause: err
    });
  }

  if (lstat.isSymbolicLink()) {
    throw new SplitInputError(`Symbolic links are not supported for splitting: "${filePath}"`, {
      filePath,
      reason: 'symlink'
    });
  }

  if (lstat.isDirectory()) {
    throw new SplitInputError(`Expected a file but found directory: "${filePath}"`, {
      filePath,
      reason: 'is-directory'
    });
  }

  if (!lstat.isFile()) {
    throw new SplitInputError(`Target is not a regular file: "${filePath}"`, {
      filePath,
      reason: 'not-a-file'
    });
  }

  // 3. Extension check
  const ext = path.extname(absFilePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new SplitInputError(
      `Unsupported file extension "${ext}". Supported extensions: .js, .jsx, .mjs, .cjs`,
      { filePath, reason: 'unsupported-extension' }
    );
  }


  // 4. File size check
  const maxBytes = maxFileSizeKb * 1024;
  if (lstat.size > maxBytes) {
    throw new SplitInputError(
      `File size (${Math.round(lstat.size / 1024)} KB) exceeds maximum limit of ${maxFileSizeKb} KB: "${filePath}"`,
      { filePath, reason: 'file-too-large' }
    );
  }

  // 5. Read file as UTF-8
  let source;
  try {
    source = await fs.readFile(absFilePath, 'utf-8');
  } catch (err) {
    throw new SplitInputError(`Failed to read file "${filePath}": ${err.message}`, {
      filePath,
      reason: 'read-error',
      cause: err
    });
  }

  // 6. Binary / null byte check
  if (source.includes('\0')) {
    throw new SplitInputError(`Cannot split binary or null-byte containing file: "${filePath}"`, {
      filePath,
      reason: 'binary-file'
    });
  }

  const relativePath = normalizePath(path.relative(absProjectRoot, absFilePath));

  return {
    absolutePath: absFilePath,
    relativePath,
    source
  };
}

/**
 * Creates a complete, validated, read-only code splitting plan.
 *
 * @param {Object} params
 * @param {string} [params.projectRoot=process.cwd()] - Project root path.
 * @param {string} params.filePath - Source file to analyze.
 * @param {Object} [params.config={}] - Resolved configuration object.
 * @param {import('../ai/provider-base.js').AIProvider} [params.aiProvider] - Optional AI provider instance.
 * @param {AbortSignal} [params.signal] - Cancellation signal.
 * @returns {Promise<{
 *   plan: Object,
 *   valid: boolean,
 *   errors: string[],
 *   warnings: string[],
 *   dependencyGraph: Object
 * }>}
 * @throws {SplitInputError} If input file validation fails.
 * @throws {SplitValidationError} If plan validation fails unexpectedly.
 * @throws {import('../parser/parse-javascript.js').JavaScriptParseError} If AST parsing fails.
 */
export async function createSplitPlan({
  projectRoot = process.cwd(),
  filePath,
  config = {},
  aiProvider = null,
  signal = null
}) {
  const maxFileSizeKb = config.maxFileSizeKb || 150;
  const splitterOptions = config.splitter || {};

  // 1. Input Validation & Read
  const { relativePath, source } = await validateAndReadSource(
    filePath,
    projectRoot,
    maxFileSizeKb
  );

  if (signal?.aborted) {
    const abortErr = new Error('Split planning operation aborted.');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  // 2. Parse AST
  const ast = parseJavaScript({
    source,
    filePath: relativePath
  });

  if (signal?.aborted) {
    const abortErr = new Error('Split planning operation aborted.');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  // 3. Build Dependency Graph
  const dependencyGraph = buildDependencyGraph({
    ast,
    relativePath
  });

  // Source code line summary
  const sourceLines = source.split(/\r?\n/).length;
  const declarationCount = dependencyGraph.declarations.length;
  const importCount = dependencyGraph.imports.length;
  const exportCount = dependencyGraph.declarations.filter((d) => d.exported).length;

  // 4. Candidate Detection
  let detectedCandidates = detectSplitCandidates({
    ast,
    source,
    relativePath,
    dependencyGraph,
    options: splitterOptions
  });

  // 5. Target Path Resolution
  const targetDirOption = splitterOptions.targetDirectory || null;
  const targetResolution = resolveTargetPaths({
    candidates: detectedCandidates,
    sourceFile: relativePath,
    projectRoot,
    targetDirectory: targetDirOption
  });

  let candidatesWithTargets = targetResolution.candidatesWithTargets;
  const warnings = targetResolution.conflicts.map((c) => c.reason);

  // 6. Optional AI Planning Refinement
  const isAiEnabled = Boolean(splitterOptions.aiPlanning && aiProvider);
  if (isAiEnabled && candidatesWithTargets.length > 0) {
    try {
      const aiResult = await aiProvider.planSplit({
        sourceFile: relativePath,
        source,
        candidates: candidatesWithTargets,
        model: config.ai?.model,
        maxOutputTokens: config.ai?.maxOutputTokens,
        signal
      });

      if (aiResult && Array.isArray(aiResult.candidates)) {
        const aiMap = new Map();
        for (const item of aiResult.candidates) {
          if (item && item.id) {
            aiMap.set(item.id, item);
          }
        }

        // Merge AI refinements while strictly preserving deterministic properties
        candidatesWithTargets = candidatesWithTargets.map((cand) => {
          const aiEnhancement = aiMap.get(cand.id);
          if (!aiEnhancement) return cand;

          const updatedReason =
            typeof aiEnhancement.reason === 'string' && aiEnhancement.reason.trim().length > 0
              ? aiEnhancement.reason.trim()
              : cand.reason;

          const updatedConfidence =
            typeof aiEnhancement.confidence === 'number' &&
            aiEnhancement.confidence >= 0 &&
            aiEnhancement.confidence <= 1
              ? aiEnhancement.confidence
              : cand.confidence;

          const additionalRisks = Array.isArray(aiEnhancement.additionalRisks)
            ? aiEnhancement.additionalRisks.filter((r) => typeof r === 'string' && r.trim().length > 0)
            : [];

          const mergedRisks = Array.from(new Set([...cand.risks, ...additionalRisks]));

          return {
            ...cand,
            reason: updatedReason,
            confidence: updatedConfidence,
            risks: mergedRisks,
            // AI cannot make an unsafe candidate safe
            safeForFutureExtraction: cand.safeForFutureExtraction && mergedRisks.length === 0
          };
        });
      }
    } catch (aiErr) {
      if (signal?.aborted) throw aiErr;
      throw new SplitAIPlanningError(`AI planning failed: ${aiErr.message}`, aiErr);
    }
  }

  // 7. Assemble Draft Plan
  const safeCount = candidatesWithTargets.filter((c) => c.safeForFutureExtraction).length;
  const unsafeCount = candidatesWithTargets.filter((c) => !c.safeForFutureExtraction).length;
  const conflictCount = targetResolution.conflicts.length;

  const draftPlan = {
    version: 1,
    mode: 'dry-run',
    sourceFile: relativePath,
    targetDirectory: targetResolution.targetDirectory,
    sourceSummary: {
      lines: sourceLines,
      declarations: declarationCount,
      imports: importCount,
      exports: exportCount
    },
    candidates: candidatesWithTargets,
    warnings,
    summary: {
      detected: candidatesWithTargets.length,
      safe: safeCount,
      unsafe: unsafeCount,
      conflicts: conflictCount
    }
  };

  // 8. Validate Final Plan
  const validation = validateSplitPlan({
    plan: draftPlan,
    dependencyGraph,
    projectRoot
  });

  if (!validation.valid) {
    throw new SplitValidationError(
      `Split plan validation failed with ${validation.errors.length} error(s):\n${validation.errors.map((e) => `  - ${e}`).join('\n')}`,
      { validationErrors: validation.errors }
    );
  }

  return {
    plan: validation.plan,
    valid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
    dependencyGraph
  };
}
