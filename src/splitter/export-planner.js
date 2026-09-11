/**
 * Export Planner module for ACR Code Splitter.
 * Plans exports for the extracted target file and handles re-exports in the source file
 * to preserve public API compatibility.
 */

/**
 * Plans exports for target and source files.
 *
 * @param {Object} params
 * @param {Object} params.candidate - Candidate definition.
 * @param {string[]} params.movedDependencies - Moved dependency symbols.
 * @param {Object} params.dependencyGraph - Dependency graph.
 * @param {string} params.targetFile - Target file relative path.
 * @param {string} params.sourceFile - Source file relative path.
 * @returns {{
 *   targetExports: Array<{ name: string, type: 'named' | 'default' }>,
 *   sourceReExports: Array<{ name: string, type: 'named' | 'default', source: string }>,
 *   nameCollisions: string[]
 * }}
 */
export function planExports({
  candidate,
  movedDependencies = [],
  dependencyGraph,
  targetFile: _targetFile,
  sourceFile: _sourceFile
}) {
  const targetExports = [
    {
      name: candidate.symbolName,
      type: 'named'
    }
  ];

  const sourceReExports = [];
  const nameCollisions = [];

  // Check if original declaration in source was exported
  const originalDecl = (dependencyGraph.declarations || []).find(
    (d) => d.name === candidate.symbolName
  );

  if (originalDecl?.exported) {
    sourceReExports.push({
      name: candidate.symbolName,
      type: originalDecl.defaultExport ? 'default' : 'named',
      source: candidate.symbolName
    });
  }

  // Check moved dependencies
  for (const movedDep of movedDependencies) {
    const depDecl = (dependencyGraph.declarations || []).find((d) => d.name === movedDep);
    if (depDecl?.exported) {
      targetExports.push({
        name: movedDep,
        type: 'named'
      });
      sourceReExports.push({
        name: movedDep,
        type: 'named',
        source: movedDep
      });
    }
  }

  return {
    targetExports,
    sourceReExports,
    nameCollisions
  };
}
