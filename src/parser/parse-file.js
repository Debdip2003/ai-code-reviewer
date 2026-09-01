/**
 * File reading and parsing boundary module.
 * Safely reads source files from disk and triggers AST parsing.
 */

import fs from 'node:fs/promises';
import { parseJavaScript } from './parse-javascript.js';

/**
 * Reads a JavaScript/JSX file from disk and parses it into an AST.
 *
 * @param {Object} params
 * @param {string} params.absolutePath - Absolute path to the source file on disk.
 * @param {string} params.relativePath - Relative path used for error context and reporting.
 * @returns {Promise<{
 *   absolutePath: string,
 *   relativePath: string,
 *   source: string,
 *   ast: import('@babel/parser').ParseResult<import('@babel/types').File>
 * }>}
 * @throws {TypeError} If path arguments are invalid.
 * @throws {Error} If the file contains null bytes or cannot be read.
 * @throws {import('./parse-javascript.js').JavaScriptParseError} If parsing fails.
 */
export async function parseFile({ absolutePath, relativePath }) {
  if (typeof absolutePath !== 'string' || absolutePath.trim().length === 0) {
    throw new TypeError('Absolute path must be a non-empty string.');
  }

  if (typeof relativePath !== 'string' || relativePath.trim().length === 0) {
    throw new TypeError('Relative path must be a non-empty string.');
  }

  let source;
  try {
    source = await fs.readFile(absolutePath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read file at "${absolutePath}": ${error.message}`, { cause: error });
  }

  // Reject binary or unsupported files containing null bytes
  if (source.includes('\0')) {
    throw new Error(`Cannot parse binary or unsupported file with null bytes: "${relativePath}"`);
  }

  const ast = parseJavaScript({
    source,
    filePath: relativePath
  });

  return {
    absolutePath,
    relativePath,
    source,
    ast
  };
}
