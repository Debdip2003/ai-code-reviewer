import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  OperationManifestSchema,
  createOperationManifest,
  writeOperationManifest,
  readOperationManifest,
  validateManifestPaths
} from '../../../src/splitter/apply/operation-manifest.js';
import {
  InvalidOperationManifestError,
  TargetOutsideProjectError
} from '../../../src/splitter/split-errors.js';

describe('operation-manifest unit tests', () => {
  const dummyCandidate = {
    id: 'user-card',
    symbol: 'UserCard',
    kind: 'react-component'
  };

  const dummyHash = 'a'.repeat(64);

  it('should construct a valid manifest adhering to schema', () => {
    const manifest = createOperationManifest({
      operationId: '20260911T143012Z-a4f82c',
      projectRoot: '.',
      sourceFile: 'src/components/Dashboard.jsx',
      targetFile: 'src/components/UserCard.jsx',
      candidate: dummyCandidate,
      before: {
        sourceHash: dummyHash,
        targetExisted: false
      },
      backupFiles: [
        {
          originalPath: 'src/components/Dashboard.jsx',
          backupPath: 'files/src__components__Dashboard.jsx',
          hash: dummyHash
        }
      ]
    });

    expect(manifest.version).toBe(1);
    expect(manifest.status).toBe('prepared');
    expect(manifest.type).toBe('split');
    expect(manifest.rollback.available).toBe(true);

    const parsed = OperationManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(true);
  });

  it('should write and read manifest from disk with exact fidelity', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-manifest-test-'));
    const manifestPath = path.join(tempDir, 'manifest.json');

    const manifest = createOperationManifest({
      operationId: '20260911T143012Z-a4f82c',
      projectRoot: tempDir,
      sourceFile: 'src/App.jsx',
      targetFile: 'src/Header.jsx',
      candidate: dummyCandidate,
      before: {
        sourceHash: dummyHash,
        targetExisted: false
      },
      backupFiles: []
    });

    writeOperationManifest(manifestPath, manifest);
    expect(fs.existsSync(manifestPath)).toBe(true);

    const loaded = readOperationManifest(manifestPath);
    expect(loaded.operationId).toBe('20260911T143012Z-a4f82c');
    expect(loaded.sourceFile).toBe('src/App.jsx');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should reject malformed manifest schema with InvalidOperationManifestError', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-manifest-test-'));
    const manifestPath = path.join(tempDir, 'manifest.json');

    fs.writeFileSync(manifestPath, JSON.stringify({ version: 2, invalidField: true }));

    expect(() => readOperationManifest(manifestPath)).toThrow(InvalidOperationManifestError);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should reject manifests with escaping paths outside project root', () => {
    const manifest = createOperationManifest({
      operationId: '20260911T143012Z-a4f82c',
      projectRoot: '/project',
      sourceFile: '../../etc/passwd',
      targetFile: 'src/Safe.jsx',
      candidate: dummyCandidate,
      before: {
        sourceHash: dummyHash,
        targetExisted: false
      },
      backupFiles: []
    });

    expect(() => validateManifestPaths(manifest, '/project')).toThrow(TargetOutsideProjectError);
  });
});
