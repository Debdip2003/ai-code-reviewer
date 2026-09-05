/**
 * Semantic AST-aware code chunking module.
 * Partitions JavaScript/React source files into semantically complete, token-safe review chunks.
 */

/**
 * Estimates token count using the conservative 3-characters-per-token heuristic.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / 3);
}

/**
 * Checks if an identifier or name is a React component candidate (PascalCase).
 * @param {string} name
 * @returns {boolean}
 */
function isReactComponent(name) {
  return typeof name === 'string' && /^[A-Z][A-Za-z0-9_]*$/.test(name);
}

/**
 * Splits a parsed JavaScript/JSX file into semantic chunks within token constraints.
 *
 * @param {Object} params
 * @param {string} params.source - Full file source code string.
 * @param {import('@babel/types').File} params.ast - Babel AST.
 * @param {string} params.relativePath - Relative file path for chunk identification.
 * @param {Object} [params.astSummary] - Precomputed AST summary if available.
 * @param {number} [params.maxInputTokens=12000] - Maximum allowable tokens per chunk.
 * @returns {{
 *   chunks: Array<{
 *     id: string,
 *     relativePath: string,
 *     kind: string,
 *     symbolName: string,
 *     lineStart: number,
 *     lineEnd: number,
 *     code: string,
 *     imports: Array<string>,
 *     estimatedInputTokens: number
 *   }>,
 *   skipped: Array<{
 *     id: string,
 *     relativePath: string,
 *     kind: string,
 *     symbolName: string,
 *     lineStart: number,
 *     lineEnd: number,
 *     estimatedInputTokens: number,
 *     reason: 'token-limit'
 *   }>
 * }}
 */
export function createSemanticChunks({
  source,
  ast,
  relativePath,
  astSummary: _astSummary,
  maxInputTokens = 12000
}) {
  if (typeof source !== 'string') {
    throw new TypeError('source must be a string');
  }
  if (!ast || !ast.program || !Array.isArray(ast.program.body)) {
    return { chunks: [], skipped: [] };
  }

  // 1. Extract all import statements as reusable context
  const imports = [];
  for (const node of ast.program.body) {
    if (node && node.type === 'ImportDeclaration') {
      const impText = source.slice(node.start, node.end).trim();
      if (impText) {
        imports.push(impText);
      }
    }
  }

  const importsContextText = imports.join('\n');
  const importsTokens = estimateTokens(importsContextText);

  const rawUnits = [];

  // Helper to record a semantic unit
  function addUnit({ node, kind, symbolName }) {
    if (!node || typeof node.start !== 'number' || typeof node.end !== 'number') {
      return;
    }
    const lineStart = node.loc ? node.loc.start.line : 1;
    const lineEnd = node.loc ? node.loc.end.line : lineStart;
    const code = source.slice(node.start, node.end).trim();
    if (!code) return;

    rawUnits.push({
      kind,
      symbolName: symbolName || 'anonymous',
      lineStart,
      lineEnd,
      code
    });
  }

  // 2. Traverse top-level AST body statements to find semantic units
  for (const node of ast.program.body) {
    if (!node) continue;

    switch (node.type) {
      case 'FunctionDeclaration': {
        const name = node.id ? node.id.name : 'anonymous';
        const kind = isReactComponent(name) ? 'react-component' : 'function-declaration';
        addUnit({ node, kind, symbolName: name });
        break;
      }

      case 'ClassDeclaration': {
        const name = node.id ? node.id.name : 'anonymous';
        const kind = isReactComponent(name) ? 'react-component' : 'class-declaration';
        addUnit({ node, kind, symbolName: name });
        break;
      }

      case 'ExportNamedDeclaration': {
        if (node.declaration) {
          const decl = node.declaration;
          if (decl.type === 'FunctionDeclaration') {
            const name = decl.id ? decl.id.name : 'anonymous';
            const kind = isReactComponent(name) ? 'react-component' : 'function-declaration';
            addUnit({ node, kind, symbolName: name });
          } else if (decl.type === 'ClassDeclaration') {
            const name = decl.id ? decl.id.name : 'anonymous';
            const kind = isReactComponent(name) ? 'react-component' : 'class-declaration';
            addUnit({ node, kind, symbolName: name });
          } else if (decl.type === 'VariableDeclaration' && Array.isArray(decl.declarations)) {
            for (const declarator of decl.declarations) {
              const name = declarator.id ? declarator.id.name : 'anonymous';
              if (declarator.init) {
                const initType = declarator.init.type;
                if (initType === 'ArrowFunctionExpression' || initType === 'FunctionExpression') {
                  const kind = isReactComponent(name)
                    ? 'react-component'
                    : initType === 'ArrowFunctionExpression'
                      ? 'arrow-function'
                      : 'function-expression';
                  addUnit({ node, kind, symbolName: name });
                }
              }
            }
          }
        }
        break;
      }

      case 'ExportDefaultDeclaration': {
        const decl = node.declaration;
        if (decl) {
          let name = 'defaultExport';
          if (decl.id && decl.id.name) {
            name = decl.id.name;
          } else if (decl.name) {
            name = decl.name;
          }

          if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') {
            const kind = isReactComponent(name)
              ? 'react-component'
              : decl.type === 'FunctionDeclaration'
                ? 'function-declaration'
                : 'class-declaration';
            addUnit({ node, kind, symbolName: name });
          } else if (
            decl.type === 'ArrowFunctionExpression' ||
            decl.type === 'FunctionExpression'
          ) {
            const kind = isReactComponent(name)
              ? 'react-component'
              : decl.type === 'ArrowFunctionExpression'
                ? 'arrow-function'
                : 'function-expression';
            addUnit({ node, kind, symbolName: name });
          }
        }
        break;
      }

      case 'VariableDeclaration': {
        if (Array.isArray(node.declarations)) {
          for (const declarator of node.declarations) {
            const name = declarator.id ? declarator.id.name : 'anonymous';
            if (declarator.init) {
              const initType = declarator.init.type;
              if (initType === 'ArrowFunctionExpression' || initType === 'FunctionExpression') {
                const kind = isReactComponent(name)
                  ? 'react-component'
                  : initType === 'ArrowFunctionExpression'
                    ? 'arrow-function'
                    : 'function-expression';
                addUnit({ node, kind, symbolName: name });
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

  // 3. If no top-level functions or classes were found, evaluate the file as a single module chunk
  if (rawUnits.length === 0 && source.trim().length > 0) {
    const lineCount = source.split(/\r?\n/).length;
    rawUnits.push({
      kind: 'module',
      symbolName: 'module',
      lineStart: 1,
      lineEnd: Math.max(1, lineCount),
      code: source.trim()
    });
  }

  // 4. Deduplicate units by location
  const seenRanges = new Set();
  const uniqueUnits = [];

  for (const unit of rawUnits) {
    const rangeKey = `${unit.lineStart}:${unit.lineEnd}`;
    if (!seenRanges.has(rangeKey)) {
      seenRanges.add(rangeKey);
      uniqueUnits.push(unit);
    }
  }

  // 5. Deterministically sort units: lineStart ascending, then symbolName, then kind
  uniqueUnits.sort((a, b) => {
    if (a.lineStart !== b.lineStart) {
      return a.lineStart - b.lineStart;
    }
    if (a.lineEnd !== b.lineEnd) {
      return a.lineEnd - b.lineEnd;
    }
    return a.symbolName.localeCompare(b.symbolName);
  });

  const chunks = [];
  const skipped = [];

  // 6. Build chunk objects and enforce maxInputTokens limit
  for (const unit of uniqueUnits) {
    const id = `${relativePath}:${unit.symbolName || unit.kind}:${unit.lineStart}-${unit.lineEnd}`;
    const codeTokens = estimateTokens(unit.code);
    const totalEstimatedTokens = codeTokens + importsTokens + 150; // include conservative prompt envelope overhead

    if (totalEstimatedTokens > maxInputTokens) {
      skipped.push({
        id,
        relativePath,
        kind: unit.kind,
        symbolName: unit.symbolName,
        lineStart: unit.lineStart,
        lineEnd: unit.lineEnd,
        estimatedInputTokens: totalEstimatedTokens,
        reason: 'token-limit'
      });
    } else {
      chunks.push({
        id,
        relativePath,
        kind: unit.kind,
        symbolName: unit.symbolName,
        lineStart: unit.lineStart,
        lineEnd: unit.lineEnd,
        code: unit.code,
        imports: [...imports],
        estimatedInputTokens: totalEstimatedTokens
      });
    }
  }

  return {
    chunks,
    skipped
  };
}
