/**
 * Cycle Detector module for ACR Code Splitter.
 * Traverses module dependency graphs using Depth-First Search to detect circular import paths.
 */

/**
 * Detects circular dependencies in a module dependency graph.
 *
 * @param {Map<string, Set<string>>} graph - Map of module -> Set of imported modules.
 * @param {string} [startFile] - Optional entry point to start DFS from.
 * @returns {{
 *   hasCycle: boolean,
 *   cyclePath: string[],
 *   cycles: Array<string[]>
 * }}
 */
export function detectImportCycles(graph, startFile = null) {
  const visited = new Set();
  const recursionStack = new Set();
  const currentPath = [];
  const cycles = [];

  function dfs(node) {
    visited.add(node);
    recursionStack.add(node);
    currentPath.push(node);

    const neighbors = graph.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recursionStack.has(neighbor)) {
        // Cycle detected: extract subpath from neighbor to end of currentPath + neighbor
        const cycleStartIndex = currentPath.indexOf(neighbor);
        if (cycleStartIndex !== -1) {
          const cycleTrace = [...currentPath.slice(cycleStartIndex), neighbor];
          cycles.push(cycleTrace);
        }
      }
    }

    currentPath.pop();
    recursionStack.delete(node);
  }

  if (startFile && graph.has(startFile)) {
    dfs(startFile);
  } else {
    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }
  }

  const hasCycle = cycles.length > 0;
  const cyclePath = hasCycle ? cycles[0] : [];

  return {
    hasCycle,
    cyclePath,
    cycles
  };
}
