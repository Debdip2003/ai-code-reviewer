/**
 * Dependency Placement module for ACR Code Splitter.
 * Deterministically decides whether related declarations (constants, sub-helpers)
 * should move to the target file, remain in the source file, or block extraction.
 */

/**
 * Plans placement of dependencies for a selected candidate.
 *
 * @param {Object} params
 * @param {Object} params.candidate - Selected split candidate.
 * @param {Object} params.dependencyGraph - Dependency graph of the source file.
 * @returns {{
 *   movedDependencies: string[],
 *   remainingDependencies: string[],
 *   blockedReasons: string[]
 * }}
 */
export function planDependencyPlacement({ candidate, dependencyGraph }) {
  const movedDependencies = new Set();
  const remainingDependencies = new Set();
  const blockedReasons = [];

  const candidateSymbol = candidate.symbolName;
  const directDeps = candidate.dependencies || [];

  for (const depName of directDeps) {
    const decl = (dependencyGraph.declarations || []).find((d) => d.name === depName);
    if (!decl) {
      // External or unresolved import
      continue;
    }

    // Check who depends on this declaration
    const dependents = decl.dependents || [];
    const otherDependents = dependents.filter(
      (dep) => dep !== candidateSymbol && !movedDependencies.has(dep)
    );

    // If used exclusively by candidate, and not exported as primary page component
    const isExclusive = otherDependents.length === 0;
    const isConstantOrSmallHelper =
      decl.kind === 'constant' || decl.kind === 'variable' || (decl.kind === 'function' && !decl.exported);

    if (isExclusive && isConstantOrSmallHelper) {
      // Check initialization order: if decl appears after candidate in source, moving together is fine
      movedDependencies.add(depName);
    } else {
      remainingDependencies.add(depName);
    }
  }

  // Iteratively check dependencies of moved dependencies
  let changed = true;
  while (changed) {
    changed = false;
    for (const movedName of Array.from(movedDependencies)) {
      const decl = (dependencyGraph.declarations || []).find((d) => d.name === movedName);
      if (!decl) continue;

      for (const subDep of decl.dependencies || []) {
        if (movedDependencies.has(subDep) || remainingDependencies.has(subDep)) continue;
        const subDecl = (dependencyGraph.declarations || []).find((d) => d.name === subDep);
        if (!subDecl) continue;

        const otherUsers = (subDecl.dependents || []).filter(
          (user) => user !== candidateSymbol && !movedDependencies.has(user)
        );

        if (otherUsers.length === 0 && (subDecl.kind === 'constant' || subDecl.kind === 'variable')) {
          movedDependencies.add(subDep);
          changed = true;
        } else {
          remainingDependencies.add(subDep);
        }
      }
    }
  }

  return {
    movedDependencies: Array.from(movedDependencies).sort(),
    remainingDependencies: Array.from(remainingDependencies).sort(),
    blockedReasons
  };
}
