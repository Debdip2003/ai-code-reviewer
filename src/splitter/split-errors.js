/**
 * Specialized error classes for ACR Code Splitter.
 */

/**
 * Base error class for code splitting operations.
 */
export class SplitError extends Error {
  /**
   * @param {string} message - Error description.
   * @param {unknown} [cause] - Underlying cause.
   */
  constructor(message, cause) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'SplitError';
  }
}

/**
 * Error class for invalid splitter input parameters, paths, or file contents.
 */
export class SplitInputError extends SplitError {
  /**
   * @param {string} message - Error description.
   * @param {Object} [options={}]
   * @param {string} [options.filePath] - File path involved.
   * @param {string} [options.reason] - Specific failure reason.
   * @param {unknown} [options.cause] - Underlying cause.
   */
  constructor(message, options = {}) {
    super(message, options.cause);
    this.name = 'SplitInputError';
    this.filePath = options.filePath;
    this.reason = options.reason;
  }
}

/**
 * Error class for split plan validation failures.
 */
export class SplitValidationError extends SplitError {
  /**
   * @param {string} message - Error description.
   * @param {Object} [options={}]
   * @param {string[]} [options.validationErrors=[]] - List of validation error messages.
   * @param {unknown} [options.cause] - Underlying cause.
   */
  constructor(message, options = {}) {
    super(message, options.cause);
    this.name = 'SplitValidationError';
    this.validationErrors = options.validationErrors || [];
  }
}

/**
 * Error class for AI-assisted split planning failures.
 */
export class SplitAIPlanningError extends SplitError {
  /**
   * @param {string} message - Error description.
   * @param {unknown} [cause] - Underlying cause.
   */
  constructor(message, cause) {
    super(message, cause);
    this.name = 'SplitAIPlanningError';
  }
}
