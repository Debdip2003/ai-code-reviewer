/**
 * JavaScript and JSX parser module using @babel/parser.
 * Responsible for parsing JavaScript and React source code into an Abstract Syntax Tree (AST)
 * without executing source code or altering inputs.
 */

import { parse } from '@babel/parser';

/**
 * Custom error class for JavaScript/JSX parsing failures.
 * Note: `column` stores the original 0-based Babel column offset.
 */
export class JavaScriptParseError extends Error {
  /**
   * @param {string} message - Formatted error message.
   * @param {Object} [options={}]
   * @param {string} [options.filePath] - File path associated with the parse error.
   * @param {number} [options.line] - 1-based line number of the parse error.
   * @param {number} [options.column] - 0-based column index from Babel parser.
   * @param {string} [options.reason] - Short description of the syntax issue.
   * @param {unknown} [options.cause] - Original underlying error.
   */
  constructor(message, options = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'JavaScriptParseError';
    this.filePath = options.filePath;
    this.line = options.line;
    this.column = options.column; // 0-based column index
    this.reason = options.reason;
  }
}

/**
 * Parses JavaScript or JSX source code into a Babel AST representation.
 *
 * @param {Object} params
 * @param {string} params.source - Raw JavaScript/JSX source code.
 * @param {string} params.filePath - Relative or absolute file path for error context.
 * @returns {import('@babel/parser').ParseResult<import('@babel/types').File>} Babel File AST.
 * @throws {TypeError} When parameters are invalid.
 * @throws {JavaScriptParseError} When syntax errors prevent parsing.
 */
export function parseJavaScript({ source, filePath }) {
  if (typeof source !== 'string') {
    throw new TypeError('Source code must be a string.');
  }

  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new TypeError('File path must be a non-empty string.');
  }

  try {
    return parse(source, {
      sourceType: 'unambiguous',
      sourceFilename: filePath,
      allowAwaitOutsideFunction: true,
      errorRecovery: false,
      ranges: true,
      tokens: false,
      attachComment: true,
      plugins: ['jsx']
    });
  } catch (error) {
    let line = 1;
    let column = 0; // 0-based

    if (error && typeof error === 'object') {
      if (error.loc && typeof error.loc.line === 'number') {
        line = error.loc.line;
        column = typeof error.loc.column === 'number' ? error.loc.column : 0;
      } else {
        if (typeof error.line === 'number') line = error.line;
        if (typeof error.column === 'number') column = error.column;
      }
    }

    let reason = '';
    if (error && typeof error.reasonCode === 'string') {
      reason = error.reasonCode;
    } else if (error && typeof error.message === 'string') {
      reason = error.message.replace(/\s*\(\d+:\d+\)$/, '').trim();
    }
    if (!reason) {
      reason = 'Unexpected token';
    }

    const message = `Unable to parse ${filePath} at ${line}:${column}: ${reason}`;

    throw new JavaScriptParseError(message, {
      filePath,
      line,
      column,
      reason,
      cause: error
    });
  }
}
