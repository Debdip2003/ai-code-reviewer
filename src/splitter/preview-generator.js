/**
 * In-Memory AST Preview Generator module for ACR Code Splitter.
 * Constructs proposed target and source file ASTs in memory using Babel,
 * ensuring zero file modifications on disk.
 */

import { cloneAstNode, extractDirectives, generateCode, t } from './ast-utils.js';
import { injectComponentProps, createJsxAttributes } from './prop-planner.js';
import { PreviewGenerationError } from './split-errors.js';

/**
 * Builds AST import declaration nodes from planned import definitions.
 *
 * @param {Array<{ source: string, specifiers: Array<{ local: string, imported: string, kind: string }>, kind: string }>} importsList
 * @returns {Array<import('@babel/types').ImportDeclaration>}
 */
export function buildImportDeclarations(importsList) {
  const declarations = [];

  for (const imp of importsList) {
    const specifierNodes = [];
    for (const spec of imp.specifiers) {
      if (spec.kind === 'default') {
        specifierNodes.push(t.importDefaultSpecifier(t.identifier(spec.local)));
      } else if (spec.kind === 'namespace') {
        specifierNodes.push(t.importNamespaceSpecifier(t.identifier(spec.local)));
      } else {
        specifierNodes.push(
          t.importSpecifier(t.identifier(spec.local), t.identifier(spec.imported || spec.local))
        );
      }
    }
    declarations.push(t.importDeclaration(specifierNodes, t.stringLiteral(imp.source)));
  }

  return declarations;
}

/**
 * Generates proposed source and target file contents in memory.
 *
 * @param {Object} params
 * @param {import('@babel/types').File} params.ast - Cloned or original source AST.
 * @param {Object} params.candidate - Candidate definition.
 * @param {string} params.sourceFile - Source file relative path.
 * @param {string} params.targetFile - Target file relative path.
 * @param {Object} params.extractionContract - Extraction boundary contract.
 * @param {Object} params.propPlan - Planned props and parameter mappings.
 * @param {Object} params.importPlan - Planned imports for target and source.
 * @param {Object} params.exportPlan - Planned exports.
 * @param {string[]} params.movedDependencies - Names of declarations moving to target.
 * @returns {{
 *   proposedSourceCode: string,
 *   proposedTargetCode: string,
 *   operations: Array<{ type: 'create-file' | 'update-file', path: string }>
 * }}
 */
export function generateTransformationPreviews({
  ast,
  candidate,
  sourceFile,
  targetFile,
  extractionContract: _extractionContract,
  propPlan,
  importPlan,
  exportPlan,
  movedDependencies = []
}) {
  try {
    const movedSymbols = new Set([candidate.symbolName, ...movedDependencies]);
    const sourceAst = cloneAstNode(ast);
    const directives = extractDirectives(sourceAst.program);

    // ==========================================
    // 1. CONSTRUCT PROPOSED TARGET FILE AST
    // ==========================================
    const targetBody = [];

    // Add target imports
    const targetImportNodes = buildImportDeclarations(importPlan.targetImports);
    targetBody.push(...targetImportNodes);

    // Find and extract moved declarations and candidate node from source AST
    let candidateDeclNode = null;
    const movedDeclNodes = [];

    // Helper to check if a top-level statement is candidate or moved dependency
    function inspectTopLevelStatement(stmt) {
      if (!stmt) return null;

      if (stmt.type === 'FunctionDeclaration' && stmt.id) {
        if (stmt.id.name === candidate.symbolName) {
          return { type: 'candidate', node: stmt };
        }
        if (movedSymbols.has(stmt.id.name)) {
          return { type: 'moved', node: stmt, name: stmt.id.name };
        }
      }

      if (stmt.type === 'VariableDeclaration') {
        for (const decl of stmt.declarations) {
          if (decl.id?.type === 'Identifier') {
            if (decl.id.name === candidate.symbolName) {
              return { type: 'candidate', node: stmt, declarator: decl };
            }
            if (movedSymbols.has(decl.id.name)) {
              return { type: 'moved', node: stmt, name: decl.id.name };
            }
          }
        }
      }

      if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
        return inspectTopLevelStatement(stmt.declaration);
      }

      if (stmt.type === 'ExportDefaultDeclaration' && stmt.declaration) {
        if (stmt.declaration.id?.name === candidate.symbolName) {
          return { type: 'candidate', node: stmt.declaration };
        }
      }

      return null;
    }

    // Traverse top-level program body to find candidate & moved declarations
    for (const stmt of sourceAst.program.body) {
      const match = inspectTopLevelStatement(stmt);
      if (match?.type === 'candidate') {
        candidateDeclNode = cloneAstNode(match.node);
      } else if (match?.type === 'moved') {
        movedDeclNodes.push(cloneAstNode(match.node));
      }
    }

    // If candidate was nested inside another function, find it
    let isNested = false;
    if (!candidateDeclNode) {
      function findNested(node) {
        if (!node || typeof node !== 'object' || candidateDeclNode) return;
        if (
          (node.type === 'FunctionDeclaration' && node.id?.name === candidate.symbolName) ||
          (node.type === 'VariableDeclarator' && node.id?.name === candidate.symbolName)
        ) {
          if (node.type === 'VariableDeclarator') {
            // Convert variable declarator to function declaration or const declaration
            if (
              node.init &&
              (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')
            ) {
              candidateDeclNode = t.functionDeclaration(
                t.identifier(candidate.symbolName),
                node.init.params,
                node.init.body.type === 'BlockStatement'
                  ? node.init.body
                  : t.blockStatement([t.returnStatement(node.init.body)]),
                node.init.generator,
                node.init.async
              );
            } else {
              candidateDeclNode = t.variableDeclaration('const', [cloneAstNode(node)]);
            }
          } else {
            candidateDeclNode = cloneAstNode(node);
          }
          isNested = true;
          return;
        }

        for (const key of Object.keys(node)) {
          if (key === 'loc' || key === 'tokens' || key === 'comments' || key === 'parent') continue;
          const val = node[key];
          if (Array.isArray(val)) {
            for (const c of val) {
              if (c && typeof c === 'object') findNested(c);
            }
          } else if (val && typeof val === 'object') {
            findNested(val);
          }
        }
      }
      findNested(sourceAst.program);
    }

    if (!candidateDeclNode) {
      throw new PreviewGenerationError(
        `Failed to locate AST node for candidate symbol "${candidate.symbolName}"`,
        { filePath: sourceFile, reason: 'symbol-node-not-found' }
      );
    }

    // Add moved helper declarations to target
    for (const movedNode of movedDeclNodes) {
      const declToAppend =
        movedNode.type === 'ExportNamedDeclaration' ? movedNode.declaration : movedNode;
      targetBody.push(declToAppend);
    }

    // If candidate has props, inject destructured props into candidate function node
    let finalCandidateNode = candidateDeclNode;
    if (propPlan.props.length > 0 && finalCandidateNode.type === 'FunctionDeclaration') {
      finalCandidateNode = injectComponentProps(finalCandidateNode, propPlan.props);
    }

    // Wrap candidate in named export
    const exportedCandidateNode =
      finalCandidateNode.type === 'FunctionDeclaration'
        ? t.exportNamedDeclaration(finalCandidateNode)
        : t.exportNamedDeclaration(
            finalCandidateNode.type === 'VariableDeclaration'
              ? finalCandidateNode
              : t.variableDeclaration('const', [
                  t.variableDeclarator(t.identifier(candidate.symbolName), finalCandidateNode)
                ])
          );

    targetBody.push(exportedCandidateNode);

    // Create target Program AST
    const targetProgram = t.program(
      targetBody,
      directives.map((d) => t.directive(t.directiveLiteral(d)))
    );
    const targetFileAst = t.file(targetProgram);
    const proposedTargetCode = generateCode(targetFileAst);

    // ==========================================
    // 2. CONSTRUCT PROPOSED SOURCE FILE AST
    // ==========================================
    const updatedSourceBody = [];

    // A. Add new source imports (importing extracted candidate from targetFile)
    const sourceNewImportNodes = buildImportDeclarations(importPlan.sourceNewImports);
    updatedSourceBody.push(...sourceNewImportNodes);

    // B. Retain remaining top-level statements, removing moved and extracted declarations
    for (const stmt of sourceAst.program.body) {
      const match = inspectTopLevelStatement(stmt);
      if (match?.type === 'candidate' || match?.type === 'moved') {
        // Skip - this declaration has moved to target
        continue;
      }
      updatedSourceBody.push(stmt);
    }

    // C. If candidate was nested, remove nested declaration and update call sites inside parent
    if (isNested) {
      function cleanNestedAndCallSites(node) {
        if (!node || typeof node !== 'object') return;

        // Clean from BlockStatement body
        if (node.type === 'BlockStatement' && Array.isArray(node.body)) {
          node.body = node.body.filter((child) => {
            if (child.type === 'FunctionDeclaration' && child.id?.name === candidate.symbolName) {
              return false;
            }
            if (
              child.type === 'VariableDeclaration' &&
              child.declarations.some((d) => d.id?.name === candidate.symbolName)
            ) {
              return false;
            }
            return true;
          });
        }

        // Update JSX call sites: <UserCard /> -> <UserCard prop1={val1} prop2={val2} />
        if (node.type === 'JSXElement' && node.openingElement?.name?.name === candidate.symbolName) {
          if (propPlan.callSiteProps.length > 0) {
            const existingAttrNames = new Set(
              node.openingElement.attributes
                .filter((a) => a.type === 'JSXAttribute')
                .map((a) => a.name?.name)
            );
            const newAttributes = createJsxAttributes(
              propPlan.callSiteProps.filter((p) => !existingAttrNames.has(p.name))
            );
            node.openingElement.attributes.push(...newAttributes);
          }
        }

        for (const key of Object.keys(node)) {
          if (key === 'loc' || key === 'tokens' || key === 'comments' || key === 'parent') continue;
          const val = node[key];
          if (Array.isArray(val)) {
            for (const c of val) {
              if (c && typeof c === 'object') cleanNestedAndCallSites(c);
            }
          } else if (val && typeof val === 'object') {
            cleanNestedAndCallSites(val);
          }
        }
      }

      for (const stmt of updatedSourceBody) {
        cleanNestedAndCallSites(stmt);
      }
    }

    // D. If candidate was originally exported, add re-export to source if not already present
    for (const reExp of exportPlan.sourceReExports || []) {
      const relTargetPath = importPlan.sourceNewImports[0]?.source;
      if (relTargetPath) {
        const reExportNode = t.exportNamedDeclaration(
          null,
          [t.exportSpecifier(t.identifier(reExp.name), t.identifier(reExp.name))],
          t.stringLiteral(relTargetPath)
        );
        updatedSourceBody.push(reExportNode);
      }
    }

    const sourceProgram = t.program(
      updatedSourceBody,
      directives.map((d) => t.directive(t.directiveLiteral(d)))
    );
    const sourceFileAst = t.file(sourceProgram);
    const proposedSourceCode = generateCode(sourceFileAst);

    return {
      proposedSourceCode,
      proposedTargetCode,
      operations: [
        {
          type: 'create-file',
          path: targetFile
        },
        {
          type: 'update-file',
          path: sourceFile
        }
      ]
    };
  } catch (err) {
    if (err instanceof PreviewGenerationError) throw err;
    throw new PreviewGenerationError(`Failed to generate AST transformation preview: ${err.message}`, {
      filePath: sourceFile,
      reason: 'ast-generation-failure',
      cause: err
    });
  }
}
