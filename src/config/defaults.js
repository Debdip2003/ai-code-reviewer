/**
 * Default configuration constants for ai-code-reviewer.
 * Defined as an immutable object to prevent accidental mutation.
 */

/**
 * @typedef {Object} ReviewerConfig
 * @property {readonly string[]} supportedExtensions - File extensions eligible for review.
 * @property {'terminal' | 'json'} format - Default output reporter format.
 * @property {number} concurrency - Maximum parallel file analyzers to run.
 * @property {'low' | 'medium' | 'high' | 'critical'} severityThreshold - Minimum issue severity to report.
 */

/**
 * Immutable default configuration values.
 * @type {Readonly<ReviewerConfig>}
 */
export const DEFAULT_CONFIG = Object.freeze({
  supportedExtensions: Object.freeze(['.js', '.jsx', '.mjs', '.cjs']),
  format: 'terminal',
  concurrency: 2,
  severityThreshold: 'medium',
});
