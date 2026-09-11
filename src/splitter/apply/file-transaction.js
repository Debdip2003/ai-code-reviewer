/**
 * Transaction-like Multi-File Write Engine for ACR Code Splitter.
 * Coordinates temporary writes, atomic renames, manifest journaling, and automatic rollback.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  calculateFileSha256,
  calculateSha256,
  detectLineEndings,
  ensureDirectoryExists,
  generateTempFilePath,
  getFileMode,
  normalizeLineEndings
} from './write-utils.js';
import {
  createOperationManifest,
  writeOperationManifest
} from './operation-manifest.js';
import {
  createBackup,
  getBackupDirectory,
  restoreBackupFile
} from './backup-manager.js';
import {
  validatePostWrite,
  validatePreApply
} from './apply-validator.js';
import {
  AtomicRenameError,
  AutomaticRollbackError,
  TemporaryWriteError
} from '../split-errors.js';
import { parseAst } from '../ast-utils.js';

/**
 * Executes a two-file code split transaction with automatic rollback on failure.
 *
 * @param {Object} params
 * @param {string} params.projectRoot - Project root directory.
 * @param {string} params.operationId - Unique operation ID.
 * @param {Object} params.plan - Validated transformation plan.
 * @param {string} params.proposedSourceCode - Proposed code for source file.
 * @param {string} params.proposedTargetCode - Proposed code for target file.
 * @param {Object} [params._hooks={}] - Optional test hooks for failure injection.
 * @returns {Promise<{
 *   success: boolean,
 *   mode: 'apply',
 *   operationId: string,
 *   sourceFile: string,
 *   targetFile: string,
 *   candidate: { id: string, symbol: string, kind: string },
 *   files: { updated: string[], created: string[] },
 *   validation: { preWrite: string, postWrite: string },
 *   backup: { created: boolean, operationId: string },
 *   manifest: Object
 * }>}
 */
export async function executeFileTransaction({
  projectRoot,
  operationId,
  plan,
  proposedSourceCode,
  proposedTargetCode,
  _hooks = {}
}) {
  const absProjectRoot = path.resolve(projectRoot);
  const sourceFile = plan.sourceFile;
  const targetFile = plan.targetFile;
  const absSource = path.resolve(absProjectRoot, sourceFile);
  const absTarget = path.resolve(absProjectRoot, targetFile);

  const manifestPath = path.join(
    getBackupDirectory(absProjectRoot, operationId),
    'manifest.json'
  );

  let tempSourcePath = null;
  let tempTargetPath = null;
  let targetRenamed = false;
  let sourceRenamed = false;
  let manifest = null;
  let backupFiles = [];
  let originalSourceContent = null;
  let beforeSourceHash = null;
  let expectedTargetHash = null;
  let expectedSourceHash = null;

  // Cleanup helper for temporary files
  const cleanupTempFiles = () => {
    if (tempSourcePath && fs.existsSync(tempSourcePath)) {
      try {
        fs.unlinkSync(tempSourcePath);
      } catch {
        // Ignored
      }
    }
    if (tempTargetPath && fs.existsSync(tempTargetPath)) {
      try {
        fs.unlinkSync(tempTargetPath);
      } catch {
        // Ignored
      }
    }
  };

  try {
    // -------------------------------------------------------------
    // Step 1: Pre-write Validation & Optimistic Concurrency Check
    // -------------------------------------------------------------
    const preValidation = validatePreApply({
      plan,
      projectRoot: absProjectRoot,
      sourceFile,
      targetFile,
      plannedSourceHash: plan.before?.sourceHash || plan.sourceHash
    });

    beforeSourceHash = preValidation.currentSourceHash;
    originalSourceContent = fs.readFileSync(absSource, 'utf8');

    // Preserve original source line endings and mode
    const sourceEnding = detectLineEndings(originalSourceContent);
    const normalizedSourceCode = normalizeLineEndings(proposedSourceCode, sourceEnding);
    const normalizedTargetCode = normalizeLineEndings(proposedTargetCode, sourceEnding);
    const sourceMode = getFileMode(absSource);

    expectedSourceHash = calculateSha256(normalizedSourceCode);
    expectedTargetHash = calculateSha256(normalizedTargetCode);

    if (typeof _hooks.onBeforeBackup === 'function') {
      await _hooks.onBeforeBackup();
    }

    // -------------------------------------------------------------
    // Step 2: Create & Verify Byte-Accurate Backup
    // -------------------------------------------------------------
    backupFiles = createBackup({
      projectRoot: absProjectRoot,
      operationId,
      sourceFile,
      sourceContent: originalSourceContent,
      beforeSourceHash
    });

    if (typeof _hooks.onAfterBackup === 'function') {
      await _hooks.onAfterBackup();
    }

    // -------------------------------------------------------------
    // Step 3: Write Initial Manifest ("prepared")
    // -------------------------------------------------------------
    manifest = createOperationManifest({
      operationId,
      projectRoot: absProjectRoot,
      sourceFile,
      targetFile,
      candidate: plan.candidate,
      before: {
        sourceHash: beforeSourceHash,
        targetExisted: false
      },
      backupFiles
    });
    writeOperationManifest(manifestPath, manifest);

    if (typeof _hooks.onBeforeTempWrite === 'function') {
      await _hooks.onBeforeTempWrite();
    }

    // -------------------------------------------------------------
    // Step 4: Write Temporary Source and Target Files
    // -------------------------------------------------------------
    ensureDirectoryExists(path.dirname(absTarget));
    ensureDirectoryExists(path.dirname(absSource));

    tempSourcePath = generateTempFilePath(absSource, operationId);
    tempTargetPath = generateTempFilePath(absTarget, operationId);

    try {
      fs.writeFileSync(tempSourcePath, normalizedSourceCode, { mode: sourceMode });
    } catch (err) {
      throw new TemporaryWriteError(
        `Failed to write temporary source file "${tempSourcePath}": ${err.message}`,
        { filePath: tempSourcePath, cause: err }
      );
    }

    try {
      fs.writeFileSync(tempTargetPath, normalizedTargetCode, { mode: sourceMode });
    } catch (err) {
      throw new TemporaryWriteError(
        `Failed to write temporary target file "${tempTargetPath}": ${err.message}`,
        { filePath: tempTargetPath, cause: err }
      );
    }

    // -------------------------------------------------------------
    // Step 5: Parse and Validate Temporary Files on Disk
    // -------------------------------------------------------------
    parseAst(fs.readFileSync(tempSourcePath, 'utf8'), sourceFile);
    parseAst(fs.readFileSync(tempTargetPath, 'utf8'), targetFile);

    if (typeof _hooks.onAfterTempWrite === 'function') {
      await _hooks.onAfterTempWrite();
    }

    // -------------------------------------------------------------
    // Step 6: Update Manifest Status to "writing"
    // -------------------------------------------------------------
    manifest.status = 'writing';
    writeOperationManifest(manifestPath, manifest);

    if (typeof _hooks.onBeforeTargetRename === 'function') {
      await _hooks.onBeforeTargetRename();
    }

    // -------------------------------------------------------------
    // Step 7: Atomic Rename Target Temporary File -> Final Target
    // -------------------------------------------------------------
    try {
      fs.renameSync(tempTargetPath, absTarget);
      targetRenamed = true;
    } catch (err) {
      throw new AtomicRenameError(
        `Failed to rename temporary target file to "${absTarget}": ${err.message}`,
        { fromPath: tempTargetPath, toPath: absTarget, cause: err }
      );
    }

    if (typeof _hooks.onAfterTargetRename === 'function') {
      await _hooks.onAfterTargetRename();
    }

    if (typeof _hooks.onBeforeSourceRename === 'function') {
      await _hooks.onBeforeSourceRename();
    }

    // -------------------------------------------------------------
    // Step 8: Atomic Rename Source Temporary File -> Original Source
    // -------------------------------------------------------------
    try {
      fs.renameSync(tempSourcePath, absSource);
      sourceRenamed = true;
    } catch (err) {
      throw new AtomicRenameError(
        `Failed to rename temporary source file over "${absSource}": ${err.message}`,
        { fromPath: tempSourcePath, toPath: absSource, cause: err }
      );
    }

    if (typeof _hooks.onAfterSourceRename === 'function') {
      await _hooks.onAfterSourceRename();
    }

    if (typeof _hooks.onBeforePostValidation === 'function') {
      await _hooks.onBeforePostValidation();
    }

    // -------------------------------------------------------------
    // Step 9: Post-Write Verification
    // -------------------------------------------------------------
    const postValidation = await validatePostWrite({
      projectRoot: absProjectRoot,
      sourceFile,
      targetFile,
      candidate: plan.candidate,
      contract: plan.contract,
      expectedSourceHash,
      expectedTargetHash
    });

    if (typeof _hooks.onAfterPostValidation === 'function') {
      await _hooks.onAfterPostValidation();
    }

    if (typeof _hooks.onBeforeManifestComplete === 'function') {
      await _hooks.onBeforeManifestComplete();
    }

    // -------------------------------------------------------------
    // Step 10: Finalize Manifest Status to "completed"
    // -------------------------------------------------------------
    manifest.status = 'completed';
    manifest.completedAt = new Date().toISOString();
    manifest.after = {
      sourceHash: postValidation.sourceHash,
      targetHash: postValidation.targetHash
    };
    manifest.validation = {
      preWrite: 'passed',
      postWrite: 'passed'
    };
    manifest.rollback = {
      available: true,
      rolledBackAt: null
    };
    writeOperationManifest(manifestPath, manifest);

    // Clean up temporary files
    cleanupTempFiles();

    return {
      success: true,
      mode: 'apply',
      operationId,
      sourceFile,
      targetFile,
      candidate: {
        id: plan.candidate.id,
        symbol: plan.candidate.symbol,
        kind: plan.candidate.kind
      },
      files: {
        updated: [sourceFile],
        created: [targetFile]
      },
      validation: {
        preWrite: 'passed',
        postWrite: 'passed'
      },
      backup: {
        created: true,
        operationId
      },
      manifest
    };
  } catch (error) {
    cleanupTempFiles();

    // If writes were attempted / files were renamed, perform automatic rollback
    if (targetRenamed || sourceRenamed) {
      let autoRollbackSuccess = false;
      let autoRollbackError = null;

      try {
        // 1. Restore original source file from backup
        if (backupFiles.length > 0) {
          restoreBackupFile({
            projectRoot: absProjectRoot,
            operationId,
            backupFileRecord: backupFiles[0],
            destinationPath: absSource
          });
        }

        // 2. Remove target file ONLY IF target exists and its hash matches expected target hash
        if (fs.existsSync(absTarget)) {
          const currentTargetHash = calculateFileSha256(absTarget);
          if (currentTargetHash === expectedTargetHash) {
            fs.unlinkSync(absTarget);
          }
        }

        // 3. Verify restored source hash
        const restoredSourceHash = calculateFileSha256(absSource);
        if (restoredSourceHash === beforeSourceHash) {
          autoRollbackSuccess = true;
        }
      } catch (rollbackErr) {
        autoRollbackError = rollbackErr;
      }

      // Update manifest record
      if (manifest) {
        manifest.status = 'rolled-back-after-failure';
        manifest.completedAt = new Date().toISOString();
        manifest.rollback = {
          available: false,
          rolledBackAt: new Date().toISOString()
        };
        try {
          writeOperationManifest(manifestPath, manifest);
        } catch {
          // Ignored
        }
      }

      if (!autoRollbackSuccess) {
        throw new AutomaticRollbackError(
          `Split failed and automatic rollback encountered an issue:\n` +
            `  Original error: ${error.message}\n` +
            `  Rollback issue: ${autoRollbackError ? autoRollbackError.message : 'Source hash verification failed after restoration'}.`,
          {
            operationId,
            reason: error.message,
            cause: autoRollbackError || error
          }
        );
      }
    }

    throw error;
  }
}
