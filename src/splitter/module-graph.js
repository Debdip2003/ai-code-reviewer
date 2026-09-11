/**
 * Local Module Graph module for ACR Code Splitter.
 * Constructs a graph of local module dependencies resolving relative paths,
 * extensions, and index files while ignoring external node_modules.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseAst } from './ast-utils.js';

const RESOLUTION_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];

/**
 * Resolves a local module import specifier to a relative file path within the project.
 *
 * @param {string} fromFile - Relative path of importing file.
 * @param {string} importSpecifier - Import path string (e.g. './utils', '../types.ts').
 * @param {string} projectRoot - Absolute project root directory.
 * @returns {Promise<string | null>} Resolved relative file path or null if external/unresolved.
 */
export async function resolveLocalModule(fromFile, importSpecifier, projectRoot) {
  if (!importSpecifier.startsWith('.')) {
    // External module (node_modules or alias)
    return null;
  }

  const fromDir = path.dirname(path.resolve(projectRoot, fromFile));
  const candidatePath = path.resolve(fromDir, importSpecifier);

  // 1. Direct file existence
  try {
    const stat = await fs.stat(candidatePath);
    if (stat.isFile()) {
      return path.relative(projectRoot, candidatePath).replace(/\\/g, '/');
    }
  } catch {
    // try extensions
  }

  // 2. Try extensions
  for (const ext of RESOLUTION_EXTENSIONS) {
    const withExt = candidatePath + ext;
    try {
      const stat = await fs.stat(withExt);
      if (stat.isFile()) {
        return path.relative(projectRoot, withExt).replace(/\\/g, '/');
      }
    } catch {
      // continue
    }
  }

  // 3. Try directory index files
  for (const ext of RESOLUTION_EXTENSIONS) {
    const indexFile = path.join(candidatePath, `index${ext}`);
    try {
      const stat = await fs.stat(indexFile);
      if (stat.isFile()) {
        return path.relative(projectRoot, indexFile).replace(/\\/g, '/');
      }
    } catch {
      // continue
    }
  }

  return null;
}

/**
 * Extracts import source specifiers from a file's AST.
 *
 * @param {import('@babel/types').File} ast
 * @returns {string[]}
 */
export function extractImportSources(ast) {
  if (!ast || !ast.program || !Array.isArray(ast.program.body)) {
    return [];
  }

  const sources = [];
  for (const stmt of ast.program.body) {
    if (stmt.type === 'ImportDeclaration' && stmt.source?.value) {
      sources.push(stmt.source.value);
    } else if (
      (stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportAllDeclaration') &&
      stmt.source?.value
    ) {
      sources.push(stmt.source.value);
    }
  }

  return sources;
}

/**
 * Builds a local module dependency graph starting from a list of files.
 *
 * @param {Object} params
 * @param {string[]} params.entryFiles - Relative file paths to trace.
 * @param {string} params.projectRoot - Absolute project root.
 * @param {Map<string, string>} [params.fileContentOverrides] - In-memory file content overrides.
 * @returns {Promise<Map<string, Set<string>>>} Map of relativeFilePath -> Set of imported relativeFilePaths.
 */
export async function buildLocalModuleGraph({
  entryFiles,
  projectRoot,
  fileContentOverrides = new Map()
}) {
  const graph = new Map();
  const queue = [...entryFiles];
  const visited = new Set();

  while (queue.length > 0) {
    const currentFile = queue.shift();
    if (visited.has(currentFile)) continue;
    visited.add(currentFile);

    if (!graph.has(currentFile)) {
      graph.set(currentFile, new Set());
    }

    let source = fileContentOverrides.get(currentFile);
    if (source === undefined) {
      const absPath = path.resolve(projectRoot, currentFile);
      try {
        source = await fs.readFile(absPath, 'utf-8');
      } catch {
        // File might not exist on disk (e.g. proposed new target)
        continue;
      }
    }

    let ast;
    try {
      ast = parseAst(source, currentFile);
    } catch {
      continue;
    }

    const importSources = extractImportSources(ast);
    for (const spec of importSources) {
      const resolved = await resolveLocalModule(currentFile, spec, projectRoot);
      if (resolved) {
        graph.get(currentFile).add(resolved);
        if (!visited.has(resolved)) {
          queue.push(resolved);
        }
      }
    }
  }

  return graph;
}
