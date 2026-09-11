/**
 * Target Path Resolution module for ACR Splitter.
 * Deterministically proposes target file paths for split candidates without disk mutations.
 */

import path from 'node:path';
import fsSync from 'node:fs';

/**
 * Normalizes a file path to use forward slashes.
 * @param {string} p
 * @returns {string}
 */
export function normalizePath(p) {
  if (typeof p !== 'string') return '';
  return p.replace(/\\/g, '/');
}

/**
 * Sanitizes a string for safe filesystem usage.
 * @param {string} name
 * @returns {string}
 */
function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9_.-]/g, '');
}

/**
 * Extracts a domain name prefix from symbol name or source file.
 * e.g., 'fetchProducts' in 'ProductPage.jsx' -> 'product'
 * @param {string} symbolName
 * @param {string} sourceFile
 * @returns {string}
 */
function deriveDomainPrefix(symbolName, sourceFile) {
  let cleanBase = '';
  if (sourceFile) {
    const fileBase = path.basename(sourceFile, path.extname(sourceFile));
    cleanBase = fileBase.replace(/(?:[-_.]?(?:page|view|screen|container|component))+$/i, '').toLowerCase();
    cleanBase = cleanBase.replace(/[-_.]+$/, '');
    if (cleanBase.endsWith('s') && cleanBase.length > 3) {
      cleanBase = cleanBase.slice(0, -1);
    }
  }


  if (cleanBase && !['index', 'main', 'app', 'mod', 'module'].includes(cleanBase)) {
    return cleanBase;
  }

  if (symbolName) {
    let clean = symbolName.replace(/^(fetch|get|post|put|delete|update|handle|use|format|calc|calculate)/i, '');
    clean = clean.replace(/(Service|Utils|Constants|Labels|Config|Data|State|Status)$/i, '');
    if (clean.length > 0) {
      const domain = clean.toLowerCase();
      if (domain.endsWith('s') && domain.length > 3) {
        return domain.slice(0, -1);
      }
      return domain;
    }
  }

  return cleanBase || 'common';
}


/**
 * Proposes a filename for a candidate based on its kind and symbol name.
 *
 * @param {Object} candidate
 * @param {'react-component' | 'custom-hook' | 'utility' | 'service' | 'constant-group'} candidate.kind
 * @param {string} candidate.symbolName
 * @param {string} sourceFile - Relative path of the source file.
 * @returns {string} Target filename with extension.
 */
export function proposeFileName(candidate, sourceFile) {
  const { kind, symbolName } = candidate;
  const safeSymbol = sanitizeFileName(symbolName);
  const domain = deriveDomainPrefix(symbolName, sourceFile);

  switch (kind) {
    case 'react-component':
      return `${safeSymbol}.jsx`;

    case 'custom-hook':
      return `${safeSymbol}.js`;

    case 'service':
      return `${domain}.service.js`;

    case 'utility':
      return `${domain}.utils.js`;

    case 'constant-group':
      return `${domain}.constants.js`;

    default:
      return `${safeSymbol}.js`;
  }
}

/**
 * Proposes the default target directory for a source file.
 * e.g., 'src/ProductPage.jsx' -> 'src/ProductPage'
 *
 * @param {string} sourceFile - Relative path to source file.
 * @returns {string} Normalized target directory relative path.
 */
export function getDefaultTargetDirectory(sourceFile) {
  const dir = path.dirname(sourceFile);
  const baseName = path.basename(sourceFile, path.extname(sourceFile));
  if (dir === '.' || dir === '') {
    return baseName;
  }
  return normalizePath(path.join(dir, baseName));
}

/**
 * Resolves proposed target paths for all candidates in a split plan.
 *
 * @param {Object} params
 * @param {Array<Object>} params.candidates - Detected candidate list.
 * @param {string} params.sourceFile - Relative source file path.
 * @param {string} params.projectRoot - Absolute project root directory.
 * @param {string | null} [params.targetDirectory] - Configured or CLI target directory.
 * @returns {{
 *   targetDirectory: string,
 *   candidatesWithTargets: Array<Object>,
 *   conflicts: Array<{ candidateId: string, targetFile: string, reason: string }>
 * }}
 */
export function resolveTargetPaths({
  candidates,
  sourceFile,
  projectRoot,
  targetDirectory = null
}) {
  const resolvedTargetDir = targetDirectory
    ? normalizePath(targetDirectory)
    : getDefaultTargetDirectory(sourceFile);

  // Validate target directory doesn't escape project root
  const absTargetDir = path.resolve(projectRoot, resolvedTargetDir);
  const absProjectRoot = path.resolve(projectRoot);

  if (!absTargetDir.startsWith(absProjectRoot)) {
    throw new Error(`Target directory "${resolvedTargetDir}" escapes project root.`);
  }

  const conflicts = [];
  const allocatedTargets = new Map(); // targetFile -> candidateId

  const candidatesWithTargets = candidates.map((cand) => {
    let fileName = proposeFileName(cand, sourceFile);
    let targetRelative = normalizePath(path.join(resolvedTargetDir, fileName));

    // Handle duplicate target files within same plan by grouping or unique suffixes
    if (allocatedTargets.has(targetRelative) && allocatedTargets.get(targetRelative) !== cand.id) {
      const existingCandId = allocatedTargets.get(targetRelative);
      const existingCand = candidates.find((c) => c.id === existingCandId);
      // If both candidates have the same kind (e.g. utilities), they can share the target file or be differentiated
      if (existingCand && existingCand.kind !== cand.kind) {
        fileName = `${sanitizeFileName(cand.symbolName)}.js`;
        targetRelative = normalizePath(path.join(resolvedTargetDir, fileName));
      }
    }
    allocatedTargets.set(targetRelative, cand.id);

    // Check if target file already exists on disk
    const absTargetFile = path.resolve(projectRoot, targetRelative);
    if (fsSync.existsSync(absTargetFile)) {
      conflicts.push({
        candidateId: cand.id,
        targetFile: targetRelative,
        reason: `Target file already exists: "${targetRelative}"`
      });
    }

    return {
      ...cand,
      targetFile: targetRelative
    };
  });

  return {
    targetDirectory: resolvedTargetDir,
    candidatesWithTargets,
    conflicts
  };
}
