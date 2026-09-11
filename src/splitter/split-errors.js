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

/**
 * Error class thrown when a requested candidate ID is not found in the source file.
 */
export class CandidateNotFoundError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.candidateId]
   * @param {string[]} [options.validCandidates=[]]
   * @param {string} [options.filePath]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'CandidateNotFoundError';
    this.candidateId = options.candidateId;
    this.validCandidates = options.validCandidates || [];
    this.filePath = options.filePath;
  }
}

/**
 * Error class thrown when an extraction is blocked or unsafe.
 */
export class UnsafeExtractionError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.candidateId]
   * @param {string} [options.reason]
   * @param {string[]} [options.risks=[]]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'UnsafeExtractionError';
    this.candidateId = options.candidateId;
    this.reason = options.reason;
    this.risks = options.risks || [];
  }
}

/**
 * Error class thrown when target file already exists on disk.
 */
export class TargetCollisionError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.targetPath]
   * @param {string} [options.reason]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'TargetCollisionError';
    this.targetPath = options.targetPath;
    this.reason = options.reason;
  }
}

/**
 * Error class thrown when target path escapes project root directory.
 */
export class TargetOutsideProjectError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.targetPath]
   * @param {string} [options.projectRoot]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'TargetOutsideProjectError';
    this.targetPath = options.targetPath;
    this.projectRoot = options.projectRoot;
  }
}

/**
 * Error class thrown when extracted code contains unresolved bindings.
 */
export class UnresolvedBindingError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.symbol]
   * @param {string[]} [options.bindings=[]]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'UnresolvedBindingError';
    this.symbol = options.symbol;
    this.bindings = options.bindings || [];
  }
}

/**
 * Error class thrown when a circular import cycle is detected.
 */
export class CircularDependencyError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string[]} [options.cyclePath=[]]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'CircularDependencyError';
    this.cyclePath = options.cyclePath || [];
  }
}

/**
 * Error class thrown when in-memory AST preview code generation fails.
 */
export class PreviewGenerationError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.filePath]
   * @param {string} [options.reason]
   * @param {unknown} [options.cause]
   */
  constructor(message, options = {}) {
    super(message, options.cause);
    this.name = 'PreviewGenerationError';
    this.filePath = options.filePath;
    this.reason = options.reason;
  }
}

/**
 * Error class thrown when generated transformation AST or code fails validation.
 */
export class TransformationValidationError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string[]} [options.validationErrors=[]]
   * @param {unknown} [options.cause]
   */
  constructor(message, options = {}) {
    super(message, options.cause);
    this.name = 'TransformationValidationError';
    this.validationErrors = options.validationErrors || [];
  }
}

