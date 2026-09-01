/**
 * Custom AST-based React static analyzer module using @babel/traverse.
 * Inspects React component structure, direct state mutation, effect callbacks,
 * and array-index keys without executing code or altering inputs.
 */

import traversePkg from '@babel/traverse';
import { validateFinding } from '../review/finding.js';
import { sortFindings } from '../review/severity.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';

// Safe interop for @babel/traverse CommonJS/ESM export
const traverse = traversePkg.default || traversePkg;

/**
 * Custom error class for React analysis failures.
 */
export class ReactAnalysisError extends Error {
  /**
   * @param {string} message - Error description.
   * @param {unknown} [cause] - Underlying error cause.
   */
  constructor(message, cause) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'ReactAnalysisError';
  }
}

/**
 * Mutating array methods to detect direct state mutation.
 */
const MUTATING_ARRAY_METHODS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin'
]);

/**
 * Checks if a node returns JSX or React.createElement.
 * @param {Object} rootNode
 * @returns {boolean}
 */
function returnsJsxOrCreateElement(rootNode) {
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

    // Do not descend into nested function declarations or expressions
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
 * Analyzes an AST for React-specific patterns, large components, state mutations, and effect usage.
 *
 * @param {Object} params
 * @param {import('@babel/types').File} params.ast - Babel AST file node.
 * @param {string} params.relativePath - Relative file path.
 * @param {import('../config/defaults.js').ReactConfig} [params.options] - React analyzer options.
 * @returns {{
 *   relativePath: string,
 *   isReactFile: boolean,
 *   components: Array<{ name: string, kind: string, lineStart: number, lineEnd: number, lines: number }>,
 *   effects: Array<{ hookName: string, lineStart: number, lineEnd: number, callbackLines: number, async: boolean }>,
 *   stateVariables: Array<{ stateName: string, setterName: string, line: number }>,
 *   findings: Array<Object>
 * }}
 * @throws {ReactAnalysisError} If React analysis encounters an unexpected error.
 */
export function analyzeReact({ ast, relativePath, options = {} }) {
  if (typeof relativePath !== 'string' || relativePath.trim().length === 0) {
    throw new TypeError('Relative path must be a non-empty string.');
  }

  const defaultOptions = DEFAULT_CONFIG.analyzers.react;
  const enabled = options.enabled !== undefined ? options.enabled : defaultOptions.enabled;

  if (!enabled || !ast) {
    return {
      relativePath,
      isReactFile: false,
      components: [],
      effects: [],
      stateVariables: [],
      findings: []
    };
  }

  const maxComponentLines = options.maxComponentLines ?? defaultOptions.maxComponentLines;
  const maxEffectLines = options.maxEffectLines ?? defaultOptions.maxEffectLines;
  const detectDirectStateMutation =
    options.detectDirectStateMutation ?? defaultOptions.detectDirectStateMutation;
  const detectArrayIndexKeys =
    options.detectArrayIndexKeys ?? defaultOptions.detectArrayIndexKeys;

  const components = [];
  const effects = [];
  const stateVariables = [];
  const findings = [];
  let isReactFile = false;

  // Track React import bindings
  const importedHooks = new Map(); // localName -> originalHookName
  const importedComponents = new Set(); // localName of Component / PureComponent

  try {
    // Pass 1: Discover imports and verify if this file is React-related
    traverse(ast, {
      ImportDeclaration(path) {
        if (path.node.source.value === 'react') {
          isReactFile = true;
          for (const spec of path.node.specifiers) {
            if (spec.type === 'ImportDefaultSpecifier' || spec.type === 'ImportNamespaceSpecifier') {
              // React namespace or default
            } else if (spec.type === 'ImportSpecifier') {
              const importedName = spec.imported.name || spec.imported.value;
              const localName = spec.local.name;
              if (importedName.startsWith('use')) {
                importedHooks.set(localName, importedName);
              } else if (importedName === 'Component' || importedName === 'PureComponent') {
                importedComponents.add(localName);
              }
            }
          }
        }
      },

      CallExpression(path) {
        // Check for require('react')
        if (
          path.node.callee.type === 'Identifier' &&
          path.node.callee.name === 'require' &&
          path.node.arguments[0]?.value === 'react'
        ) {
          isReactFile = true;
        }
      },

      JSXElement() {
        isReactFile = true;
      },

      JSXFragment() {
        isReactFile = true;
      }
    });

    // Pass 2: Main inspection for components, state, effects, and array keys
    const processedComponentNodes = new Set();

    traverse(ast, {
      // 1. Class Components
      ClassDeclaration(path) {
        const superClass = path.node.superClass;
        if (!superClass) return;

        let isClassComponent = false;
        if (
          superClass.type === 'MemberExpression' &&
          superClass.object?.name === 'React' &&
          (superClass.property?.name === 'Component' || superClass.property?.name === 'PureComponent')
        ) {
          isClassComponent = true;
        } else if (superClass.type === 'Identifier' && importedComponents.has(superClass.name)) {
          isClassComponent = true;
        }

        if (isClassComponent) {
          isReactFile = true;
          const name = path.node.id?.name || '<anonymous-class-component>';
          const lineStart = path.node.loc ? path.node.loc.start.line : 1;
          const lineEnd = path.node.loc ? path.node.loc.end.line : lineStart;
          const lines = lineEnd - lineStart + 1;

          components.push({
            name,
            kind: 'class-component',
            lineStart,
            lineEnd,
            lines
          });
          processedComponentNodes.add(path.node);

          if (lines > maxComponentLines) {
            const isHigh = lines >= 2 * maxComponentLines;
            findings.push(
              validateFinding({
                source: 'react',
                ruleId: 'react/component-too-large',
                severity: isHigh ? 'high' : 'medium',
                category: 'maintainability',
                title: 'Large React component',
                message: `Component '${name}' spans ${lines} lines, exceeding the configured maximum of ${maxComponentLines}.`,
                relativePath,
                lineStart,
                columnStart: path.node.loc ? path.node.loc.start.column + 1 : 1,
                lineEnd,
                columnEnd: path.node.loc ? path.node.loc.end.column + 1 : 1,
                suggestion:
                  'Extract cohesive UI sections, state logic, or side effects into smaller components and custom Hooks.',
                fixable: false
              })
            );
          }
        }
      },

      // 2. Function Components & Wrapped Components (memo, forwardRef)
      'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression'(path) {
        if (processedComponentNodes.has(path.node)) return;

        let name = '';
        let kind = 'function-component';
        let componentNode = path.node;
        let outerCall = null;

        // Check if inside React.memo or React.forwardRef
        const parent = path.parentPath;
        if (
          parent &&
          parent.isCallExpression() &&
          parent.node.arguments[0] === path.node
        ) {
          const callee = parent.node.callee;
          if (
            (callee.type === 'MemberExpression' &&
              callee.object?.name === 'React' &&
              callee.property?.name === 'memo') ||
            (callee.type === 'Identifier' && callee.name === 'memo')
          ) {
            kind = 'memo-component';
            outerCall = parent;
          } else if (
            (callee.type === 'MemberExpression' &&
              callee.object?.name === 'React' &&
              callee.property?.name === 'forwardRef') ||
            (callee.type === 'Identifier' && callee.name === 'forwardRef')
          ) {
            kind = 'forward-ref-component';
            outerCall = parent;
          }
        }

        // Determine candidate name
        if (path.node.type === 'FunctionDeclaration') {
          name = path.node.id?.name || '';
        } else if (outerCall && outerCall.parentPath && outerCall.parentPath.isVariableDeclarator()) {
          name = outerCall.parentPath.node.id?.name || '';
        } else if (parent && parent.isVariableDeclarator()) {
          name = parent.node.id?.name || '';
        } else if (path.parentPath && path.parentPath.isExportDefaultDeclaration()) {
          name = path.node.id?.name || '<default-export>';
        }

        // A function component name must start with uppercase letter
        if (name && /^[A-Z]/.test(name)) {
          if (returnsJsxOrCreateElement(path.node.body)) {
            isReactFile = true;
            processedComponentNodes.add(path.node);
            if (outerCall) processedComponentNodes.add(outerCall.node);

            const targetLocNode = outerCall ? outerCall.node : componentNode;
            const lineStart = targetLocNode.loc ? targetLocNode.loc.start.line : 1;
            const lineEnd = targetLocNode.loc ? targetLocNode.loc.end.line : lineStart;
            const lines = lineEnd - lineStart + 1;

            components.push({
              name,
              kind,
              lineStart,
              lineEnd,
              lines
            });

            if (lines > maxComponentLines) {
              const isHigh = lines >= 2 * maxComponentLines;
              findings.push(
                validateFinding({
                  source: 'react',
                  ruleId: 'react/component-too-large',
                  severity: isHigh ? 'high' : 'medium',
                  category: 'maintainability',
                  title: 'Large React component',
                  message: `Component '${name}' spans ${lines} lines, exceeding the configured maximum of ${maxComponentLines}.`,
                  relativePath,
                  lineStart,
                  columnStart: targetLocNode.loc ? targetLocNode.loc.start.column + 1 : 1,
                  lineEnd,
                  columnEnd: targetLocNode.loc ? targetLocNode.loc.end.column + 1 : 1,
                  suggestion:
                    'Extract cohesive UI sections, state logic, or side effects into smaller components and custom Hooks.',
                  fixable: false
                })
              );
            }
          }
        }
      },

      // 3. React State Detection (useState) & Direct Mutation
      VariableDeclarator(path) {
        const init = path.node.init;
        if (!init || init.type !== 'CallExpression') return;

        let isUseStateCall = false;
        const callee = init.callee;

        if (callee.type === 'Identifier') {
          if (callee.name === 'useState') {
            isUseStateCall = true;
          } else if (importedHooks.get(callee.name) === 'useState') {
            isUseStateCall = true;
          }
        } else if (
          callee.type === 'MemberExpression' &&
          callee.object?.name === 'React' &&
          callee.property?.name === 'useState'
        ) {
          isUseStateCall = true;
        }

        if (isUseStateCall && path.node.id.type === 'ArrayPattern') {
          isReactFile = true;
          const elements = path.node.id.elements;
          const stateIdentifier = elements[0];
          const setterIdentifier = elements[1];

          if (stateIdentifier && stateIdentifier.type === 'Identifier') {
            const stateName = stateIdentifier.name;
            const setterName =
              setterIdentifier && setterIdentifier.type === 'Identifier'
                ? setterIdentifier.name
                : '';
            const line = path.node.loc ? path.node.loc.start.line : 1;

            stateVariables.push({
              stateName,
              setterName,
              line
            });

            // If direct state mutation detection is enabled, inspect references in this scope
            if (detectDirectStateMutation) {
              const binding = path.scope.getBinding(stateName);
              if (binding) {
                const reportedMutationNodes = new Set();

                for (const refPath of binding.referencePaths) {
                  // Walk up through member expressions where current node is object
                  let currentPath = refPath;
                  while (
                    currentPath.parentPath &&
                    currentPath.parentPath.isMemberExpression() &&
                    currentPath.parentPath.node.object === currentPath.node
                  ) {
                    currentPath = currentPath.parentPath;
                  }

                  const parent = currentPath.parentPath;
                  if (!parent) continue;

                  // 1. Mutating array method: items.push(...), data.list.push(...)
                  if (
                    currentPath.isMemberExpression() &&
                    parent.isCallExpression() &&
                    parent.node.callee === currentPath.node &&
                    currentPath.node.property.type === 'Identifier' &&
                    MUTATING_ARRAY_METHODS.has(currentPath.node.property.name)
                  ) {
                    if (!reportedMutationNodes.has(parent.node)) {
                      reportedMutationNodes.add(parent.node);
                      const locNode = parent.node;
                      findings.push(
                        validateFinding({
                          source: 'react',
                          ruleId: 'react/direct-state-mutation',
                          severity: 'high',
                          category: 'correctness',
                          title: 'Direct React state mutation',
                          message: `React state '${stateName}' is mutated directly through '${currentPath.node.property.name}'.`,
                          relativePath,
                          lineStart: locNode.loc ? locNode.loc.start.line : 1,
                          columnStart: locNode.loc ? locNode.loc.start.column + 1 : 1,
                          lineEnd: locNode.loc ? locNode.loc.end.line : 1,
                          columnEnd: locNode.loc ? locNode.loc.end.column + 1 : 1,
                          suggestion:
                            'Create a new value and pass it to the state setter instead of mutating React state directly.',
                          fixable: false
                        })
                      );
                    }
                    continue;
                  }

                  // 2. Element/Property assignment: items[0] = x, data.list[0] = x, items.length = 0
                  if (
                    currentPath.isMemberExpression() &&
                    parent.isAssignmentExpression() &&
                    parent.node.left === currentPath.node
                  ) {
                    if (!reportedMutationNodes.has(parent.node)) {
                      reportedMutationNodes.add(parent.node);
                      const locNode = parent.node;
                      findings.push(
                        validateFinding({
                          source: 'react',
                          ruleId: 'react/direct-state-mutation',
                          severity: 'high',
                          category: 'correctness',
                          title: 'Direct React state mutation',
                          message: `React state '${stateName}' is mutated directly through assignment.`,
                          relativePath,
                          lineStart: locNode.loc ? locNode.loc.start.line : 1,
                          columnStart: locNode.loc ? locNode.loc.start.column + 1 : 1,
                          lineEnd: locNode.loc ? locNode.loc.end.line : 1,
                          columnEnd: locNode.loc ? locNode.loc.end.column + 1 : 1,
                          suggestion:
                            'Create a new value and pass it to the state setter instead of mutating React state directly.',
                          fixable: false
                        })
                      );
                    }
                    continue;
                  }

                  // 3. Update expression: items.count++, ++data.list[0], items++
                  if (
                    parent.isUpdateExpression() &&
                    parent.node.argument === currentPath.node
                  ) {
                    if (!reportedMutationNodes.has(parent.node)) {
                      reportedMutationNodes.add(parent.node);
                      const locNode = parent.node;
                      findings.push(
                        validateFinding({
                          source: 'react',
                          ruleId: 'react/direct-state-mutation',
                          severity: 'high',
                          category: 'correctness',
                          title: 'Direct React state mutation',
                          message: `React state '${stateName}' is mutated directly through an update expression.`,
                          relativePath,
                          lineStart: locNode.loc ? locNode.loc.start.line : 1,
                          columnStart: locNode.loc ? locNode.loc.start.column + 1 : 1,
                          lineEnd: locNode.loc ? locNode.loc.end.line : 1,
                          columnEnd: locNode.loc ? locNode.loc.end.column + 1 : 1,
                          suggestion:
                            'Create a new value and pass it to the state setter instead of mutating React state directly.',
                          fixable: false
                        })
                      );
                    }
                    continue;
                  }
                }
              }
            }
          }
        }
      },

      // 4. React Effects (useEffect) & Async / Large Callbacks
      CallExpression(path) {
        const callee = path.node.callee;
        let isUseEffectCall = false;

        if (callee.type === 'Identifier') {
          if (callee.name === 'useEffect') {
            isUseEffectCall = true;
          } else if (importedHooks.get(callee.name) === 'useEffect') {
            isUseEffectCall = true;
          }
        } else if (
          callee.type === 'MemberExpression' &&
          callee.object?.name === 'React' &&
          callee.property?.name === 'useEffect'
        ) {
          isUseEffectCall = true;
        }

        if (isUseEffectCall) {
          isReactFile = true;
          const callbackArg = path.node.arguments[0];
          const lineStart = path.node.loc ? path.node.loc.start.line : 1;
          const lineEnd = path.node.loc ? path.node.loc.end.line : lineStart;

          if (
            callbackArg &&
            (callbackArg.type === 'FunctionExpression' ||
              callbackArg.type === 'ArrowFunctionExpression')
          ) {
            const isAsync = Boolean(callbackArg.async);
            const cbStart = callbackArg.loc ? callbackArg.loc.start.line : lineStart;
            const cbEnd = callbackArg.loc ? callbackArg.loc.end.line : lineEnd;
            const callbackLines = cbEnd - cbStart + 1;

            effects.push({
              hookName: 'useEffect',
              lineStart,
              lineEnd,
              callbackLines,
              async: isAsync
            });

            // Async effect callback rule
            if (isAsync) {
              findings.push(
                validateFinding({
                  source: 'react',
                  ruleId: 'react/async-effect-callback',
                  severity: 'high',
                  category: 'correctness',
                  title: 'Async useEffect callback',
                  message:
                    'The useEffect callback is async and therefore returns a Promise instead of an effect cleanup function.',
                  relativePath,
                  lineStart: cbStart,
                  columnStart: callbackArg.loc ? callbackArg.loc.start.column + 1 : 1,
                  lineEnd: cbEnd,
                  columnEnd: callbackArg.loc ? callbackArg.loc.end.column + 1 : 1,
                  suggestion:
                    'Define and call an async function inside the effect while keeping the effect callback synchronous.',
                  fixable: false
                })
              );
            }

            // Large effect rule
            if (callbackLines > maxEffectLines) {
              const isHigh = callbackLines >= 2 * maxEffectLines;
              findings.push(
                validateFinding({
                  source: 'react',
                  ruleId: 'react/effect-too-large',
                  severity: isHigh ? 'high' : 'medium',
                  category: 'maintainability',
                  title: 'Large useEffect callback',
                  message: `The useEffect callback spans ${callbackLines} lines, exceeding the configured maximum of ${maxEffectLines}.`,
                  relativePath,
                  lineStart: cbStart,
                  columnStart: callbackArg.loc ? callbackArg.loc.start.column + 1 : 1,
                  lineEnd: cbEnd,
                  columnEnd: callbackArg.loc ? callbackArg.loc.end.column + 1 : 1,
                  suggestion:
                    'Extract the effect’s work into focused functions or a custom Hook.',
                  fixable: false
                })
              );
            }
          }
        }

        // 5. Array-Index Key Detection
        if (detectArrayIndexKeys) {
          if (
            callee.type === 'MemberExpression' &&
            callee.property.type === 'Identifier' &&
            callee.property.name === 'map'
          ) {
            const mapCallback = path.node.arguments[0];
            if (
              mapCallback &&
              (mapCallback.type === 'FunctionExpression' ||
                mapCallback.type === 'ArrowFunctionExpression') &&
              mapCallback.params.length >= 2
            ) {
              const indexParam = mapCallback.params[1];
              if (indexParam && indexParam.type === 'Identifier') {
                const indexName = indexParam.name;

                // Look for JSXAttribute with key={indexName} within the callback body
                const callbackPath = path.get('arguments.0');
                if (callbackPath) {
                  callbackPath.traverse({
                    JSXAttribute(attrPath) {
                      if (attrPath.node.name.name === 'key') {
                        const value = attrPath.node.value;
                        if (
                          value &&
                          value.type === 'JSXExpressionContainer' &&
                          value.expression.type === 'Identifier' &&
                          value.expression.name === indexName
                        ) {
                          // Verify binding identity
                          const binding = attrPath.scope.getBinding(indexName);
                          if (binding && binding.identifier === indexParam) {
                            const locNode = attrPath.node;
                            findings.push(
                              validateFinding({
                                source: 'react',
                                ruleId: 'react/array-index-key',
                                severity: 'medium',
                                category: 'correctness',
                                title: 'Array index used as React key',
                                message: `Array index '${indexName}' is used as a React key.`,
                                relativePath,
                                lineStart: locNode.loc ? locNode.loc.start.line : 1,
                                columnStart: locNode.loc ? locNode.loc.start.column + 1 : 1,
                                lineEnd: locNode.loc ? locNode.loc.end.line : 1,
                                columnEnd: locNode.loc ? locNode.loc.end.column + 1 : 1,
                                suggestion:
                                  'Use a stable identifier from the item instead of its array position.',
                                fixable: false
                              })
                            );
                          }
                        }
                      }
                    }
                  });
                }
              }
            }
          }
        }
      }
    });
  } catch (error) {
    throw new ReactAnalysisError(
      `Failed to analyze React patterns in "${relativePath}": ${error.message}`,
      error
    );
  }

  // Sort components by lineStart, name
  components.sort((a, b) => {
    if (a.lineStart !== b.lineStart) return a.lineStart - b.lineStart;
    return a.name.localeCompare(b.name);
  });

  const sortedFindings = sortFindings(findings);

  return {
    relativePath,
    isReactFile,
    components,
    effects,
    stateVariables,
    findings: sortedFindings
  };
}
