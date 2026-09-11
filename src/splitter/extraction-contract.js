/**
 * Extraction Contract module for ACR Code Splitter.
 * Formulates the complete boundary contract describing all data, bindings, imports,
 * exports, and dependencies crossing the extraction boundary.
 */

import { traverse } from './ast-utils.js';

/**
 * Maps conventional event handler names to standard callback prop names.
 * e.g., 'handleDelete' -> 'onDelete', 'handleChange' -> 'onChange'
 *
 * @param {string} name
 * @returns {string}
 */
export function mapConventionalPropName(name) {
  if (typeof name !== 'string') return name;

  const match = name.match(/^handle([A-Z].*)$/);
  if (match) {
    return `on${match[1]}`;
  }

  return name;
}

/**
 * Determines how a captured binding is used within a candidate function node.
 *
 * @param {import('@babel/types').Node} candidateNode
 * @param {string} bindingName
 * @returns {'call' | 'mutate' | 'read'}
 */
export function analyzeBindingUsage(candidateNode, bindingName) {
  if (!candidateNode) return 'read';

  let hasCall = false;
  let hasMutation = false;

  function walk(node) {
    if (!node || typeof node !== 'object' || hasMutation) return;

    if (
      (node.type === 'AssignmentExpression' && node.left?.name === bindingName) ||
      (node.type === 'UpdateExpression' && node.argument?.name === bindingName)
    ) {
      hasMutation = true;
      return;
    }

    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === bindingName
    ) {
      hasCall = true;
    }

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'tokens' || key === 'comments' || key === 'parent') continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (const child of val) {
          if (child && typeof child === 'object') walk(child);
        }
      } else if (val && typeof val === 'object') {
        walk(val);
      }
    }
  }

  walk(candidateNode);

  if (hasMutation) return 'mutate';
  if (hasCall) return 'call';
  return 'read';
}

/**
 * Creates the extraction contract for a selected candidate.
 *
 * @param {Object} params
 * @param {Object} params.candidate - Selected split candidate.
 * @param {Object} params.dependencyGraph - Dependency graph of the source file.
 * @param {import('@babel/types').File} [params.ast] - Source file AST.
 * @param {string[]} [params.movedDependencies=[]] - Declarations moving with candidate.
 * @param {string[]} [params.remainingDependencies=[]] - Declarations remaining in source.
 * @returns {Object} Validated extraction contract matching ExtractionContractSchema.
 */
export function createExtractionContract({
  candidate,
  dependencyGraph,
  ast: _ast,
  candidateNode = null,
  movedDependencies = [],
  remainingDependencies = []
}) {
  const capturedBindings = [];

  // Inspect each captured binding
  const rawCaptured = candidate.capturedBindings || [];
  for (const bindingName of rawCaptured) {
    const usage = candidateNode
      ? analyzeBindingUsage(candidateNode, bindingName)
      : bindingName.startsWith('handle')
        ? 'call'
        : 'read';

    if (candidate.kind === 'react-component') {
      const propName = mapConventionalPropName(bindingName);
      capturedBindings.push({
        name: bindingName,
        usage,
        resolution: usage === 'mutate' ? 'unresolved' : 'prop',
        propName
      });
    } else if (candidate.kind === 'utility' || candidate.kind === 'service' || candidate.kind === 'custom-hook') {
      capturedBindings.push({
        name: bindingName,
        usage,
        resolution: usage === 'mutate' ? 'unresolved' : 'parameter',
        parameterName: bindingName
      });
    } else {
      capturedBindings.push({
        name: bindingName,
        usage,
        resolution: 'remain-in-source'
      });
    }
  }

  // Calculate external imports used by the candidate and moved dependencies
  const symbolsToExtract = new Set([candidate.symbolName, ...movedDependencies]);
  const requiredImportSpecifiers = new Map(); // sourceModule -> Set of specifier names
  const importTypes = new Map(); // sourceModule -> 'named' | 'default' | 'namespace'

  for (const imp of dependencyGraph.imports || []) {
    const matchingSpecifiers = (imp.specifiers || []).filter((s) => {
      // Check if candidate or moved dependencies use this import
      return symbolsToExtract.has(s.local) || (candidate.externalImports || []).includes(s.local);
    });

    if (matchingSpecifiers.length > 0 || (candidate.externalImports || []).some((ext) => ext === imp.source)) {
      if (!requiredImportSpecifiers.has(imp.source)) {
        requiredImportSpecifiers.set(imp.source, new Set());
        importTypes.set(imp.source, imp.kind || 'named');
      }
      for (const s of matchingSpecifiers) {
        requiredImportSpecifiers.get(imp.source).add(s.imported || s.local);
      }
    }
  }

  const contractImports = [];
  for (const [source, specSet] of requiredImportSpecifiers.entries()) {
    contractImports.push({
      source,
      imported: Array.from(specSet).sort(),
      type: importTypes.get(source) || 'named',
      isExternal: !source.startsWith('.')
    });
  }

  // Exports from target file
  const contractExports = [
    {
      name: candidate.symbolName,
      type: 'named'
    }
  ];

  for (const movedDep of movedDependencies) {
    // If a moved dependency was originally exported or needed by others, export it
    const decl = (dependencyGraph.declarations || []).find((d) => d.name === movedDep);
    if (decl && decl.exported) {
      contractExports.push({
        name: movedDep,
        type: 'named'
      });
    }
  }

  return {
    symbol: candidate.symbolName,
    kind: candidate.kind,
    capturedBindings,
    imports: contractImports,
    exports: contractExports,
    movedDependencies: [...movedDependencies].sort(),
    remainingDependencies: [...remainingDependencies].sort()
  };
}
