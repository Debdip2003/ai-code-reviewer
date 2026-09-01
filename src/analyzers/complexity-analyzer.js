/**
 * Custom AST-based complexity analyzer module using @babel/traverse.
 * Evaluates function line length, parameter count, cyclomatic complexity,
 * and control-flow decision nesting depth without executing code or altering inputs.
 */

import traversePkg from '@babel/traverse';
import { validateFinding } from '../review/finding.js';
import { sortFindings } from '../review/severity.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';

// Safe interop for @babel/traverse CommonJS/ESM export
const traverse = traversePkg.default || traversePkg;

/**
 * Custom error class for complexity analysis failures.
 */
export class ComplexityAnalysisError extends Error {
  /**
   * @param {string} message - Error description.
   * @param {unknown} [cause] - Underlying error cause.
   */
  constructor(message, cause) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'ComplexityAnalysisError';
  }
}

/**
 * Checks if a Babel AST node represents a function-like construct.
 * @param {Object} [node]
 * @returns {boolean}
 */
function isFunctionNode(node) {
  if (!node || typeof node !== 'object') return false;
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'ObjectMethod' ||
    node.type === 'ClassMethod' ||
    node.type === 'ClassPrivateMethod'
  );
}

/**
 * Determines a stable human-readable name for a function AST path.
 *
 * @param {import('@babel/traverse').NodePath} path
 * @returns {string}
 */
function resolveFunctionName(path) {
  const node = path.node;
  const lineStart = node.loc ? node.loc.start.line : 1;

  if (node.type === 'FunctionDeclaration') {
    if (node.id && node.id.name) {
      return node.id.name;
    }
    if (path.parentPath && path.parentPath.isExportDefaultDeclaration()) {
      return `<default-export@${lineStart}>`;
    }
    return `<anonymous@${lineStart}>`;
  }

  if (node.type === 'ObjectMethod' || node.type === 'ClassMethod' || node.type === 'ClassPrivateMethod') {
    let methodName = '';
    if (node.key) {
      if (node.key.type === 'Identifier') {
        methodName = node.key.name;
      } else if (node.key.type === 'PrivateName' && node.key.id) {
        methodName = `#${node.key.id.name}`;
      } else if (node.key.type === 'StringLiteral' || node.key.type === 'NumericLiteral') {
        methodName = String(node.key.value);
      } else if (node.computed) {
        methodName = `<computed@${lineStart}>`;
      }
    }
    if (!methodName) {
      methodName = `<anonymous@${lineStart}>`;
    }

    if (node.kind === 'get') {
      methodName = `get ${methodName}`;
    } else if (node.kind === 'set') {
      methodName = `set ${methodName}`;
    }

    // If inside a class with an identifier name, prefix with ClassName.
    const classParent = path.findParent((p) => p.isClassDeclaration() || p.isClassExpression());
    if (classParent && classParent.node && classParent.node.id && classParent.node.id.name) {
      return `${classParent.node.id.name}.${methodName}`;
    }

    return methodName;
  }

  if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
    const parentPath = path.parentPath;
    if (parentPath) {
      if (parentPath.isVariableDeclarator() && parentPath.node.id && parentPath.node.id.name) {
        return parentPath.node.id.name;
      }
      if (
        parentPath.isAssignmentExpression() &&
        parentPath.node.left &&
        parentPath.node.left.type === 'Identifier'
      ) {
        return parentPath.node.left.name;
      }
      if (parentPath.isObjectProperty() && parentPath.node.key) {
        const key = parentPath.node.key;
        const name = key.name || (key.value !== undefined ? String(key.value) : '');
        if (name) return name;
      }
      if (parentPath.isExportDefaultDeclaration()) {
        return `<default-export@${lineStart}>`;
      }
    }

    if (node.id && node.id.name) {
      return node.id.name;
    }

    return `<anonymous@${lineStart}>`;
  }

  return `<anonymous@${lineStart}>`;
}

/**
 * Returns the normalized function kind string.
 * @param {import('@babel/traverse').NodePath} path
 * @returns {string}
 */
function resolveFunctionKind(path) {
  const type = path.node.type;
  switch (type) {
    case 'FunctionDeclaration':
      return 'function-declaration';
    case 'ArrowFunctionExpression':
      return 'arrow-function';
    case 'ObjectMethod':
      return 'object-method';
    case 'ClassMethod':
    case 'ClassPrivateMethod':
      return 'class-method';
    case 'FunctionExpression':
      return 'function-expression';
    default:
      return 'function';
  }
}

/**
 * Calculates cyclomatic complexity for a single function without recursing into nested functions.
 *
 * Formula:
 * Start at 1. Add 1 for each decision point:
 * - IfStatement
 * - ConditionalExpression (? :)
 * - ForStatement, ForInStatement, ForOfStatement
 * - WhileStatement, DoWhileStatement
 * - CatchClause
 * - SwitchCase (non-default, test !== null)
 * - LogicalExpression (&&, ||, ??)
 *
 * @param {Object} rootBodyNode - Function body AST node or root node.
 * @returns {number} Cyclomatic complexity score.
 */
function calculateCyclomaticComplexity(rootBodyNode) {
  if (!rootBodyNode) {
    return 1;
  }

  let complexity = 1;

  function walk(node) {
    if (!node || typeof node !== 'object') return;

    // Do not count nested function internals as part of parent metrics
    if (node !== rootBodyNode && isFunctionNode(node)) {
      return;
    }

    switch (node.type) {
      case 'IfStatement':
      case 'ConditionalExpression':
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
      case 'WhileStatement':
      case 'DoWhileStatement':
      case 'CatchClause':
        complexity++;
        break;

      case 'SwitchCase':
        if (node.test !== null) {
          complexity++;
        }
        break;

      case 'LogicalExpression':
        if (node.operator === '&&' || node.operator === '||' || node.operator === '??') {
          complexity++;
        }
        break;

      default:
        break;
    }

    for (const key of Object.keys(node)) {
      // Skip Babel metadata and parent references
      if (key === 'loc' || key === 'tokens' || key === 'comments' || key === 'parent') {
        continue;
      }
      const val = node[key];
      if (Array.isArray(val)) {
        for (const child of val) {
          if (child && typeof child === 'object') {
            walk(child);
          }
        }
      } else if (val && typeof val === 'object') {
        walk(val);
      }
    }
  }

  walk(rootBodyNode);
  return complexity;
}

/**
 * Measures maximum decision/control-flow nesting depth inside a function.
 *
 * Nesting constructs: IfStatement, Loops, SwitchStatement, TryStatement / CatchClause.
 * Special rules:
 * - `else if` chains stay at the same logical depth as the parent `if`.
 * - Direct `catch` clause does not double count with its `try`.
 * - Ordinary block statements do not increment depth.
 * - Nested functions are excluded.
 *
 * @param {Object} rootBodyNode - Function body AST node.
 * @returns {number} Maximum nesting depth reached.
 */
function calculateMaxNestingDepth(rootBodyNode) {
  if (!rootBodyNode) {
    return 0;
  }

  let maxDepth = 0;

  function walk(node, currentDepth, isElseIfChild = false) {
    if (!node || typeof node !== 'object') return;

    // Exclude nested functions
    if (node !== rootBodyNode && isFunctionNode(node)) {
      return;
    }

    let nextDepth = currentDepth;

    switch (node.type) {
      case 'IfStatement': {
        nextDepth = isElseIfChild ? currentDepth : currentDepth + 1;
        if (nextDepth > maxDepth) maxDepth = nextDepth;

        walk(node.test, nextDepth);
        walk(node.consequent, nextDepth);

        if (node.alternate) {
          if (node.alternate.type === 'IfStatement') {
            // else if continues at the same depth
            walk(node.alternate, nextDepth, true);
          } else {
            walk(node.alternate, nextDepth, false);
          }
        }
        return;
      }

      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
      case 'WhileStatement':
      case 'DoWhileStatement': {
        nextDepth = currentDepth + 1;
        if (nextDepth > maxDepth) maxDepth = nextDepth;
        break;
      }

      case 'SwitchStatement': {
        nextDepth = currentDepth + 1;
        if (nextDepth > maxDepth) maxDepth = nextDepth;
        break;
      }

      case 'TryStatement': {
        nextDepth = currentDepth + 1;
        if (nextDepth > maxDepth) maxDepth = nextDepth;

        walk(node.block, nextDepth);
        if (node.handler) {
          // Associated catch handler stays at same try-catch depth level
          walk(node.handler.body, nextDepth);
        }
        if (node.finalizer) {
          walk(node.finalizer, nextDepth);
        }
        return;
      }

      case 'CatchClause': {
        // Standalone catch if encountered
        nextDepth = currentDepth + 1;
        if (nextDepth > maxDepth) maxDepth = nextDepth;
        break;
      }

      default:
        break;
    }

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'tokens' || key === 'comments' || key === 'parent') {
        continue;
      }
      const val = node[key];
      if (Array.isArray(val)) {
        for (const child of val) {
          if (child && typeof child === 'object') {
            walk(child, nextDepth, false);
          }
        }
      } else if (val && typeof val === 'object') {
        walk(val, nextDepth, false);
      }
    }
  }

  walk(rootBodyNode, 0, false);
  return maxDepth;
}

/**
 * Calculates metric details for a single function AST path.
 *
 * @param {Object} params
 * @param {import('@babel/traverse').NodePath} params.functionPath - Babel path of the function node.
 * @param {string} [params.relativePath=''] - Relative path for diagnostic identification.
 * @returns {{
 *   name: string,
 *   kind: string,
 *   lineStart: number,
 *   lineEnd: number,
 *   columnStart: number,
 *   columnEnd: number,
 *   functionLines: number,
 *   parameterCount: number,
 *   cyclomaticComplexity: number,
 *   maxNestingDepth: number,
 *   async: boolean,
 *   generator: boolean
 * }}
 */
export function calculateFunctionMetrics({ functionPath, relativePath = '' }) {
  const node = functionPath.node;
  const name = resolveFunctionName(functionPath);
  const kind = resolveFunctionKind(functionPath);

  const lineStart = node.loc ? node.loc.start.line : 1;
  const lineEnd = node.loc ? node.loc.end.line : lineStart;
  const columnStart = node.loc ? node.loc.start.column + 1 : 1; // 1-based public column
  const columnEnd = node.loc ? node.loc.end.column + 1 : 1; // 1-based public column

  const functionLines = node.loc ? lineEnd - lineStart + 1 : 0;
  const parameterCount = Array.isArray(node.params) ? node.params.length : 0;
  const isAsync = Boolean(node.async);
  const isGenerator = Boolean(node.generator);

  const bodyNode = node.body;
  const cyclomaticComplexity = calculateCyclomaticComplexity(bodyNode);
  const maxNestingDepth = calculateMaxNestingDepth(bodyNode);

  return {
    name,
    kind,
    lineStart,
    lineEnd,
    columnStart,
    columnEnd,
    functionLines,
    parameterCount,
    cyclomaticComplexity,
    maxNestingDepth,
    async: isAsync,
    generator: isGenerator
  };
}

/**
 * Analyzes an AST for code complexity metrics and generates standardized findings for exceeded thresholds.
 *
 * @param {Object} params
 * @param {import('@babel/types').File} params.ast - Babel File AST.
 * @param {string} params.relativePath - Relative file path.
 * @param {import('../config/defaults.js').ComplexityConfig} [params.options] - Complexity threshold options.
 * @returns {{
 *   relativePath: string,
 *   functions: Array<Object>,
 *   findings: Array<Object>
 * }}
 * @throws {ComplexityAnalysisError} If AST traversal encounters an unexpected error.
 */
export function analyzeComplexity({ ast, relativePath, options = {} }) {
  if (typeof relativePath !== 'string' || relativePath.trim().length === 0) {
    throw new TypeError('Relative path must be a non-empty string.');
  }

  const defaultOptions = DEFAULT_CONFIG.analyzers.complexity;
  const enabled = options.enabled !== undefined ? options.enabled : defaultOptions.enabled;

  if (!enabled || !ast) {
    return {
      relativePath,
      functions: [],
      findings: []
    };
  }

  const maxFunctionLines = options.maxFunctionLines ?? defaultOptions.maxFunctionLines;
  const maxParameters = options.maxParameters ?? defaultOptions.maxParameters;
  const maxCyclomaticComplexity = options.maxCyclomaticComplexity ?? defaultOptions.maxCyclomaticComplexity;
  const maxNestingDepth = options.maxNestingDepth ?? defaultOptions.maxNestingDepth;

  const functions = [];
  const findings = [];

  try {
    traverse(ast, {
      'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|ObjectMethod|ClassMethod|ClassPrivateMethod'(
        functionPath
      ) {
        const metrics = calculateFunctionMetrics({ functionPath, relativePath });

        // Push sanitized function metrics (excluding internal column coords from return list)
        functions.push({
          name: metrics.name,
          kind: metrics.kind,
          lineStart: metrics.lineStart,
          lineEnd: metrics.lineEnd,
          functionLines: metrics.functionLines,
          parameterCount: metrics.parameterCount,
          cyclomaticComplexity: metrics.cyclomaticComplexity,
          maxNestingDepth: metrics.maxNestingDepth,
          async: metrics.async,
          generator: metrics.generator
        });

        // 1. Function too long
        if (metrics.functionLines > maxFunctionLines) {
          const isHigh = metrics.functionLines >= 2 * maxFunctionLines;
          findings.push(
            validateFinding({
              source: 'complexity',
              ruleId: 'complexity/function-too-long',
              severity: isHigh ? 'high' : 'medium',
              category: 'maintainability',
              title: 'Function exceeds maximum line length',
              message: `Function '${metrics.name}' has ${metrics.functionLines} lines, exceeding the configured maximum of ${maxFunctionLines}.`,
              relativePath,
              lineStart: metrics.lineStart,
              columnStart: metrics.columnStart,
              lineEnd: metrics.lineEnd,
              columnEnd: metrics.columnEnd,
              suggestion: 'Break the function into smaller, focused helper functions.',
              fixable: false
            })
          );
        }

        // 2. Too many parameters
        if (metrics.parameterCount > maxParameters) {
          let severity = 'medium';
          if (metrics.parameterCount >= 2 * maxParameters) {
            severity = 'high';
          } else if (metrics.parameterCount === maxParameters + 1) {
            severity = 'low';
          }

          findings.push(
            validateFinding({
              source: 'complexity',
              ruleId: 'complexity/too-many-parameters',
              severity,
              category: 'maintainability',
              title: 'Function has too many parameters',
              message: `Function '${metrics.name}' has ${metrics.parameterCount} parameters, exceeding the configured maximum of ${maxParameters}.`,
              relativePath,
              lineStart: metrics.lineStart,
              columnStart: metrics.columnStart,
              lineEnd: metrics.lineEnd,
              columnEnd: metrics.columnEnd,
              suggestion: 'Group related parameters into an options object or cohesive data structure.',
              fixable: false
            })
          );
        }

        // 3. High cyclomatic complexity
        if (metrics.cyclomaticComplexity > maxCyclomaticComplexity) {
          const isHigh = metrics.cyclomaticComplexity >= 2 * maxCyclomaticComplexity;
          findings.push(
            validateFinding({
              source: 'complexity',
              ruleId: 'complexity/high-cyclomatic-complexity',
              severity: isHigh ? 'high' : 'medium',
              category: 'maintainability',
              title: 'High cyclomatic complexity',
              message: `Function '${metrics.name}' has cyclomatic complexity ${metrics.cyclomaticComplexity}, exceeding the configured maximum of ${maxCyclomaticComplexity}.`,
              relativePath,
              lineStart: metrics.lineStart,
              columnStart: metrics.columnStart,
              lineEnd: metrics.lineEnd,
              columnEnd: metrics.columnEnd,
              suggestion: 'Break the decision logic into smaller focused functions or dispatch tables.',
              fixable: false
            })
          );
        }

        // 4. Deep nesting
        if (metrics.maxNestingDepth > maxNestingDepth) {
          const isHigh = metrics.maxNestingDepth >= 2 * maxNestingDepth;
          findings.push(
            validateFinding({
              source: 'complexity',
              ruleId: 'complexity/deep-nesting',
              severity: isHigh ? 'high' : 'medium',
              category: 'maintainability',
              title: 'Deep decision nesting',
              message: `Function '${metrics.name}' has a nesting depth of ${metrics.maxNestingDepth}, exceeding the configured maximum of ${maxNestingDepth}.`,
              relativePath,
              lineStart: metrics.lineStart,
              columnStart: metrics.columnStart,
              lineEnd: metrics.lineEnd,
              columnEnd: metrics.columnEnd,
              suggestion: 'Use guard clauses, early returns, or extract nested blocks into helper functions.',
              fixable: false
            })
          );
        }
      }
    });
  } catch (error) {
    throw new ComplexityAnalysisError(
      `Failed to analyze complexity in "${relativePath}": ${error.message}`,
      error
    );
  }

  // Sort functions by lineStart, lineEnd, name
  functions.sort((a, b) => {
    if (a.lineStart !== b.lineStart) return a.lineStart - b.lineStart;
    return a.name.localeCompare(b.name);
  });

  const sortedFindings = sortFindings(findings);

  return {
    relativePath,
    functions,
    findings: sortedFindings
  };
}
