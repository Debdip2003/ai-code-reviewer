/**
 * Plan Validator module for ACR Splitter.
 * Performs deep semantic, structural, and safety validation of proposed split plans.
 */

import path from 'node:path';
import fsSync from 'node:fs';
import { SplitPlanSchema } from './split-plan-schema.js';

/**
 * Validates a code splitting plan against the AST dependency graph and filesystem safety constraints.
 *
 * @param {Object} params
 * @param {Object} params.plan - Split plan object.
 * @param {Object} params.dependencyGraph - AST dependency graph.
 * @param {string} params.projectRoot - Project root directory path.
 * @returns {{
 *   valid: boolean,
 *   errors: string[],
 *   warnings: string[],
 *   plan: Object
 * }}
 */
export function validateSplitPlan({ plan, dependencyGraph, projectRoot }) {
  const errors = [];
  const warnings = [...(plan?.warnings || [])];

  // 1. Zod Schema Validation
  const schemaResult = SplitPlanSchema.safeParse(plan);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      const fieldPath = issue.path.length > 0 ? issue.path.join('.') : 'plan';
      errors.push(`Schema validation failed at ${fieldPath}: ${issue.message}`);
    }
    return {
      valid: false,
      errors,
      warnings,
      plan
    };
  }

  const validatedPlan = schemaResult.data;
  const absProjectRoot = path.resolve(projectRoot || process.cwd());

  // 2. Declaration & Range Validation
  const declMap = new Map();
  if (dependencyGraph?.declarations) {
    for (const decl of dependencyGraph.declarations) {
      declMap.set(decl.name, decl);
    }
  }

  const seenCandidateIds = new Set();
  const seenTargetFiles = new Set();

  for (const cand of validatedPlan.candidates) {
    // Unique ID check
    if (seenCandidateIds.has(cand.id)) {
      errors.push(`Duplicate candidate ID: "${cand.id}".`);
    }
    seenCandidateIds.add(cand.id);

    // Range validity against source file lines
    if (cand.lineEnd > validatedPlan.sourceSummary.lines) {
      errors.push(
        `Candidate "${cand.symbolName}" line range (${cand.lineStart}–${cand.lineEnd}) exceeds source file length (${validatedPlan.sourceSummary.lines} lines).`
      );
    }

    // Source and target path collision
    if (cand.targetFile === validatedPlan.sourceFile) {
      errors.push(
        `Candidate "${cand.symbolName}" target path cannot be identical to the source file: "${cand.targetFile}".`
      );
    }

    // Target file path safety & project containment
    const absTarget = path.resolve(absProjectRoot, cand.targetFile);
    if (!absTarget.startsWith(absProjectRoot)) {
      errors.push(`Target path "${cand.targetFile}" escapes project root.`);
    }

    // Existing file check on disk
    if (fsSync.existsSync(absTarget)) {
      warnings.push(`Target file already exists on disk: "${cand.targetFile}".`);
    }

    // Duplicate target file check within same plan (unless same group)
    if (seenTargetFiles.has(cand.targetFile)) {
      // If two distinct components target the exact same file, emit warning
      const otherSameTarget = validatedPlan.candidates.find(
        (c) => c.id !== cand.id && c.targetFile === cand.targetFile
      );
      if (otherSameTarget && otherSameTarget.kind !== cand.kind) {
        errors.push(
          `Candidates "${cand.symbolName}" and "${otherSameTarget.symbolName}" collide on target file "${cand.targetFile}".`
        );
      }
    }
    seenTargetFiles.add(cand.targetFile);

    // Captured bindings check for safe candidates
    if (cand.safeForFutureExtraction && cand.capturedBindings && cand.capturedBindings.length > 0) {
      errors.push(
        `Candidate "${cand.symbolName}" is marked safe but has unresolved captured bindings: ${cand.capturedBindings.join(', ')}.`
      );
    }

    // Dependencies existence check
    for (const dep of cand.dependencies) {
      const isKnownDecl = declMap.has(dep);
      const isExternal = cand.externalImports && cand.externalImports.includes(dep);
      if (!isKnownDecl && !isExternal) {
        // Warning if dependency is unresolved
        warnings.push(`Candidate "${cand.symbolName}" references unresolved dependency "${dep}".`);
      }
    }
  }

  // 3. Circular Dependency Detection
  const candidateNames = new Set(validatedPlan.candidates.map((c) => c.symbolName));
  for (const cand of validatedPlan.candidates) {
    for (const dep of cand.dependencies) {
      if (candidateNames.has(dep)) {
        const depCand = validatedPlan.candidates.find((c) => c.symbolName === dep);
        if (depCand && depCand.dependencies.includes(cand.symbolName)) {
          warnings.push(
            `Circular dependency detected between candidate "${cand.symbolName}" and "${depCand.symbolName}".`
          );
        }
      }
    }
  }

  // 4. Summary counts matching
  const safeCount = validatedPlan.candidates.filter((c) => c.safeForFutureExtraction).length;
  const unsafeCount = validatedPlan.candidates.filter((c) => !c.safeForFutureExtraction).length;

  if (
    validatedPlan.summary.detected !== validatedPlan.candidates.length ||
    validatedPlan.summary.safe !== safeCount ||
    validatedPlan.summary.unsafe !== unsafeCount
  ) {
    errors.push('Summary metrics do not match candidate counts.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: Array.from(new Set(warnings)),
    plan: validatedPlan
  };
}
