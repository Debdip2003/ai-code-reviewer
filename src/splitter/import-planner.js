/**
 * Import Planner module for ACR Code Splitter.
 * Computes necessary imports for the extracted target file and source file,
 * handles POSIX relative path calculation, alias preservation, and import deduplication.
 */

import path from 'node:path';

/**
 * Calculates a POSIX-compliant relative module specifier between two repository-relative paths.
 * e.g., ('src/components/Dashboard.jsx', 'src/components/UserCard.jsx') -> './UserCard.jsx'
 * e.g., ('src/components/Dashboard.jsx', 'src/utils/format-date.js') -> '../utils/format-date.js'
 *
 * @param {string} fromFile - Relative path of importing file.
 * @param {string} toFile - Relative path of imported file.
 * @returns {string} POSIX relative import specifier starting with './' or '../'.
 */
export function calculateRelativeImportPath(fromFile, toFile) {
  const fromDir = path.dirname(fromFile);
  let rel = path.relative(fromDir, toFile).replace(/\\/g, '/');

  if (!rel.startsWith('.') && !rel.startsWith('/')) {
    rel = `./${rel}`;
  }

  return rel;
}

/**
 * Plans imports needed for the target file and source file.
 *
 * @param {Object} params
 * @param {string} params.sourceFile - Source file relative path.
 * @param {string} params.targetFile - Target file relative path.
 * @param {Object} params.candidate - Candidate definition.
 * @param {string[]} params.movedDependencies - Symbol names moving to target.
 * @param {string[]} params.remainingDependencies - Symbol names remaining in source needed by candidate.
 * @param {Object} params.dependencyGraph - Dependency graph of source file.
 * @returns {{
 *   targetImports: Array<{ source: string, specifiers: Array<{ local: string, imported: string, kind: string }>, kind: string }>,
 *   sourceNewImports: Array<{ source: string, specifiers: Array<{ local: string, imported: string, kind: string }>, kind: string }>,
 *   sourceImportsToRemove: string[]
 * }}
 */
export function planImports({
  sourceFile,
  targetFile,
  candidate,
  movedDependencies = [],
  remainingDependencies = [],
  dependencyGraph
}) {
  const movedSymbols = new Set([candidate.symbolName, ...movedDependencies]);
  const targetImportsMap = new Map(); // moduleSource -> Map<localName, { local, imported, kind }>

  // 1. Determine external imports needed by target
  for (const imp of dependencyGraph.imports || []) {
    for (const spec of imp.specifiers || []) {
      // If the candidate or moved dependencies use this imported symbol
      const isUsedByMoved =
        (candidate.externalImports || []).includes(spec.local) ||
        (candidate.dependencies || []).includes(spec.local) ||
        movedSymbols.has(spec.local);

      if (isUsedByMoved) {
        if (!targetImportsMap.has(imp.source)) {
          targetImportsMap.set(imp.source, new Map());
        }
        targetImportsMap.get(imp.source).set(spec.local, {
          local: spec.local,
          imported: spec.imported || spec.local,
          kind: spec.kind || imp.kind || 'named'
        });
      }
    }
  }

  // 2. If candidate needs remaining source declarations, import them from source file
  if (remainingDependencies.length > 0) {
    const relSourcePath = calculateRelativeImportPath(targetFile, sourceFile);
    if (!targetImportsMap.has(relSourcePath)) {
      targetImportsMap.set(relSourcePath, new Map());
    }
    for (const remDep of remainingDependencies) {
      targetImportsMap.get(relSourcePath).set(remDep, {
        local: remDep,
        imported: remDep,
        kind: 'named'
      });
    }
  }

  const targetImports = [];
  for (const [modSource, specMap] of targetImportsMap.entries()) {
    targetImports.push({
      source: modSource,
      specifiers: Array.from(specMap.values()).sort((a, b) => a.local.localeCompare(b.local)),
      kind: Array.from(specMap.values()).some((s) => s.kind === 'default') ? 'default' : 'named'
    });
  }

  // 3. Determine new imports required in source file from target file
  const relTargetPath = calculateRelativeImportPath(sourceFile, targetFile);
  const sourceNewImports = [
    {
      source: relTargetPath,
      specifiers: [
        {
          local: candidate.symbolName,
          imported: candidate.symbolName,
          kind: 'named'
        }
      ],
      kind: 'named'
    }
  ];

  return {
    targetImports,
    sourceNewImports,
    sourceImportsToRemove: []
  };
}
