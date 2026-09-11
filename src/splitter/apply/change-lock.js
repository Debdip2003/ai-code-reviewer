/**
 * Project-Level Concurrency Lock for ACR Code Splitter.
 * Ensures exclusive file mutation via .acr/split.lock with stale-lock detection.
 */

import fs from 'node:fs';
import path from 'node:path';
import { OperationLockedError } from '../split-errors.js';
import { ensureDirectoryExists } from './write-utils.js';

/**
 * Checks if a process with given PID is currently active.
 *
 * @param {number} pid
 * @returns {boolean}
 */
export function isProcessActive(pid) {
  if (typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means process exists but we lack permission to signal it
    return err.code === 'EPERM';
  }
}

/**
 * Returns the path to the split lock file.
 *
 * @param {string} projectRoot
 * @returns {string}
 */
export function getLockFilePath(projectRoot) {
  return path.resolve(projectRoot, '.acr', 'split.lock');
}

/**
 * Acquires the project-level split lock exclusively.
 *
 * @param {Object} params
 * @param {string} params.projectRoot - Project root path.
 * @param {string} params.operationId - Unique operation ID acquiring the lock.
 * @param {number} [params.staleTimeoutMs=600000] - Age in ms after which an inactive lock is considered stale (10 mins).
 * @returns {boolean} True if acquired.
 */
export function acquireLock({
  projectRoot,
  operationId,
  staleTimeoutMs = 600000
}) {
  const lockPath = getLockFilePath(projectRoot);
  const acrDir = path.dirname(lockPath);
  ensureDirectoryExists(acrDir);

  const lockPayload = JSON.stringify(
    {
      operationId,
      pid: process.pid,
      createdAt: new Date().toISOString()
    },
    null,
    2
  ) + '\n';

  const tryWriteExclusive = () => {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, lockPayload, 'utf8');
      fs.closeSync(fd);
      return true;
    } catch (err) {
      if (err.code === 'EEXIST') {
        return false;
      }
      throw err;
    }
  };

  // Attempt initial exclusive creation
  if (tryWriteExclusive()) {
    return true;
  }

  // Lock file already exists: inspect for staleness
  let existingLock;
  try {
    const content = fs.readFileSync(lockPath, 'utf8');
    existingLock = JSON.parse(content);
  } catch {
    // Lock file could be empty or invalid JSON: treat as stale
    existingLock = null;
  }

  if (existingLock) {
    const isAlive = isProcessActive(existingLock.pid);
    const lockAge = Date.now() - new Date(existingLock.createdAt).getTime();
    const isStale = !isAlive || (lockAge > staleTimeoutMs);

    if (isStale) {
      // Reclaim stale lock
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // Ignored if already unlinked
      }

      // Retry exclusive write
      if (tryWriteExclusive()) {
        return true;
      }
    }

    // Lock is currently active
    throw new OperationLockedError(
      `Another ACR split operation "${existingLock.operationId}" is currently in progress (PID ${existingLock.pid}).\n` +
        `If this is a leftover lock from a killed process, delete "${lockPath}".`,
      {
        lockPath,
        activePid: existingLock.pid,
        activeOperationId: existingLock.operationId
      }
    );
  }

  // If existing lock could not be parsed, remove it and retry
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // Ignored
  }

  if (tryWriteExclusive()) {
    return true;
  }

  throw new OperationLockedError(`Failed to acquire lock at "${lockPath}".`, {
    lockPath,
    activePid: 0,
    activeOperationId: 'unknown'
  });
}

/**
 * Releases the project-level split lock if owned by the specified operationId.
 *
 * @param {Object} params
 * @param {string} params.projectRoot
 * @param {string} params.operationId
 * @param {boolean} [params.force=false]
 * @returns {boolean} True if released, false if not owned.
 */
export function releaseLock({
  projectRoot,
  operationId,
  force = false
}) {
  const lockPath = getLockFilePath(projectRoot);

  if (!fs.existsSync(lockPath)) {
    return true;
  }

  if (force) {
    try {
      fs.unlinkSync(lockPath);
      return true;
    } catch {
      return false;
    }
  }

  try {
    const content = fs.readFileSync(lockPath, 'utf8');
    const existingLock = JSON.parse(content);
    if (existingLock.operationId === operationId) {
      fs.unlinkSync(lockPath);
      return true;
    }
    return false;
  } catch {
    // If unreadable, remove if force or ignore
    return false;
  }
}
