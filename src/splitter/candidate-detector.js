/**
 * Split Candidate Detector module.
 * Analyzes AST and dependency graph to identify safe and manual-review extraction candidates.
 * Categories: react-component, custom-hook, utility, service, constant-group.
 */

import path from 'node:path';
import traversePkg from '@babel/traverse';
import { toKebabId } from './ast-utils.js';

// Safe interop for @babel/traverse CommonJS/ESM export
const traverse = traversePkg.default || traversePkg;

/**
 * Checks if a node returns JSX or React.createElement.
 * @param {Object} rootNode
 * @returns {boolean}
 */
function returnsJsx(rootNode) {
  if (!rootNode) return false;

  if (rootNode.type === 'JSXElement' || rootNode.type === 'JSXFragment') {
    return true;
  }

  if (
    rootNode.type === 'CallExpression' &&
    ((rootNode.callee.type === 'MemberExpression' &&
      rootNode.callee.object?.name === 'React' &&
      rootNode.callee.property?.name === 'createElement') ||
      (rootNode.callee.type === 'Identifier' && rootNode.callee.name === 'createElement'))
  ) {
    return true;
  }

  let found = false;

  function walk(node) {
    if (!node || typeof node !== 'object' || found) return;

    if (
      node !== rootNode &&
      (node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression' ||
        node.type === 'ObjectMethod' ||
        node.type === 'ClassMethod')
    ) {
      return;
    }

    if (node.type === 'ReturnStatement' && node.argument) {
      if (node.argument.type === 'JSXElement' || node.argument.type === 'JSXFragment') {
        found = true;
        return;
      }
      if (
        node.argument.type === 'CallExpression' &&
        ((node.argument.callee.type === 'MemberExpression' &&
          node.argument.callee.object?.name === 'React' &&
          node.argument.callee.property?.name === 'createElement') ||
          (node.argument.callee.type === 'Identifier' &&
            node.argument.callee.name === 'createElement'))
      ) {
        found = true;
        return;
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'tokens' || key === 'comments' || key === 'parent') {
        continue;
      }
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

  walk(rootNode);
  return found;
}

/**
 * Checks if a node calls React Hooks.
 * @param {Object} rootNode
 * @returns {boolean}
 */
function callsReactHooks(rootNode) {
  if (!rootNode) return false;
  let found = false;

  function walk(node) {
    if (!node || typeof node !== 'object' || found) return;

    if (node.type === 'CallExpression') {
      const callee = node.callee;
      if (callee.type === 'Identifier' && /^use[A-Z]/.test(callee.name)) {
        found = true;
        return;
      }
      if (
        callee.type === 'MemberExpression' &&
        callee.object?.name === 'React' &&
        /^use[A-Z]/.test(callee.property?.name || '')
      ) {
        found = true;
        return;
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'tokens' || key === 'comments' || key === 'parent') {
        continue;
      }
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

  walk(rootNode);
  return found;
}

/**
 * Checks if a node contains fetch, axios, or HTTP client calls, or storage calls.
 * @param {Object} rootNode
 * @returns {boolean}
 */
function performsExternalServiceOperations(rootNode) {
  if (!rootNode) return false;
  let found = false;

  function walk(node) {
    if (!node || typeof node !== 'object' || found) return;

    if (node.type === 'CallExpression') {
      const callee = node.callee;
      // Direct fetch call
      if (callee.type === 'Identifier' && callee.name === 'fetch') {
        found = true;
        return;
      }
      // axios / ky / apiClient / request calls
      if (
        callee.type === 'MemberExpression' &&
        ((callee.object?.name &&
          ['axios', 'ky', 'api', 'apiClient', 'http', 'client', 'localStorage', 'sessionStorage', 'indexedDB'].includes(
            callee.object.name
          )) ||
          ['get', 'post', 'put', 'delete', 'patch', 'request'].includes(callee.property?.name))
      ) {
        found = true;
        return;
      }
      if (
        callee.type === 'Identifier' &&
        ['apiClient', 'axios', 'request', 'postData', 'fetchData'].includes(callee.name)
      ) {
        found = true;
        return;
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'tokens' || key === 'comments' || key === 'parent') {
        continue;
      }
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

  walk(rootNode);
  return found;
}

/**
 * Checks if a node calls React hooks conditionally (e.g. inside if, loops, or logical expressions).
 * @param {Object} rootNode
 * @returns {boolean}
 */
function hasConditionalHooks(rootNode) {
  if (!rootNode) return false;
  let found = false;

  function walk(node, inConditional = false) {
    if (!node || typeof node !== 'object' || found) return;

    const isConditionalBoundary =
      inConditional ||
      node.type === 'IfStatement' ||
      node.type === 'SwitchStatement' ||
      node.type === 'WhileStatement' ||
      node.type === 'DoWhileStatement' ||
      node.type === 'ForStatement' ||
      node.type === 'ForInStatement' ||
      node.type === 'ForOfStatement' ||
      node.type === 'ConditionalExpression' ||
      node.type === 'LogicalExpression';

    if (inConditional && node.type === 'CallExpression') {
      const callee = node.callee;
      if (
        (callee.type === 'Identifier' && /^use[A-Z]/.test(callee.name)) ||
        (callee.type === 'MemberExpression' &&
          callee.object?.name === 'React' &&
          /^use[A-Z]/.test(callee.property?.name || ''))
      ) {
        found = true;
        return;
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'tokens' || key === 'comments' || key === 'parent') {
        continue;
      }
      const val = node[key];
      if (Array.isArray(val)) {
        for (const child of val) {
          if (child && typeof child === 'object') walk(child, isConditionalBoundary);
        }
      } else if (val && typeof val === 'object') {
        walk(val, isConditionalBoundary);
      }
    }
  }

  walk(rootNode, false);
  return found;
}

/**
 * Checks if a node contains eval, with, or dynamic unresolved features.
 * @param {Object} rootNode
 * @returns {string[]} Detected syntax risk messages.
 */
function inspectSyntaxRisks(rootNode) {
  const risks = [];
  if (!rootNode) return risks;

  if (hasConditionalHooks(rootNode)) {
    risks.push('Conditional hook execution detected');
  }

  function walk(node) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'WithStatement') {
      risks.push('Uses with statement');
    }

    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'eval'
    ) {
      risks.push('Uses dynamic eval()');
    }

    if (
      node.type === 'MemberExpression' &&
      ((node.object?.name === 'module' && node.property?.name === 'exports') ||
        (node.object?.name === 'exports'))
    ) {
      risks.push('Unsupported CommonJS module exports');
    }

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'tokens' || key === 'comments' || key === 'parent') {
        continue;
      }
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

  walk(rootNode);
  return Array.from(new Set(risks));
}

/**
 * Checks if an initializer expression has visible side effects.
 * @param {Object} initNode
 * @returns {boolean}
 */
function hasVisibleSideEffects(initNode) {
  if (!initNode) return false;

  // Pure literals, identifiers, pure binary/logical expressions, and static object/array literals are side-effect free
  if (
    initNode.type === 'StringLiteral' ||
    initNode.type === 'NumericLiteral' ||
    initNode.type === 'BooleanLiteral' ||
    initNode.type === 'NullLiteral' ||
    initNode.type === 'Identifier'
  ) {
    return false;
  }

  if (initNode.type === 'ArrayExpression') {
    return initNode.elements.some((el) => el && hasVisibleSideEffects(el));
  }

  if (initNode.type === 'ObjectExpression') {
    return initNode.properties.some((prop) => {
      if (prop.type === 'ObjectProperty') {
        return (prop.computed && hasVisibleSideEffects(prop.key)) || hasVisibleSideEffects(prop.value);
      }
      return true;
    });
  }

  // Object.freeze(...) of pure literal is pure
  if (
    initNode.type === 'CallExpression' &&
    initNode.callee.type === 'MemberExpression' &&
    initNode.callee.object?.name === 'Object' &&
    initNode.callee.property?.name === 'freeze' &&
    initNode.arguments[0] &&
    !hasVisibleSideEffects(initNode.arguments[0])
  ) {
    return false;
  }

  // Any other function call or unknown expression is treated as having potential side effects
  if (initNode.type === 'CallExpression' || initNode.type === 'NewExpression' || initNode.type === 'AssignmentExpression') {
    return true;
  }

  return false;
}

/**
 * Detects safe and manual-review code extraction candidates from a file AST.
 *
 * @param {Object} params
 * @param {import('@babel/types').File} params.ast - Babel File AST.
 * @param {string} params.source - Raw source code.
 * @param {string} params.relativePath - Relative file path.
 * @param {Object} params.dependencyGraph - Graph built by buildDependencyGraph.
 * @param {Object} [params.options={}] - Splitter configuration options.
 * @returns {Array<{
 *   id: string,
 *   kind: 'react-component' | 'custom-hook' | 'utility' | 'service' | 'constant-group',
 *   symbolName: string,
 *   lineStart: number,
 *   lineEnd: number,
 *   lines: number,
 *   reason: string,
 *   confidence: number,
 *   dependencies: string[],
 *   dependents: string[],
 *   externalImports: string[],
 *   capturedBindings: string[],
 *   safeForFutureExtraction: boolean,
 *   risks: string[]
 * }>}
 */
export function detectSplitCandidates({
  ast,
  source: _source,
  relativePath,
  dependencyGraph,
  options = {}
}) {
  if (!ast || !dependencyGraph) {
    return [];
  }

  const minCandidateLines = options.minCandidateLines ?? 20;
  const maxCandidates = options.maxCandidates ?? 10;

  const fileNameWithoutExt = path.basename(relativePath, path.extname(relativePath));
  const fileBasename = path.basename(relativePath);

  // Identify the primary component in this file (to preserve in place)
  let primaryComponentSymbol = null;
  for (const decl of dependencyGraph.declarations) {
    if (decl.defaultExport && decl.kind === 'react-component') {
      primaryComponentSymbol = decl.name;
      break;
    }
  }
  if (!primaryComponentSymbol) {
    for (const decl of dependencyGraph.declarations) {
      if (decl.name === fileNameWithoutExt && decl.kind === 'react-component') {
        primaryComponentSymbol = decl.name;
        break;
      }
    }
  }

  const candidates = [];
  const processedSymbols = new Set();

  // 1. Inspect top-level declarations from dependency graph
  const declMap = new Map();
  for (const decl of dependencyGraph.declarations) {
    declMap.set(decl.name, decl);
  }

  // Find AST nodes for declarations
  const astNodeMap = new Map();
  traverse(ast, {
    FunctionDeclaration(pathNode) {
      const name = pathNode.node.id ? pathNode.node.id.name : null;
      if (name) {
        let p = pathNode.parentPath;
        if (p.isExportNamedDeclaration() || p.isExportDefaultDeclaration()) p = p.parentPath;
        if (p.isProgram()) {
          astNodeMap.set(name, pathNode.node);
        }
      }
    },
    ClassDeclaration(pathNode) {
      const name = pathNode.node.id ? pathNode.node.id.name : null;
      if (name) {
        let p = pathNode.parentPath;
        if (p.isExportNamedDeclaration() || p.isExportDefaultDeclaration()) p = p.parentPath;
        if (p.isProgram()) {
          astNodeMap.set(name, pathNode.node);
        }
      }
    },
    VariableDeclarator(pathNode) {
      if (pathNode.node.id.type === 'Identifier') {
        const name = pathNode.node.id.name;
        let p = pathNode.parentPath?.parentPath;
        if (p?.isExportNamedDeclaration()) p = p.parentPath;
        if (p?.isProgram()) {
          astNodeMap.set(name, pathNode.node);
        }
      }
    }
  });


  for (const decl of dependencyGraph.declarations) {
    const lines = decl.lineEnd - decl.lineStart + 1;
    const astNode = astNodeMap.get(decl.name);
    const syntaxRisks = astNode ? inspectSyntaxRisks(astNode) : [];

    // Skip primary page component
    if (decl.name === primaryComponentSymbol) {
      continue;
    }

    // A. React Component Candidate
    if (decl.kind === 'react-component' || (astNode && returnsJsx(astNode) && /^[A-Z]/.test(decl.name))) {
      processedSymbols.add(decl.name);
      const isSubstantial = lines >= minCandidateLines || decl.dependents.length > 0;
      if (isSubstantial) {
        const risks = [...syntaxRisks];
        if (decl.capturedBindings.length > 0) {
          risks.push(`Captures binding(s) from outer scope: ${decl.capturedBindings.join(', ')}`);
        }

        const isSafe = risks.length === 0 && decl.capturedBindings.length === 0;
        candidates.push({
          id: `candidate-${decl.name}-${decl.lineStart}`,
          kind: 'react-component',
          symbolName: decl.name,
          lineStart: decl.lineStart,
          lineEnd: decl.lineEnd,
          lines,
          reason: 'Independent JSX section with explicit dependencies.',
          confidence: isSafe ? 0.91 : 0.65,
          dependencies: [...decl.dependencies],
          dependents: [...decl.dependents],
          externalImports: [...decl.externalImports],
          capturedBindings: [...decl.capturedBindings],
          safeForFutureExtraction: isSafe,
          risks
        });
      }
      continue;
    }

    // B. Custom Hook Candidate
    if (decl.kind === 'custom-hook' || (decl.name.startsWith('use') && /^use[A-Z]/.test(decl.name))) {
      processedSymbols.add(decl.name);
      const risks = [...syntaxRisks];
      if (decl.capturedBindings.length > 0) {
        risks.push(`Captures binding(s) from outer scope: ${decl.capturedBindings.join(', ')}`);
      }

      const isSafe = risks.length === 0 && decl.capturedBindings.length === 0;
      candidates.push({
        id: `candidate-${decl.name}-${decl.lineStart}`,
        kind: 'custom-hook',
        symbolName: decl.name,
        lineStart: decl.lineStart,
        lineEnd: decl.lineEnd,
        lines,
        reason: 'Cohesive custom Hook managing state and side-effect logic.',
        confidence: isSafe ? 0.93 : 0.60,
        dependencies: [...decl.dependencies],
        dependents: [...decl.dependents],
        externalImports: [...decl.externalImports],
        capturedBindings: [...decl.capturedBindings],
        safeForFutureExtraction: isSafe,
        risks
      });
      continue;
    }

    // C. Service Candidate (Fetch / HTTP / Storage)
    if (
      astNode &&
      (decl.kind === 'function' || decl.kind === 'constant' || decl.kind === 'variable') &&
      performsExternalServiceOperations(astNode)
    ) {
      processedSymbols.add(decl.name);
      const risks = [...syntaxRisks];
      if (decl.capturedBindings.length > 0) {
        risks.push(`Captures binding(s) from outer scope: ${decl.capturedBindings.join(', ')}`);
      }

      const isSafe = risks.length === 0 && decl.capturedBindings.length === 0;
      candidates.push({
        id: `candidate-${decl.name}-${decl.lineStart}`,
        kind: 'service',
        symbolName: decl.name,
        lineStart: decl.lineStart,
        lineEnd: decl.lineEnd,
        lines,
        reason: 'Performs external API or data persistence operations.',
        confidence: isSafe ? 0.90 : 0.62,
        dependencies: [...decl.dependencies],
        dependents: [...decl.dependents],
        externalImports: [...decl.externalImports],
        capturedBindings: [...decl.capturedBindings],
        safeForFutureExtraction: isSafe,
        risks
      });
      continue;
    }

    // D. Pure Utility Function Candidate
    if (
      astNode &&
      (decl.kind === 'function' ||
        (astNode.init && (astNode.init.type === 'ArrowFunctionExpression' || astNode.init.type === 'FunctionExpression'))) &&
      !returnsJsx(astNode) &&
      !callsReactHooks(astNode)
    ) {
      // Must be non-trivial (lines >= minCandidateLines or has callers or exported)
      const hasCallers = decl.dependents.length > 0 || decl.exported;
      if (lines >= minCandidateLines || (lines >= 5 && hasCallers)) {
        processedSymbols.add(decl.name);
        const risks = [...syntaxRisks];
        if (decl.capturedBindings.length > 0) {
          risks.push(`Captures binding(s) from outer scope: ${decl.capturedBindings.join(', ')}`);
        }

        const isSafe = risks.length === 0 && decl.capturedBindings.length === 0;
        candidates.push({
          id: `candidate-${decl.name}-${decl.lineStart}`,
          kind: 'utility',
          symbolName: decl.name,
          lineStart: decl.lineStart,
          lineEnd: decl.lineEnd,
          lines,
          reason: 'Pure utility function with clear inputs and outputs.',
          confidence: isSafe ? 0.89 : 0.60,
          dependencies: [...decl.dependencies],
          dependents: [...decl.dependents],
          externalImports: [...decl.externalImports],
          capturedBindings: [...decl.capturedBindings],
          safeForFutureExtraction: isSafe,
          risks
        });
        continue;
      }
    }

    // E. Constant Group Candidate
    if (
      (decl.kind === 'constant' || decl.kind === 'variable') &&
      astNode &&
      astNode.init
    ) {
      const init = astNode.init;
      // Object literals or array literals or uppercase configuration tables
      const isComplexConstant =
        init.type === 'ObjectExpression' ||
        init.type === 'ArrayExpression' ||
        (/^[A-Z_0-9]{3,}$/.test(decl.name) && (lines >= 4 || decl.dependents.length > 0));

      if (isComplexConstant) {
        processedSymbols.add(decl.name);
        const hasSideEffects = hasVisibleSideEffects(init);
        const risks = [...syntaxRisks];
        if (hasSideEffects) {
          risks.push('Constant initialization contains potential side effects');
        }
        if (decl.capturedBindings.length > 0) {
          risks.push(`Captures binding(s) from outer scope: ${decl.capturedBindings.join(', ')}`);
        }

        const isSafe = risks.length === 0 && !hasSideEffects && decl.capturedBindings.length === 0;
        candidates.push({
          id: `candidate-${decl.name}-${decl.lineStart}`,
          kind: 'constant-group',
          symbolName: decl.name,
          lineStart: decl.lineStart,
          lineEnd: decl.lineEnd,
          lines,
          reason: 'Group of related constants and static configuration data.',
          confidence: isSafe ? 0.88 : 0.55,
          dependencies: [...decl.dependencies],
          dependents: [...decl.dependents],
          externalImports: [...decl.externalImports],
          capturedBindings: [...decl.capturedBindings],
          safeForFutureExtraction: isSafe,
          risks
        });
        continue;
      }
    }
  }

  // 2. Discover Nested Closures / Functions / Components that capture outer state (Manual Review candidates)
  traverse(ast, {
    Function(pathNode) {
      // Skip top-level program statements
      if (pathNode.parentPath.isProgram() || pathNode.parentPath.parentPath?.isProgram()) {
        return;
      }

      // Check if this is a named function or assigned to an identifier
      let symbolName = null;
      let lineStart = pathNode.node.loc ? pathNode.node.loc.start.line : 1;
      let lineEnd = pathNode.node.loc ? pathNode.node.loc.end.line : lineStart;

      if (pathNode.node.id && pathNode.node.id.name) {
        symbolName = pathNode.node.id.name;
      } else if (
        pathNode.parentPath.isVariableDeclarator() &&
        pathNode.parentPath.node.id.type === 'Identifier'
      ) {
        symbolName = pathNode.parentPath.node.id.name;
        lineStart = pathNode.parentPath.node.loc ? pathNode.parentPath.node.loc.start.line : lineStart;
        lineEnd = pathNode.parentPath.node.loc ? pathNode.parentPath.node.loc.end.line : lineEnd;
      }

      if (!symbolName || processedSymbols.has(symbolName)) {
        return;
      }

      const lines = lineEnd - lineStart + 1;
      const isNestedComponent = /^[A-Z]/.test(symbolName) && returnsJsx(pathNode.node);
      const isNamedHandlerOrSubstantial =
        pathNode.isFunctionDeclaration() ||
        symbolName.startsWith('handle') ||
        symbolName.startsWith('render') ||
        lines >= 4;

      if (!isNestedComponent && !isNamedHandlerOrSubstantial) {
        return;
      }



      // Inspect captured outer bindings
      const captured = new Set();
      const parentFunc = pathNode.getFunctionParent();

      pathNode.traverse({
        Identifier(identPath) {
          if (!identPath.isReferencedIdentifier()) return;
          const identName = identPath.node.name;
          const binding = identPath.scope.getBinding(identName);

          if (binding) {
            // Check if binding belongs to an outer function (e.g. parent component)
            let isOuterFuncScope = false;
            let curr = binding.scope;
            while (curr && curr.block.type !== 'Program') {
              if (curr.block === parentFunc?.node) {
                isOuterFuncScope = true;
                break;
              }
              curr = curr.parent;
            }
            if (isOuterFuncScope) {
              captured.add(identName);
            }
          }
        }
      });

      if (captured.size > 0) {
        processedSymbols.add(symbolName);
        const risks = Array.from(captured).map(
          (varName) => `Captures ${varName} from outer scope`
        );

        // Check if any captured variables are mutated
        pathNode.traverse({
          AssignmentExpression(assignPath) {
            const left = assignPath.node.left;
            if (left.type === 'Identifier' && captured.has(left.name)) {
              risks.push(`Captures mutable variable ${left.name} which cannot safely become a prop`);
            }
          },
          UpdateExpression(updPath) {
            const arg = updPath.node.argument;
            if (arg.type === 'Identifier' && captured.has(arg.name)) {
              risks.push(`Captures mutable variable ${arg.name} which cannot safely become a prop`);
            }
          }
        });

        const isComponent = /^[A-Z]/.test(symbolName) && returnsJsx(pathNode.node);

        candidates.push({
          id: symbolName,
          kind: isComponent ? 'react-component' : 'utility',
          symbolName,
          lineStart,
          lineEnd,
          lines,
          reason: isComponent
            ? 'Nested React component capturing outer component state.'
            : 'Nested function capturing surrounding state closures.',
          confidence: 0.60,
          dependencies: [],
          dependents: [primaryComponentSymbol || fileNameWithoutExt],
          externalImports: [],
          capturedBindings: Array.from(captured).sort(),
          safeForFutureExtraction: false,
          risks
        });
      }
    }
  });

  // Deterministic candidate ordering: lineStart ASC, symbolName ASC
  candidates.sort((a, b) => {
    if (a.lineStart !== b.lineStart) return a.lineStart - b.lineStart;
    return a.symbolName.localeCompare(b.symbolName);
  });

  // Limit to maxCandidates
  const sliced = candidates.slice(0, maxCandidates);

  // Assign stable kebab candidate IDs with deterministic collision suffix & classify safety
  const idCounts = new Map();
  for (const cand of sliced) {
    const baseId = toKebabId(cand.symbolName);
    const count = (idCounts.get(baseId) || 0) + 1;
    idCounts.set(baseId, count);
    cand.id = count === 1 ? baseId : `${baseId}-${count}`;

    const isBlocked = cand.risks.some(
      (r) =>
        r.includes('Conditional hook') ||
        r.includes('eval()') ||
        r.includes('with statement') ||
        r.includes('CommonJS') ||
        r.includes('mutable variable')
    );

    if (isBlocked) {
      cand.safety = 'blocked';
      cand.safeForFutureExtraction = false;
    } else if (!cand.safeForFutureExtraction || cand.capturedBindings.length > 0 || cand.risks.length > 0) {
      cand.safety = 'manual-review';
      cand.safeForFutureExtraction = false;
    } else {
      cand.safety = 'automatic-ready';
      cand.safeForFutureExtraction = true;
    }
  }

  return sliced;
}
