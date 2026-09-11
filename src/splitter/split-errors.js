/**
 * Specialized error classes and exit codes for ACR Code Splitter.
 */

/**
 * Standard exit codes for ACR Split commands.
 */
export const SPLIT_EXIT_CODES = Object.freeze({
  /** Success or user cancellation before changes */
  SUCCESS: 0,
  /** Unexpected internal failure */
  INTERNAL_FAILURE: 1,
  /** Invalid CLI usage */
  INVALID_USAGE: 2,
  /** Unsafe or blocked transformation */
  UNSAFE_TRANSFORMATION: 3,
  /** Confirmation required in non-interactive mode */
  CONFIRMATION_REQUIRED: 4,
  /** Source changed or file conflict */
  SOURCE_CHANGED: 5,
  /** Write or post-write validation failure */
  WRITE_VALIDATION_FAILURE: 6,
  /** Rollback conflict or rollback failure */
  ROLLBACK_CONFLICT: 7,
  /** Operation locked by another process */
  OPERATION_LOCKED: 8,
  /** Process interrupted by user (SIGINT / SIGTERM) */
  INTERRUPTED: 130
});

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
    this.code = 'SPLIT_ERROR';
    this.exitCode = SPLIT_EXIT_CODES.INTERNAL_FAILURE;
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
    this.code = 'INVALID_INPUT';
    this.exitCode = SPLIT_EXIT_CODES.INVALID_USAGE;
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
    this.code = 'VALIDATION_FAILED';
    this.exitCode = SPLIT_EXIT_CODES.UNSAFE_TRANSFORMATION;
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
    this.code = 'AI_PLANNING_FAILED';
    this.exitCode = SPLIT_EXIT_CODES.INTERNAL_FAILURE;
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
    this.code = 'CANDIDATE_NOT_FOUND';
    this.exitCode = SPLIT_EXIT_CODES.INVALID_USAGE;
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
    this.code = 'UNSAFE_EXTRACTION';
    this.exitCode = SPLIT_EXIT_CODES.UNSAFE_TRANSFORMATION;
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
    this.code = 'TARGET_COLLISION';
    this.exitCode = SPLIT_EXIT_CODES.SOURCE_CHANGED;
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
    this.code = 'TARGET_OUTSIDE_PROJECT';
    this.exitCode = SPLIT_EXIT_CODES.INVALID_USAGE;
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
    this.code = 'UNRESOLVED_BINDING';
    this.exitCode = SPLIT_EXIT_CODES.UNSAFE_TRANSFORMATION;
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
    this.code = 'CIRCULAR_DEPENDENCY';
    this.exitCode = SPLIT_EXIT_CODES.UNSAFE_TRANSFORMATION;
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
    this.code = 'PREVIEW_GENERATION_FAILED';
    this.exitCode = SPLIT_EXIT_CODES.INTERNAL_FAILURE;
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
    this.code = 'TRANSFORMATION_VALIDATION_FAILED';
    this.exitCode = SPLIT_EXIT_CODES.UNSAFE_TRANSFORMATION;
    this.validationErrors = options.validationErrors || [];
  }
}

// -------------------------------------------------------------
// Phase 3: Apply, Backup, and Rollback Typed Errors
// -------------------------------------------------------------

/**
 * Error thrown when applying an extraction candidate is not allowed
 * (e.g. candidate safety is manual-review or blocked).
 */
export class ApplyNotAllowedError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.candidateId]
   * @param {string} [options.safety]
   * @param {string[]} [options.reasons=[]]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'ApplyNotAllowedError';
    this.code = 'APPLY_NOT_ALLOWED';
    this.exitCode = SPLIT_EXIT_CODES.UNSAFE_TRANSFORMATION;
    this.candidateId = options.candidateId;
    this.safety = options.safety;
    this.reasons = options.reasons || [];
  }
}

/**
 * Error thrown when user confirmation is required in a non-interactive environment.
 */
export class ConfirmationRequiredError extends SplitError {
  /**
   * @param {string} [message]
   */
  constructor(message = 'User confirmation required. Pass --yes to apply non-interactively.') {
    super(message);
    this.name = 'ConfirmationRequiredError';
    this.code = 'CONFIRMATION_REQUIRED';
    this.exitCode = SPLIT_EXIT_CODES.CONFIRMATION_REQUIRED;
  }
}

/**
 * Error thrown when an operation is cancelled by the user during confirmation.
 */
export class OperationCancelledError extends SplitError {
  /**
   * @param {string} [message]
   */
  constructor(message = 'Operation cancelled by user.') {
    super(message);
    this.name = 'OperationCancelledError';
    this.code = 'OPERATION_CANCELLED';
    this.exitCode = SPLIT_EXIT_CODES.SUCCESS;
  }
}

/**
 * Error thrown when the source file changed after the transformation plan was generated.
 */
export class SourceChangedError extends SplitError {
  /**
   * @param {string} [message]
   * @param {Object} [options={}]
   * @param {string} [options.filePath]
   * @param {string} [options.expectedHash]
   * @param {string} [options.actualHash]
   */
  constructor(
    message = 'The source file changed after the split plan was generated. Run the split command again to create a fresh plan.',
    options = {}
  ) {
    super(message);
    this.name = 'SourceChangedError';
    this.code = 'SOURCE_CHANGED';
    this.exitCode = SPLIT_EXIT_CODES.SOURCE_CHANGED;
    this.filePath = options.filePath;
    this.expectedHash = options.expectedHash;
    this.actualHash = options.actualHash;
  }
}

/**
 * Error thrown when creating a persistent backup fails.
 */
export class BackupCreationError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.operationId]
   * @param {string} [options.filePath]
   * @param {unknown} [options.cause]
   */
  constructor(message, options = {}) {
    super(message, options.cause);
    this.name = 'BackupCreationError';
    this.code = 'BACKUP_CREATION_FAILED';
    this.exitCode = SPLIT_EXIT_CODES.WRITE_VALIDATION_FAILURE;
    this.operationId = options.operationId;
    this.filePath = options.filePath;
  }
}

/**
 * Error thrown when verifying the integrity of a created backup fails.
 */
export class BackupVerificationError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.operationId]
   * @param {string} [options.backupPath]
   * @param {string} [options.expectedHash]
   * @param {string} [options.actualHash]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'BackupVerificationError';
    this.code = 'BACKUP_VERIFICATION_FAILED';
    this.exitCode = SPLIT_EXIT_CODES.WRITE_VALIDATION_FAILURE;
    this.operationId = options.operationId;
    this.backupPath = options.backupPath;
    this.expectedHash = options.expectedHash;
    this.actualHash = options.actualHash;
  }
}

/**
 * Error thrown when a project-level write lock cannot be acquired.
 */
export class OperationLockedError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.lockPath]
   * @param {number} [options.activePid]
   * @param {string} [options.activeOperationId]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'OperationLockedError';
    this.code = 'OPERATION_LOCKED';
    this.exitCode = SPLIT_EXIT_CODES.OPERATION_LOCKED;
    this.lockPath = options.lockPath;
    this.activePid = options.activePid;
    this.activeOperationId = options.activeOperationId;
  }
}

/**
 * Error thrown when writing to temporary transaction files fails.
 */
export class TemporaryWriteError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.filePath]
   * @param {unknown} [options.cause]
   */
  constructor(message, options = {}) {
    super(message, options.cause);
    this.name = 'TemporaryWriteError';
    this.code = 'TEMPORARY_WRITE_FAILED';
    this.exitCode = SPLIT_EXIT_CODES.WRITE_VALIDATION_FAILURE;
    this.filePath = options.filePath;
  }
}

/**
 * Error thrown when an atomic file rename fails during a transaction.
 */
export class AtomicRenameError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.fromPath]
   * @param {string} [options.toPath]
   * @param {unknown} [options.cause]
   */
  constructor(message, options = {}) {
    super(message, options.cause);
    this.name = 'AtomicRenameError';
    this.code = 'ATOMIC_RENAME_FAILED';
    this.exitCode = SPLIT_EXIT_CODES.WRITE_VALIDATION_FAILURE;
    this.fromPath = options.fromPath;
    this.toPath = options.toPath;
  }
}

/**
 * Error thrown when post-write validation of the written source or target fails.
 */
export class PostWriteValidationError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string[]} [options.validationErrors=[]]
   * @param {unknown} [options.cause]
   */
  constructor(message, options = {}) {
    super(message, options.cause);
    this.name = 'PostWriteValidationError';
    this.code = 'POST_WRITE_VALIDATION_FAILED';
    this.exitCode = SPLIT_EXIT_CODES.WRITE_VALIDATION_FAILURE;
    this.validationErrors = options.validationErrors || [];
  }
}

/**
 * Error thrown when automatic rollback fails following an apply failure.
 */
export class AutomaticRollbackError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.operationId]
   * @param {string} [options.reason]
   * @param {unknown} [options.cause]
   */
  constructor(message, options = {}) {
    super(message, options.cause);
    this.name = 'AutomaticRollbackError';
    this.code = 'AUTOMATIC_ROLLBACK_FAILED';
    this.exitCode = SPLIT_EXIT_CODES.WRITE_VALIDATION_FAILURE;
    this.operationId = options.operationId;
    this.reason = options.reason;
  }
}

/**
 * Error thrown when manual rollback encounters modified source or target files.
 */
export class RollbackConflictError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.operationId]
   * @param {string} [options.filePath]
   * @param {string} [options.reason]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'RollbackConflictError';
    this.code = 'ROLLBACK_CONFLICT';
    this.exitCode = SPLIT_EXIT_CODES.ROLLBACK_CONFLICT;
    this.operationId = options.operationId;
    this.filePath = options.filePath;
    this.reason = options.reason;
  }
}

/**
 * Error thrown when an operation ID is not found in history.
 */
export class OperationNotFoundError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.operationId]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'OperationNotFoundError';
    this.code = 'OPERATION_NOT_FOUND';
    this.exitCode = SPLIT_EXIT_CODES.INVALID_USAGE;
    this.operationId = options.operationId;
  }
}

/**
 * Error thrown when an operation manifest is corrupted or schema-invalid.
 */
export class InvalidOperationManifestError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.manifestPath]
   * @param {string[]} [options.schemaErrors=[]]
   * @param {unknown} [options.cause]
   */
  constructor(message, options = {}) {
    super(message, options.cause);
    this.name = 'InvalidOperationManifestError';
    this.code = 'INVALID_OPERATION_MANIFEST';
    this.exitCode = SPLIT_EXIT_CODES.INTERNAL_FAILURE;
    this.manifestPath = options.manifestPath;
    this.schemaErrors = options.schemaErrors || [];
  }
}

/**
 * Error thrown when an interrupted operation is detected.
 */
export class InterruptedOperationError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.operationId]
   * @param {string} [options.status]
   * @param {string} [options.recoveryState]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'InterruptedOperationError';
    this.code = 'INTERRUPTED_OPERATION';
    this.exitCode = SPLIT_EXIT_CODES.INTERNAL_FAILURE;
    this.operationId = options.operationId;
    this.status = options.status;
    this.recoveryState = options.recoveryState;
  }
}

/**
 * Error thrown when encountering an unsafe file type (non-regular file).
 */
export class UnsafeFileTypeError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.filePath]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'UnsafeFileTypeError';
    this.code = 'UNSAFE_FILE_TYPE';
    this.exitCode = SPLIT_EXIT_CODES.UNSAFE_TRANSFORMATION;
    this.filePath = options.filePath;
  }
}

/**
 * Error thrown when encountering a symbolic link during write or backup.
 */
export class SymlinkRejectedError extends SplitError {
  /**
   * @param {string} message
   * @param {Object} [options={}]
   * @param {string} [options.filePath]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'SymlinkRejectedError';
    this.code = 'SYMLINK_REJECTED';
    this.exitCode = SPLIT_EXIT_CODES.UNSAFE_TRANSFORMATION;
    this.filePath = options.filePath;
  }
}
