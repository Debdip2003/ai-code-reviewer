/**
 * AST summarizer module.
 * Produces lightweight structural summaries of parsed JavaScript/JSX files
 * without mutating AST nodes or requiring full tree traversal.
 */

/**
 * Checks if a given identifier name is a potential React component candidate (starts with uppercase).
 * @param {string} name
 * @returns {boolean}
 */
function isComponentCandidate(name) {
  return typeof name === 'string' && /^[A-Z]/.test(name);
}

/**
 * Generates a lightweight summary of top-level AST constructs.
 *
 * @param {Object} params
 * @param {import('@babel/types').File} params.ast - Babel File AST.
 * @param {string} params.relativePath - Relative path for diagnostic identification.
 * @returns {{
 *   relativePath: string,
 *   sourceType: string,
 *   statementCount: number,
 *   imports: Array<{ source: string, specifierCount: number, line: number }>,
 *   exports: Array<{ kind: string, name: string, line: number }>,
 *   functions: Array<{ name: string, kind: string, async: boolean, line: number }>,
 *   classes: Array<{ name: string, line: number }>,
 *   reactComponentCandidates: Array<{ name: string, kind: string, line: number }>
 * }}
 */
export function summarizeAst({ ast, relativePath }) {
  if (!ast || !ast.program || !Array.isArray(ast.program.body)) {
    return {
      relativePath,
      sourceType: 'unknown',
      statementCount: 0,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      reactComponentCandidates: []
    };
  }

  const sourceType = ast.program.sourceType || 'script';
  const body = ast.program.body;
  const statementCount = body.length;

  const imports = [];
  const exports = [];
  const functions = [];
  const classes = [];
  const reactComponentCandidates = [];

  /**
   * Records a function and checks if it is a React component candidate.
   * @param {string} name
   * @param {'function-declaration' | 'arrow-function' | 'function-expression'} kind
   * @param {boolean} isAsync
   * @param {number} line
   */
  function recordFunction(name, kind, isAsync, line) {
    functions.push({
      name,
      kind,
      async: isAsync,
      line
    });

    if (isComponentCandidate(name)) {
      reactComponentCandidates.push({
        name,
        kind: 'function',
        line
      });
    }
  }

  /**
   * Records a class and checks if it is a React component candidate.
   * @param {string} name
   * @param {number} line
   */
  function recordClass(name, line) {
    classes.push({
      name,
      line
    });

    if (isComponentCandidate(name)) {
      reactComponentCandidates.push({
        name,
        kind: 'class',
        line
      });
    }
  }

  for (const node of body) {
    if (!node) continue;
    const nodeLine = node.loc ? node.loc.start.line : 1;

    switch (node.type) {
      case 'ImportDeclaration': {
        imports.push({
          source: node.source.value,
          specifierCount: Array.isArray(node.specifiers) ? node.specifiers.length : 0,
          line: nodeLine
        });
        break;
      }

      case 'ExportNamedDeclaration': {
        if (node.declaration) {
          const decl = node.declaration;
          const declLine = decl.loc ? decl.loc.start.line : nodeLine;

          if (decl.type === 'FunctionDeclaration') {
            const name = decl.id ? decl.id.name : 'anonymous';
            exports.push({ kind: 'named', name, line: nodeLine });
            recordFunction(name, 'function-declaration', Boolean(decl.async), declLine);
          } else if (decl.type === 'ClassDeclaration') {
            const name = decl.id ? decl.id.name : 'anonymous';
            exports.push({ kind: 'named', name, line: nodeLine });
            recordClass(name, declLine);
          } else if (decl.type === 'VariableDeclaration' && Array.isArray(decl.declarations)) {
            for (const declarator of decl.declarations) {
              const name = declarator.id ? declarator.id.name : 'anonymous';
              exports.push({ kind: 'named', name, line: nodeLine });

              if (declarator.init) {
                const initType = declarator.init.type;
                const decLine = declarator.loc ? declarator.loc.start.line : declLine;
                if (initType === 'ArrowFunctionExpression') {
                  recordFunction(name, 'arrow-function', Boolean(declarator.init.async), decLine);
                } else if (initType === 'FunctionExpression') {
                  recordFunction(name, 'function-expression', Boolean(declarator.init.async), decLine);
                }
              }
            }
          }
        } else if (Array.isArray(node.specifiers)) {
          for (const specifier of node.specifiers) {
            const name = specifier.exported
              ? (specifier.exported.name || specifier.exported.value || specifier.local?.name || 'anonymous')
              : (specifier.local ? specifier.local.name : 'anonymous');
            exports.push({ kind: 'named', name, line: nodeLine });
          }
        }
        break;
      }

      case 'ExportDefaultDeclaration': {
        const decl = node.declaration;
        let exportName = 'default';

        if (decl) {
          const declLine = decl.loc ? decl.loc.start.line : nodeLine;
          if (decl.id && decl.id.name) {
            exportName = decl.id.name;
          } else if (decl.name) {
            exportName = decl.name;
          }

          if (decl.type === 'FunctionDeclaration') {
            recordFunction(exportName, 'function-declaration', Boolean(decl.async), declLine);
          } else if (decl.type === 'ClassDeclaration') {
            recordClass(exportName, declLine);
          } else if (decl.type === 'ArrowFunctionExpression') {
            recordFunction(exportName, 'arrow-function', Boolean(decl.async), declLine);
          } else if (decl.type === 'FunctionExpression') {
            recordFunction(exportName, 'function-expression', Boolean(decl.async), declLine);
          }
        }

        exports.push({ kind: 'default', name: exportName, line: nodeLine });
        break;
      }

      case 'ExportAllDeclaration': {
        exports.push({
          kind: 'all',
          name: `* from ${node.source.value}`,
          line: nodeLine
        });
        break;
      }

      case 'FunctionDeclaration': {
        const name = node.id ? node.id.name : 'anonymous';
        recordFunction(name, 'function-declaration', Boolean(node.async), nodeLine);
        break;
      }

      case 'ClassDeclaration': {
        const name = node.id ? node.id.name : 'anonymous';
        recordClass(name, nodeLine);
        break;
      }

      case 'VariableDeclaration': {
        if (Array.isArray(node.declarations)) {
          for (const declarator of node.declarations) {
            const name = declarator.id ? declarator.id.name : 'anonymous';
            if (declarator.init) {
              const initType = declarator.init.type;
              const decLine = declarator.loc ? declarator.loc.start.line : nodeLine;
              if (initType === 'ArrowFunctionExpression') {
                recordFunction(name, 'arrow-function', Boolean(declarator.init.async), decLine);
              } else if (initType === 'FunctionExpression') {
                recordFunction(name, 'function-expression', Boolean(declarator.init.async), decLine);
              }
            }
          }
        }
        break;
      }

      default:
        break;
    }
  }

  return {
    relativePath,
    sourceType,
    statementCount,
    imports,
    exports,
    functions,
    classes,
    reactComponentCandidates
  };
}
