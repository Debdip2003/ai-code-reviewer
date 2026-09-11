/**
 * Operation Manifest Schema and I/O utilities for ACR Code Splitter.
 * Ensures persistent, validated records of split operations in .acr/backups/<operation-id>/manifest.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { CandidateKindSchema } from '../split-plan-schema.js';
import { InvalidOperationManifestError, TargetOutsideProjectError } from '../split-errors.js';
import { normalizePath } from '../target-path.js';

export const ManifestStatusSchema = z.enum([
  'prepared',
  'writing',
  'completed',
  'rolled-back',
  'rolled-back-after-failure',
  'failed'
]);

export const ManifestBackupFileSchema = z
  .object({
    originalPath: z.string().min(1),
    backupPath: z.string().min(1),
    hash: z.string().length(64)
  })
  .strict();

export const ManifestCandidateSchema = z
  .object({
    id: z.string().min(1),
    symbol: z.string().min(1),
    kind: CandidateKindSchema
  })
  .strict();

export const ManifestBeforeSchema = z
  .object({
    sourceHash: z.string().length(64),
    targetExisted: z.boolean()
  })
  .strict();

export const ManifestAfterSchema = z
  .object({
    sourceHash: z.string().length(64).nullable().optional(),
    targetHash: z.string().length(64).nullable().optional()
  })
  .strict();

export const ManifestValidationSchema = z
  .object({
    preWrite: z.string(),
    postWrite: z.string()
  })
  .strict();

export const ManifestRollbackSchema = z
  .object({
    available: z.boolean(),
    rolledBackAt: z.string().nullable()
  })
  .strict();

export const OperationManifestSchema = z
  .object({
    version: z.literal(1, {
      errorMap: () => ({ message: 'Manifest version must be 1' })
    }),
    operationId: z.string().min(1),
    type: z.literal('split'),
    status: ManifestStatusSchema,
    createdAt: z.string().datetime({ offset: true }).or(z.string()),
    completedAt: z.string().datetime({ offset: true }).nullable().or(z.string().nullable()),
    projectRoot: z.string().min(1),
    sourceFile: z.string().min(1),
    targetFile: z.string().min(1),
    candidate: ManifestCandidateSchema,
    before: ManifestBeforeSchema,
    after: ManifestAfterSchema.optional().default({}),
    backupFiles: z.array(ManifestBackupFileSchema),
    validation: ManifestValidationSchema,
    rollback: ManifestRollbackSchema
  })
  .strict();

/**
 * Creates a new initialized operation manifest object.
 *
 * @param {Object} params
 * @param {string} params.operationId
 * @param {string} params.projectRoot
 * @param {string} params.sourceFile
 * @param {string} params.targetFile
 * @param {{ id: string, symbol: string, kind: string }} params.candidate
 * @param {{ sourceHash: string, targetExisted: boolean }} params.before
 * @param {Array<{ originalPath: string, backupPath: string, hash: string }>} params.backupFiles
 * @returns {z.infer<typeof OperationManifestSchema>}
 */
export function createOperationManifest({
  operationId,
  projectRoot = '.',
  sourceFile,
  targetFile,
  candidate,
  before,
  backupFiles
}) {
  const manifest = {
    version: 1,
    operationId,
    type: 'split',
    status: 'prepared',
    createdAt: new Date().toISOString(),
    completedAt: null,
    projectRoot: normalizePath(projectRoot),
    sourceFile: normalizePath(sourceFile),
    targetFile: normalizePath(targetFile),
    candidate: {
      id: candidate.id,
      symbol: candidate.symbol,
      kind: candidate.kind
    },
    before: {
      sourceHash: before.sourceHash,
      targetExisted: Boolean(before.targetExisted)
    },
    after: {
      sourceHash: null,
      targetHash: null
    },
    backupFiles,
    validation: {
      preWrite: 'passed',
      postWrite: 'pending'
    },
    rollback: {
      available: true,
      rolledBackAt: null
    }
  };

  return OperationManifestSchema.parse(manifest);
}

/**
 * Writes an operation manifest object to disk.
 *
 * @param {string} manifestPath
 * @param {Object} manifest
 */
export function writeOperationManifest(manifestPath, manifest) {
  const validated = OperationManifestSchema.parse(manifest);
  const dir = path.dirname(manifestPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(manifestPath, JSON.stringify(validated, null, 2) + '\n', 'utf8');
}

/**
 * Reads and validates an operation manifest from disk.
 *
 * @param {string} manifestPath
 * @returns {z.infer<typeof OperationManifestSchema>}
 */
export function readOperationManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    throw new InvalidOperationManifestError(`Manifest not found at "${manifestPath}".`, {
      manifestPath
    });
  }

  let rawJson;
  try {
    rawJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (parseError) {
    throw new InvalidOperationManifestError(
      `Failed to parse manifest JSON at "${manifestPath}": ${parseError.message}`,
      { manifestPath, cause: parseError }
    );
  }

  const result = OperationManifestSchema.safeParse(rawJson);
  if (!result.success) {
    const errorDetails = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new InvalidOperationManifestError(
      `Invalid manifest schema at "${manifestPath}":\n  - ${errorDetails.join('\n  - ')}`,
      { manifestPath, schemaErrors: errorDetails }
    );
  }

  return result.data;
}

/**
 * Validates that all file paths referenced in a manifest stay safely within the project root.
 *
 * @param {z.infer<typeof OperationManifestSchema>} manifest
 * @param {string} projectRoot
 */
export function validateManifestPaths(manifest, projectRoot) {
  const absProjectRoot = path.resolve(projectRoot);

  const checkPath = (relPath, fieldName) => {
    const absPath = path.resolve(absProjectRoot, relPath);
    if (!absPath.startsWith(absProjectRoot)) {
      throw new TargetOutsideProjectError(
        `Manifest ${fieldName} "${relPath}" resolves outside project root "${projectRoot}".`,
        { targetPath: relPath, projectRoot }
      );
    }
    return absPath;
  };

  checkPath(manifest.sourceFile, 'sourceFile');
  checkPath(manifest.targetFile, 'targetFile');

  for (const backup of manifest.backupFiles) {
    checkPath(backup.originalPath, 'backup.originalPath');
  }
}
