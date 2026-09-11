/**
 * Operation History and Inspection for ACR Code Splitter.
 * Reads and validates records from .acr/backups/ with interrupted state diagnosis.
 */

import fs from 'node:fs';
import path from 'node:path';
import { readOperationManifest } from './operation-manifest.js';
import { calculateFileSha256 } from './write-utils.js';
import { OperationNotFoundError } from '../split-errors.js';
import { normalizePath } from '../target-path.js';

/**
 * Diagnoses the recovery state of an interrupted operation.
 *
 * @param {Object} manifest
 * @param {string} projectRoot
 * @returns {string}
 */
function diagnoseInterruptedState(manifest, projectRoot) {
  const absProjectRoot = path.resolve(projectRoot);
  const absSource = path.resolve(absProjectRoot, manifest.sourceFile);
  const absTarget = path.resolve(absProjectRoot, manifest.targetFile);

  const sourceExists = fs.existsSync(absSource);
  const targetExists = fs.existsSync(absTarget);

  if (!sourceExists && !targetExists) {
    return 'source-and-target-missing';
  }

  const currentSourceHash = sourceExists ? calculateFileSha256(absSource) : null;
  const currentTargetHash = targetExists ? calculateFileSha256(absTarget) : null;

  if (currentSourceHash === manifest.before?.sourceHash && !targetExists) {
    return 'no-writes-occurred';
  }

  if (manifest.after?.sourceHash && currentSourceHash === manifest.after.sourceHash &&
      manifest.after?.targetHash && currentTargetHash === manifest.after.targetHash) {
    return 'complete-writes-occurred';
  }

  return 'partial-writes-occurred';
}

/**
 * Lists all previous split operations recorded in .acr/backups/.
 *
 * @param {Object} [params={}]
 * @param {string} [params.projectRoot=process.cwd()] - Project root directory.
 * @returns {Array<Object>} List of operations sorted newest first.
 */
export function listOperationHistory({ projectRoot = process.cwd() } = {}) {
  const absProjectRoot = path.resolve(projectRoot);
  const backupsDir = path.resolve(absProjectRoot, '.acr', 'backups');

  if (!fs.existsSync(backupsDir)) {
    return [];
  }

  let entries = [];
  try {
    entries = fs.readdirSync(backupsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const operations = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const opId = entry.name;
    const manifestPath = path.join(backupsDir, opId, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    try {
      const manifest = readOperationManifest(manifestPath);

      let recoveryState = null;
      if (['prepared', 'writing'].includes(manifest.status)) {
        recoveryState = diagnoseInterruptedState(manifest, absProjectRoot);
      }

      operations.push({
        operationId: manifest.operationId,
        candidate: manifest.candidate,
        sourceFile: manifest.sourceFile,
        targetFile: manifest.targetFile,
        status: manifest.status,
        createdAt: manifest.createdAt,
        completedAt: manifest.completedAt,
        rollback: manifest.rollback,
        recoveryState
      });
    } catch {
      // Corrupt or unreadable manifest: record minimal placeholder
      operations.push({
        operationId: opId,
        candidate: { id: 'unknown', symbol: 'unknown', kind: 'other' },
        sourceFile: 'unknown',
        targetFile: 'unknown',
        status: 'corrupted',
        createdAt: new Date().toISOString(),
        completedAt: null,
        rollback: { available: false, rolledBackAt: null },
        recoveryState: 'corrupted-manifest'
      });
    }
  }

  // Sort descending by createdAt
  operations.sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  return operations;
}

/**
 * Retrieves the full manifest record for a specific operation.
 *
 * @param {Object} params
 * @param {string} [params.projectRoot=process.cwd()]
 * @param {string} params.operationId
 * @returns {Object}
 */
export function getOperationHistory({ projectRoot = process.cwd(), operationId }) {
  const absProjectRoot = path.resolve(projectRoot);
  const manifestPath = path.resolve(absProjectRoot, '.acr', 'backups', operationId, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    throw new OperationNotFoundError(
      `Operation "${operationId}" was not found in history.\nRun "acr split history" to view past operations.`,
      { operationId }
    );
  }

  const manifest = readOperationManifest(manifestPath);

  let recoveryState = null;
  if (['prepared', 'writing'].includes(manifest.status)) {
    recoveryState = diagnoseInterruptedState(manifest, absProjectRoot);
  }

  return {
    ...manifest,
    recoveryState
  };
}
