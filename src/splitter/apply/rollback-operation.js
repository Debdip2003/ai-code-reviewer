/**
 * Manual Rollback Engine for ACR Code Splitter.
 * Safely reverts an applied split operation to its pre-split state with conflict detection.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {
  calculateFileSha256
} from './write-utils.js';
import {
  getBackupDirectory,
  restoreBackupFile,
  verifyBackup
} from './backup-manager.js';
import {
  readOperationManifest,
  validateManifestPaths,
  writeOperationManifest
} from './operation-manifest.js';
import {
  acquireLock,
  releaseLock
} from './change-lock.js';
import {
  ConfirmationRequiredError,
  OperationCancelledError,
  OperationNotFoundError,
  RollbackConflictError
} from '../split-errors.js';

/**
 * Prompts the user for interactive confirmation via CLI stdin.
 *
 * @param {string} promptText
 * @returns {Promise<boolean>}
 */
async function promptConfirmation(promptText) {
  if (!process.stdin.isTTY) {
    return false;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}

/**
 * Rolls back a previous code split operation.
 *
 * @param {Object} params
 * @param {string} [params.projectRoot=process.cwd()] - Project root directory.
 * @param {string} params.operationId - Operation identifier to roll back.
 * @param {boolean} [params.yes=false] - Skip interactive confirmation.
 * @param {AbortSignal} [params.signal] - Cancellation signal.
 * @returns {Promise<{
 *   success: boolean,
 *   mode: 'rollback',
 *   operationId: string,
 *   restored: string[],
 *   removed: string[],
 *   manifest: Object
 * }>}
 */
export async function rollbackOperation({
  projectRoot = process.cwd(),
  operationId,
  yes = false,
  signal = null
}) {
  const absProjectRoot = path.resolve(projectRoot);
  const backupDir = getBackupDirectory(absProjectRoot, operationId);
  const manifestPath = path.join(backupDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    throw new OperationNotFoundError(
      `Operation "${operationId}" was not found in history.\nCheck available operations with "acr split history".`,
      { operationId }
    );
  }

  // Read and validate manifest
  const manifest = readOperationManifest(manifestPath);
  validateManifestPaths(manifest, absProjectRoot);

  if (manifest.status === 'rolled-back') {
    return {
      success: true,
      mode: 'rollback',
      operationId,
      alreadyRolledBack: true,
      restored: [],
      removed: [],
      manifest
    };
  }

  const absSource = path.resolve(absProjectRoot, manifest.sourceFile);
  const absTarget = path.resolve(absProjectRoot, manifest.targetFile);

  // 1. Conflict Check: check if source file was modified after split
  if (fs.existsSync(absSource)) {
    const currentSourceHash = calculateFileSha256(absSource);
    if (manifest.after?.sourceHash && currentSourceHash !== manifest.after.sourceHash) {
      throw new RollbackConflictError(
        `Cannot roll back operation "${operationId}":\n` +
          `Source file "${manifest.sourceFile}" was modified after the split operation.\n` +
          `Expected hash: ${manifest.after.sourceHash}\n` +
          `Actual hash:   ${currentSourceHash}\n` +
          `Manual resolution is required to avoid overwriting newer changes.`,
        {
          operationId,
          filePath: manifest.sourceFile,
          reason: 'source-modified-after-split'
        }
      );
    }
  }

  // 2. Conflict Check: check if target file was modified after split
  if (fs.existsSync(absTarget)) {
    const currentTargetHash = calculateFileSha256(absTarget);
    if (manifest.after?.targetHash && currentTargetHash !== manifest.after.targetHash) {
      throw new RollbackConflictError(
        `Cannot roll back operation "${operationId}":\n` +
          `Target file "${manifest.targetFile}" was modified after the split operation.\n` +
          `Expected hash: ${manifest.after.targetHash}\n` +
          `Actual hash:   ${currentTargetHash}\n` +
          `Manual resolution is required to avoid deleting user modifications.`,
        {
          operationId,
          filePath: manifest.targetFile,
          reason: 'target-modified-after-split'
        }
      );
    }
  }

  // 3. User Confirmation Prompt
  if (!yes) {
    if (!process.stdin.isTTY) {
      throw new ConfirmationRequiredError(
        'Rollback requires confirmation. Pass --yes to roll back non-interactively.'
      );
    }

    const promptText =
      `\nACR will roll back the following split operation:\n\n` +
      `  Operation: ${operationId}\n` +
      `  Candidate: ${manifest.candidate.symbol} (${manifest.candidate.id})\n` +
      `  Restore:   ${manifest.sourceFile}\n` +
      `  Remove:    ${manifest.targetFile}\n\n` +
      `Continue rollback? (y/N) `;

    const confirmed = await promptConfirmation(promptText);
    if (!confirmed) {
      throw new OperationCancelledError('Rollback cancelled by user.');
    }
  }

  if (signal?.aborted) {
    const abortErr = new Error('Rollback aborted.');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  // 4. Acquire Lock
  acquireLock({ projectRoot: absProjectRoot, operationId });

  try {
    // 5. Verify Backup Integrity
    verifyBackup({ projectRoot: absProjectRoot, operationId, manifest });

    const restoredFiles = [];
    const removedFiles = [];

    // 6. Restore original source file
    if (manifest.backupFiles.length > 0) {
      const restoredHash = restoreBackupFile({
        projectRoot: absProjectRoot,
        operationId,
        backupFileRecord: manifest.backupFiles[0],
        destinationPath: absSource
      });

      if (restoredHash !== manifest.before.sourceHash) {
        throw new RollbackConflictError(
          `Rollback verification failed: restored source hash mismatch. Expected ${manifest.before.sourceHash}, got ${restoredHash}.`,
          { operationId, filePath: manifest.sourceFile, reason: 'restore-hash-mismatch' }
        );
      }
      restoredFiles.push(manifest.sourceFile);
    }

    // 7. Remove created target file
    if (fs.existsSync(absTarget)) {
      fs.unlinkSync(absTarget);
      removedFiles.push(manifest.targetFile);
    }

    // 8. Update manifest
    manifest.status = 'rolled-back';
    manifest.completedAt = new Date().toISOString();
    manifest.rollback = {
      available: false,
      rolledBackAt: new Date().toISOString()
    };
    writeOperationManifest(manifestPath, manifest);

    return {
      success: true,
      mode: 'rollback',
      operationId,
      restored: restoredFiles,
      removed: removedFiles,
      manifest
    };
  } finally {
    releaseLock({ projectRoot: absProjectRoot, operationId });
  }
}
