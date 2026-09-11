/**
 * AST Utilities module for ACR Code Splitter.
 * Provides safe cloning, AST transformation helpers, parsing, code generation,
 * and scope analysis helpers using Babel.
 */

import { parse } from '@babel/parser';
import generatorPkg from '@babel/generator';
import traversePkg from '@babel/traverse';
import * as t from '@babel/types';

export const generate = generatorPkg.default || generatorPkg;
export const traverse = traversePkg.default || traversePkg;
export { t };

/**
 * Converts a PascalCase, camelCase, or CONSTANT_CASE symbol name into a kebab-case identifier.
 * e.g., 'UserCard' -> 'user-card', 'useUserSearch' -> 'use-user-search', 'formatDate' -> 'format-date',
 * 'PRODUCT_STATUS' -> 'product-status'
 *
 * @param {string} symbolName
 * @returns {string}
 */
export function toKebabId(symbolName) {
  if (!symbolName || typeof symbolName !== 'string') {
    return 'candidate';
  }

  return symbolName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z0-9])/g, '$1-$2')
    .replace(/[_\s.]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '');
}

/**
 * Parses source code into a Babel AST with support for JSX and TypeScript.
 *
 * @param {string} source
 * @param {string} [filePath='file.jsx']
 * @returns {import('@babel/types').File}
 */
export function parseAst(source, filePath = 'file.jsx') {
  return parse(source, {
    sourceType: 'unambiguous',
    sourceFilename: filePath,
    allowAwaitOutsideFunction: true,
    errorRecovery: false,
    ranges: true,
    tokens: false,
    attachComment: true,
    plugins: ['jsx', 'typescript']
  });
}

/**
 * Generates formatted code string from an AST node.
 *
 * @param {import('@babel/types').Node} ast
 * @param {Object} [options={}]
 * @returns {string}
 */
export function generateCode(ast, options = {}) {
  const result = generate(ast, {
    retainLines: false,
    compact: false,
    comments: true,
    jsescOption: {
      minimal: true
    },
    ...options
  });
  return typeof result === 'string' ? result : result.code;
}

/**
 * Deeply clones an AST node.
 *
 * @param {import('@babel/types').Node} node
 * @returns {import('@babel/types').Node}
 */
export function cloneAstNode(node) {
  if (!node) return node;
  return t.cloneNode(node, /* deep */ true);
}

/**
 * Extracts directives from a Program node (e.g., 'use client', 'use server').
 *
 * @param {import('@babel/types').Program} programNode
 * @returns {string[]}
 */
export function extractDirectives(programNode) {
  if (!programNode || !Array.isArray(programNode.directives)) {
    return [];
  }
  return programNode.directives.map((d) => d.value.value);
}

/**
 * Checks if a given AST subtree contains JSX elements or fragments.
 *
 * @param {import('@babel/types').Node} rootNode
 * @returns {boolean}
 */
export function containsJsx(rootNode) {
  if (!rootNode) return false;
  let found = false;

  function walk(node) {
    if (!node || typeof node !== 'object' || found) return;
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      found = true;
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'tokens' || key === 'comments' || key === 'parent') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c === 'object') walk(c);
        }
      } else if (child && typeof child === 'object') {
        walk(child);
      }
    }
  }

  walk(rootNode);
  return found;
}

/**
 * Checks if a given AST subtree contains TypeScript type annotations or syntax.
 *
 * @param {import('@babel/types').Node} rootNode
 * @returns {boolean}
 */
export function containsTypeScriptSyntax(rootNode) {
  if (!rootNode) return false;
  let found = false;

  function walk(node) {
    if (!node || typeof node !== 'object' || found) return;
    if (
      node.type?.startsWith('TS') ||
      node.type === 'TSTypeAnnotation' ||
      node.type === 'TSInterfaceDeclaration' ||
      node.type === 'TSTypeAliasDeclaration' ||
      node.type === 'TSEnumDeclaration' ||
      node.type === 'TSAsExpression' ||
      node.type === 'TSTypeParameterDeclaration'
    ) {
      found = true;
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'tokens' || key === 'comments' || key === 'parent') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c === 'object') walk(c);
        }
      } else if (child && typeof child === 'object') {
        walk(child);
      }
    }
  }

  walk(rootNode);
  return found;
}
