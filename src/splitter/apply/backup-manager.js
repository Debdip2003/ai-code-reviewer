/**
 * Backup Manager for ACR Code Splitter.
 * Manages creation, verification, and restoration of byte-accurate backups in .acr/backups/<operation-id>/.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  calculateFileSha256,
  calculateSha256,
  encodePathForBackup,
  ensureDirectoryExists
} from './write-utils.js';
import {
  BackupCreationError,
  BackupVerificationError
} from '../split-errors.js';
import { normalizePath } from '../target-path.js';

/**
 * Returns the base backup directory for a given operation.
 *
 * @param {string} projectRoot
 * @param {string} operationId
 * @returns {string}
 */
export function getBackupDirectory(projectRoot, operationId) {
  return path.resolve(projectRoot, '.acr', 'backups', operationId);
}

/**
 * Creates a persistent backup for a source file before applying modifications.
 *
 * @param {Object} params
 * @param {string} params.projectRoot - Project root path.
 * @param {string} params.operationId - Operation unique identifier.
 * @param {string} params.sourceFile - Project-relative source file path.
 * @param {string | Buffer} params.sourceContent - Original source file contents.
 * @param {string} params.beforeSourceHash - Expected SHA-256 hash of original source file.
 * @returns {Array<{ originalPath: string, backupPath: string, hash: string }>}
 */
export function createBackup({
  projectRoot,
  operationId,
  sourceFile,
  sourceContent,
  beforeSourceHash
}) {
  const backupDir = getBackupDirectory(projectRoot, operationId);
  const filesDir = path.join(backupDir, 'files');

  try {
    ensureDirectoryExists(filesDir);
  } catch (err) {
    throw new BackupCreationError(`Failed to create backup directory "${filesDir}": ${err.message}`, {
      operationId,
      filePath: sourceFile,
      cause: err
    });
  }

  const encodedFileName = encodePathForBackup(sourceFile);
  const backupFilePath = path.join(filesDir, encodedFileName);
  const relBackupPath = normalizePath(path.join('files', encodedFileName));

  try {
    if (typeof sourceContent === 'string') {
      fs.writeFileSync(backupFilePath, sourceContent, 'utf8');
    } else {
      fs.writeFileSync(backupFilePath, sourceContent);
    }
  } catch (err) {
    throw new BackupCreationError(`Failed to write backup file "${backupFilePath}": ${err.message}`, {
      operationId,
      filePath: sourceFile,
      cause: err
    });
  }

  // Verify backup immediately after writing
  let writtenHash;
  try {
    writtenHash = calculateFileSha256(backupFilePath);
  } catch (err) {
    throw new BackupVerificationError(
      `Failed to read created backup file "${backupFilePath}": ${err.message}`,
      {
        operationId,
        backupPath: relBackupPath,
        expectedHash: beforeSourceHash,
        actualHash: 'unreadable'
      }
    );
  }

  if (writtenHash !== beforeSourceHash) {
    throw new BackupVerificationError(
      `Backup verification mismatch for "${sourceFile}". Expected hash ${beforeSourceHash}, got ${writtenHash}.`,
      {
        operationId,
        backupPath: relBackupPath,
        expectedHash: beforeSourceHash,
        actualHash: writtenHash
      }
    );
  }

  return [
    {
      originalPath: normalizePath(sourceFile),
      backupPath: relBackupPath,
      hash: writtenHash
    }
  ];
}

/**
 * Verifies that all backup files referenced in a manifest exist and match their expected hashes.
 *
 * @param {Object} params
 * @param {string} params.projectRoot
 * @param {string} params.operationId
 * @param {Object} params.manifest
 */
export function verifyBackup({ projectRoot, operationId, manifest }) {
  const backupDir = getBackupDirectory(projectRoot, operationId);

  for (const fileRecord of manifest.backupFiles) {
    const fullBackupPath = path.resolve(backupDir, fileRecord.backupPath);

    if (!fs.existsSync(fullBackupPath)) {
      throw new BackupVerificationError(
        `Backup file "${fileRecord.backupPath}" missing for operation "${operationId}".`,
        {
          operationId,
          backupPath: fileRecord.backupPath,
          expectedHash: fileRecord.hash,
          actualHash: 'missing'
        }
      );
    }

    const currentHash = calculateFileSha256(fullBackupPath);
    if (currentHash !== fileRecord.hash) {
      throw new BackupVerificationError(
        `Backup file "${fileRecord.backupPath}" corrupted. Expected ${fileRecord.hash}, got ${currentHash}.`,
        {
          operationId,
          backupPath: fileRecord.backupPath,
          expectedHash: fileRecord.hash,
          actualHash: currentHash
        }
      );
    }
  }
}

/**
 * Restores a backed up file to a destination path.
 *
 * @param {Object} params
 * @param {string} params.projectRoot
 * @param {string} params.operationId
 * @param {{ originalPath: string, backupPath: string, hash: string }} params.backupFileRecord
 * @param {string} params.destinationPath
 * @returns {string} The restored file's SHA-256 hash.
 */
export function restoreBackupFile({
  projectRoot,
  operationId,
  backupFileRecord,
  destinationPath
}) {
  const backupDir = getBackupDirectory(projectRoot, operationId);
  const fullBackupPath = path.resolve(backupDir, backupFileRecord.backupPath);

  if (!fs.existsSync(fullBackupPath)) {
    throw new BackupVerificationError(
      `Cannot restore: backup file "${fullBackupPath}" does not exist.`,
      {
        operationId,
        backupPath: backupFileRecord.backupPath,
        expectedHash: backupFileRecord.hash,
        actualHash: 'missing'
      }
    );
  }

  const backupHash = calculateFileSha256(fullBackupPath);
  if (backupHash !== backupFileRecord.hash) {
    throw new BackupVerificationError(
      `Cannot restore: backup file is corrupted. Expected ${backupFileRecord.hash}, got ${backupHash}.`,
      {
        operationId,
        backupPath: backupFileRecord.backupPath,
        expectedHash: backupFileRecord.hash,
        actualHash: backupHash
      }
    );
  }

  const content = fs.readFileSync(fullBackupPath);
  ensureDirectoryExists(path.dirname(destinationPath));
  fs.writeFileSync(destinationPath, content);

  const restoredHash = calculateSha256(content);
  return restoredHash;
}
