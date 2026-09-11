/**
 * AST Dependency Graph builder module.
 * Analyzes top-level declarations and their dependency relationships using Babel scope analysis.
 * Produces serializable, deterministic dependency graph representations without side-effects.
 */

import traversePkg from '@babel/traverse';

// Safe interop for @babel/traverse CommonJS/ESM export
const traverse = traversePkg.default || traversePkg;

/**
 * Checks if a function or AST node returns JSX or React.createElement.
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
 * Determines if a declaration kind is a React Component or Custom Hook.
 * @param {string} name
 * @param {Object} node
 * @param {'const' | 'let' | 'var' | null} varKind
 * @returns {string}
 */
function classifyDeclarationKind(name, node, varKind) {
  if (name.startsWith('use') && /^[a-z]/.test(name) && name.length > 3 && /^[A-Z]/.test(name[3])) {
    return 'custom-hook';
  }

  if (/^[A-Z]/.test(name) && returnsJsx(node)) {
    return 'react-component';
  }

  if (node.type === 'ClassDeclaration') {
    if (
      node.superClass &&
      ((node.superClass.type === 'Identifier' &&
        ['Component', 'PureComponent'].includes(node.superClass.name)) ||
        (node.superClass.type === 'MemberExpression' &&
          node.superClass.object?.name === 'React' &&
          ['Component', 'PureComponent'].includes(node.superClass.property?.name)))
    ) {
      return 'react-component';
    }
    return 'class';
  }

  if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression'
  ) {
    return 'function';
  }

  if (
    node.type === 'CallExpression' &&
    ((node.callee.type === 'Identifier' && ['memo', 'forwardRef'].includes(node.callee.name)) ||
      (node.callee.type === 'MemberExpression' &&
        node.callee.object?.name === 'React' &&
        ['memo', 'forwardRef'].includes(node.callee.property?.name)))
  ) {
    return 'react-component';
  }

  if (varKind === 'const') {
    return 'constant';
  }

  return 'variable';
}

/**
 * Builds a deterministic dependency graph of top-level declarations in an AST.
 *
 * @param {Object} params
 * @param {import('@babel/types').File} params.ast - Babel File AST.
 * @param {string} params.relativePath - Relative file path for identification.
 * @returns {{
 *   relativePath: string,
 *   imports: Array<{
 *     id: string,
 *     source: string,
 *     importedName: string,
 *     localName: string,
 *     kind: 'default' | 'named' | 'namespace',
 *     line: number
 *   }>,
 *   declarations: Array<{
 *     id: string,
 *     name: string,
 *     kind: string,
 *     lineStart: number,
 *     lineEnd: number,
 *     exported: boolean,
 *     defaultExport: boolean,
 *     dependencies: string[],
 *     dependents: string[],
 *     externalImports: string[],
 *     capturedBindings: string[]
 *   }>
 * }}
 */
export function buildDependencyGraph({ ast, relativePath }) {
  if (!ast || !ast.program) {
    return {
      relativePath: relativePath || '',
      imports: [],
      declarations: []
    };
  }

  const importList = [];
  const importBindings = new Map(); // localName -> importEntry
  const topLevelDeclarations = [];
  const declarationNames = new Set();
  const exportedNames = new Set();
  let defaultExportName = null;

  const nodeToDeclMap = new Map();

  // Pass 1: Collect imports and top-level declaration skeletons
  const programBody = ast.program.body || [];

  for (const statement of programBody) {
    if (!statement) continue;

    const stmtLineStart = statement.loc ? statement.loc.start.line : 1;
    const stmtLineEnd = statement.loc ? statement.loc.end.line : stmtLineStart;

    if (statement.type === 'ImportDeclaration') {
      const source = statement.source.value;
      const specifiers = statement.specifiers || [];

      for (const spec of specifiers) {
        let importedName = 'default';
        let kind = 'named';
        const localName = spec.local.name;

        if (spec.type === 'ImportDefaultSpecifier') {
          importedName = 'default';
          kind = 'default';
        } else if (spec.type === 'ImportNamespaceSpecifier') {
          importedName = '*';
          kind = 'namespace';
        } else if (spec.type === 'ImportSpecifier') {
          importedName = spec.imported ? (spec.imported.name || spec.imported.value) : localName;
          kind = 'named';
        }

        const importEntry = {
          id: `import-${localName}-${stmtLineStart}`,
          source,
          importedName,
          localName,
          kind,
          line: stmtLineStart
        };

        importList.push(importEntry);
        importBindings.set(localName, importEntry);
      }
      continue;
    }

    // Export Named Declarations
    if (statement.type === 'ExportNamedDeclaration') {
      if (statement.declaration) {
        const decl = statement.declaration;
        const lineStart = decl.loc ? decl.loc.start.line : stmtLineStart;
        const lineEnd = decl.loc ? decl.loc.end.line : stmtLineEnd;

        if (decl.type === 'FunctionDeclaration') {
          const name = decl.id ? decl.id.name : 'anonymous';
          exportedNames.add(name);
          declarationNames.add(name);
          const declEntry = {
            id: `decl-${name}-${lineStart}`,
            name,
            kind: classifyDeclarationKind(name, decl, null),
            lineStart,
            lineEnd,
            exported: true,
            defaultExport: false,
            node: decl,
            dependencies: new Set(),
            externalImports: new Set(),
            capturedBindings: new Set()
          };
          topLevelDeclarations.push(declEntry);
          nodeToDeclMap.set(decl, declEntry);
        } else if (decl.type === 'ClassDeclaration') {
          const name = decl.id ? decl.id.name : 'anonymous';
          exportedNames.add(name);
          declarationNames.add(name);
          const declEntry = {
            id: `decl-${name}-${lineStart}`,
            name,
            kind: classifyDeclarationKind(name, decl, null),
            lineStart,
            lineEnd,
            exported: true,
            defaultExport: false,
            node: decl,
            dependencies: new Set(),
            externalImports: new Set(),
            capturedBindings: new Set()
          };
          topLevelDeclarations.push(declEntry);
          nodeToDeclMap.set(decl, declEntry);
        } else if (decl.type === 'VariableDeclaration') {
          const varKind = decl.kind;
          for (const declarator of decl.declarations) {
            if (declarator.id.type === 'Identifier') {
              const name = declarator.id.name;
              const decLineStart = declarator.loc ? declarator.loc.start.line : lineStart;
              const decLineEnd = declarator.loc ? declarator.loc.end.line : lineEnd;
              exportedNames.add(name);
              declarationNames.add(name);
              const declEntry = {
                id: `decl-${name}-${decLineStart}`,
                name,
                kind: classifyDeclarationKind(name, declarator.init || declarator, varKind),
                lineStart: decLineStart,
                lineEnd: decLineEnd,
                exported: true,
                defaultExport: false,
                node: declarator,
                dependencies: new Set(),
                externalImports: new Set(),
                capturedBindings: new Set()
              };
              topLevelDeclarations.push(declEntry);
              nodeToDeclMap.set(declarator, declEntry);
            }
          }
        }
      } else if (statement.specifiers) {
        for (const spec of statement.specifiers) {
          const localName = spec.local ? spec.local.name : null;
          if (localName) {
            exportedNames.add(localName);
          }
        }
      }
      continue;
    }

    // Export Default Declaration
    if (statement.type === 'ExportDefaultDeclaration') {
      const decl = statement.declaration;
      const lineStart = decl?.loc ? decl.loc.start.line : stmtLineStart;
      const lineEnd = decl?.loc ? decl.loc.end.line : stmtLineEnd;

      if (decl) {
        if (decl.type === 'FunctionDeclaration') {
          const name = decl.id ? decl.id.name : 'default';
          defaultExportName = name;
          exportedNames.add(name);
          declarationNames.add(name);
          const declEntry = {
            id: `decl-${name}-${lineStart}`,
            name,
            kind: classifyDeclarationKind(name, decl, null),
            lineStart,
            lineEnd,
            exported: true,
            defaultExport: true,
            node: decl,
            dependencies: new Set(),
            externalImports: new Set(),
            capturedBindings: new Set()
          };
          topLevelDeclarations.push(declEntry);
          nodeToDeclMap.set(decl, declEntry);
        } else if (decl.type === 'ClassDeclaration') {
          const name = decl.id ? decl.id.name : 'default';
          defaultExportName = name;
          exportedNames.add(name);
          declarationNames.add(name);
          const declEntry = {
            id: `decl-${name}-${lineStart}`,
            name,
            kind: classifyDeclarationKind(name, decl, null),
            lineStart,
            lineEnd,
            exported: true,
            defaultExport: true,
            node: decl,
            dependencies: new Set(),
            externalImports: new Set(),
            capturedBindings: new Set()
          };
          topLevelDeclarations.push(declEntry);
          nodeToDeclMap.set(decl, declEntry);
        } else if (decl.type === 'Identifier') {
          defaultExportName = decl.name;
          exportedNames.add(decl.name);
        } else {
          // Anonymous expression export
          const name = 'default';
          defaultExportName = name;
          const declEntry = {
            id: `decl-default-${lineStart}`,
            name,
            kind: classifyDeclarationKind(name, decl, null),
            lineStart,
            lineEnd,
            exported: true,
            defaultExport: true,
            node: decl,
            dependencies: new Set(),
            externalImports: new Set(),
            capturedBindings: new Set()
          };
          topLevelDeclarations.push(declEntry);
          nodeToDeclMap.set(decl, declEntry);
        }
      }
      continue;
    }

    // Plain Top-Level Function Declaration
    if (statement.type === 'FunctionDeclaration') {
      const name = statement.id ? statement.id.name : 'anonymous';
      declarationNames.add(name);
      const declEntry = {
        id: `decl-${name}-${stmtLineStart}`,
        name,
        kind: classifyDeclarationKind(name, statement, null),
        lineStart: stmtLineStart,
        lineEnd: stmtLineEnd,
        exported: false,
        defaultExport: false,
        node: statement,
        dependencies: new Set(),
        externalImports: new Set(),
        capturedBindings: new Set()
      };
      topLevelDeclarations.push(declEntry);
      nodeToDeclMap.set(statement, declEntry);
      continue;
    }

    // Plain Top-Level Class Declaration
    if (statement.type === 'ClassDeclaration') {
      const name = statement.id ? statement.id.name : 'anonymous';
      declarationNames.add(name);
      const declEntry = {
        id: `decl-${name}-${stmtLineStart}`,
        name,
        kind: classifyDeclarationKind(name, statement, null),
        lineStart: stmtLineStart,
        lineEnd: stmtLineEnd,
        exported: false,
        defaultExport: false,
        node: statement,
        dependencies: new Set(),
        externalImports: new Set(),
        capturedBindings: new Set()
      };
      topLevelDeclarations.push(declEntry);
      nodeToDeclMap.set(statement, declEntry);
      continue;
    }

    // Plain Top-Level Variable Declaration
    if (statement.type === 'VariableDeclaration') {
      const varKind = statement.kind;
      for (const declarator of statement.declarations) {
        if (declarator.id.type === 'Identifier') {
          const name = declarator.id.name;
          const decLineStart = declarator.loc ? declarator.loc.start.line : stmtLineStart;
          const decLineEnd = declarator.loc ? declarator.loc.end.line : stmtLineEnd;
          declarationNames.add(name);
          const declEntry = {
            id: `decl-${name}-${decLineStart}`,
            name,
            kind: classifyDeclarationKind(name, declarator.init || declarator, varKind),
            lineStart: decLineStart,
            lineEnd: decLineEnd,
            exported: false,
            defaultExport: false,
            node: declarator,
            dependencies: new Set(),
            externalImports: new Set(),
            capturedBindings: new Set()
          };
          topLevelDeclarations.push(declEntry);
          nodeToDeclMap.set(declarator, declEntry);
        }
      }
      continue;
    }
  }

  // Update export status for declarations exported via specifiers or default identifier
  for (const decl of topLevelDeclarations) {
    if (exportedNames.has(decl.name)) {
      decl.exported = true;
    }
    if (defaultExportName === decl.name) {
      decl.defaultExport = true;
    }
  }

  // Pass 2: Single AST traversal for all identifier & JSX identifier references
  traverse(ast, {
    JSXIdentifier(path) {
      const name = path.node.name;
      // Only inspect element tags: <Component /> or <Component.Sub />
      if (
        (path.parentPath.isJSXOpeningElement() && path.parentPath.node.name === path.node) ||
        (path.parentPath.isJSXMemberExpression() && path.parentPath.node.object === path.node)
      ) {
        processRef(path, name);
      }
    },

    Identifier(path) {
      if (!path.isReferencedIdentifier()) {
        return;
      }
      const name = path.node.name;
      processRef(path, name);
    }
  });

  /**
   * Helper to find enclosing top-level declaration and record reference.
   * @param {Object} path
   * @param {string} name
   */
  function processRef(path, name) {
    // Find enclosing top-level declaration
    let declEntry = null;
    let currPath = path;
    while (currPath && currPath.node && currPath.node.type !== 'Program') {
      if (nodeToDeclMap.has(currPath.node)) {
        declEntry = nodeToDeclMap.get(currPath.node);
        break;
      }
      currPath = currPath.parentPath;
    }

    if (!declEntry || name === declEntry.name) {
      return;
    }

    const binding = path.scope.getBinding(name);

    if (binding) {
      // Check if binding scope is local to the declaration
      const isLocal = isScopeDescendantOrEqual(binding.scope, path.scope, declEntry.node);
      if (isLocal) {
        return;
      }

      if (binding.scope.block.type === 'Program') {
        if (importBindings.has(name)) {
          declEntry.externalImports.add(name);
        } else if (declarationNames.has(name)) {
          declEntry.dependencies.add(name);
        }
        return;
      }

      declEntry.capturedBindings.add(name);
    } else {
      if (importBindings.has(name)) {
        declEntry.externalImports.add(name);
      } else if (declarationNames.has(name)) {
        declEntry.dependencies.add(name);
      }
    }
  }

  // Pass 3: Construct reverse dependents and format results
  const results = [];
  const reverseDependentsMap = new Map();

  for (const decl of topLevelDeclarations) {
    for (const dep of decl.dependencies) {
      if (!reverseDependentsMap.has(dep)) {
        reverseDependentsMap.set(dep, new Set());
      }
      reverseDependentsMap.get(dep).add(decl.name);
    }
  }

  for (const decl of topLevelDeclarations) {
    const dependents = reverseDependentsMap.has(decl.name)
      ? Array.from(reverseDependentsMap.get(decl.name)).sort()
      : [];

    results.push({
      id: decl.id,
      name: decl.name,
      kind: decl.kind,
      lineStart: decl.lineStart,
      lineEnd: decl.lineEnd,
      exported: decl.exported,
      defaultExport: decl.defaultExport,
      dependencies: Array.from(decl.dependencies).sort(),
      dependents,
      externalImports: Array.from(decl.externalImports).sort(),
      capturedBindings: Array.from(decl.capturedBindings).sort()
    });
  }

  // Deterministic sorting: lineStart ASC, lineEnd ASC, name ASC, id ASC
  results.sort((a, b) => {
    if (a.lineStart !== b.lineStart) return a.lineStart - b.lineStart;
    if (a.lineEnd !== b.lineEnd) return a.lineEnd - b.lineEnd;
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.id.localeCompare(b.id);
  });

  importList.sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return a.localName.localeCompare(b.localName);
  });

  return {
    relativePath: relativePath || '',
    imports: importList,
    declarations: results
  };
}

/**
 * Checks if a binding's scope is within the declaration root node.
 * @param {Object} bindingScope
 * @param {Object} _refScope
 * @param {Object} declNode
 * @returns {boolean}
 */
function isScopeDescendantOrEqual(bindingScope, _refScope, declNode) {
  let curr = bindingScope;
  while (curr) {
    if (curr.block === declNode) {
      return true;
    }
    curr = curr.parent;
  }
  return false;
}
