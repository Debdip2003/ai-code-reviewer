/**
 * Central exit code definitions for ACR CLI.
 * Standardizes process exit codes across commands and error handling.
 */

export const EXIT_CODES = Object.freeze({
  /** Successful execution without threshold-reaching findings */
  SUCCESS: 0,
  /** Review findings met or exceeded configured severity threshold */
  FINDINGS: 1,
  /** Execution error (configuration, parse, analyzer, Git, or runtime failure) */
  EXECUTION_ERROR: 2,
  /** Process interrupted by user cancellation (SIGINT / SIGTERM) */
  INTERRUPTED: 130
});
