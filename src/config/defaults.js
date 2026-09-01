/**
 * Default configuration constants for ai-code-reviewer.
 * Defined as an immutable, deep-frozen object to prevent accidental mutation.
 */

/**
 * @typedef {Object} ComplexityConfig
 * @property {boolean} enabled - Whether complexity analysis is active.
 * @property {number} maxFunctionLines - Maximum allowable line count for a function.
 * @property {number} maxParameters - Maximum allowable parameter count for a function.
 * @property {number} maxCyclomaticComplexity - Maximum allowable cyclomatic complexity score.
 * @property {number} maxNestingDepth - Maximum allowable decision nesting depth.
 */

/**
 * @typedef {Object} AnalyzersConfig
 * @property {ComplexityConfig} complexity - Complexity analyzer settings.
 */

/**
 * @typedef {Object} ReviewerConfig
 * @property {readonly string[]} include - Glob patterns for files to include in the review.
 * @property {readonly string[]} exclude - Glob patterns for files and directories to exclude from the review.
 * @property {'terminal' | 'json'} outputFormat - Default output reporter format.
 * @property {number} concurrency - Maximum parallel file analyzers to run.
 * @property {'low' | 'medium' | 'high' | 'critical'} severityThreshold - Minimum issue severity to report.
 * @property {number} maxFiles - Maximum number of files to discover/review.
 * @property {number} maxFileSizeKb - Maximum size in kilobytes for a single file to be analyzed.
 * @property {AnalyzersConfig} analyzers - Analyzer-specific configuration settings.
 */

/**
 * Immutable default configuration values.
 * @type {Readonly<ReviewerConfig>}
 */
export const DEFAULT_CONFIG = Object.freeze({
  include: Object.freeze([
    '**/*.js',
    '**/*.jsx',
    '**/*.mjs',
    '**/*.cjs'
  ]),
  exclude: Object.freeze([
    'node_modules/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '.next/**',
    'public/**',
    'vendor/**',
    '**/*.min.js'
  ]),
  outputFormat: 'terminal',
  concurrency: 2,
  severityThreshold: 'medium',
  maxFiles: 100,
  maxFileSizeKb: 150,
  analyzers: Object.freeze({
    complexity: Object.freeze({
      enabled: true,
      maxFunctionLines: 80,
      maxParameters: 5,
      maxCyclomaticComplexity: 10,
      maxNestingDepth: 4
    })
  })
});

export const CONFIG_FILE_NAME = '.aireviewerrc.json';
export const IGNORE_FILE_NAME = '.aireviewerignore';
