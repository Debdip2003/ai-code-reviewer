import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  listOperationHistory,
  getOperationHistory
} from '../../../src/splitter/apply/operation-history.js';
import {
  createOperationManifest,
  writeOperationManifest
} from '../../../src/splitter/apply/operation-manifest.js';
import { getBackupDirectory } from '../../../src/splitter/apply/backup-manager.js';
import { OperationNotFoundError } from '../../../src/splitter/split-errors.js';

describe('operation-history unit tests', () => {
  it('should list operations sorted by timestamp descending', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-history-test-'));
    const op1 = '20260911T100000Z-111111';
    const op2 = '20260911T120000Z-222222';
    const dummyHash = 'a'.repeat(64);

    const m1 = createOperationManifest({
      operationId: op1,
      projectRoot: tempDir,
      sourceFile: 'src/App.jsx',
      targetFile: 'src/Card.jsx',
      candidate: { id: 'card', symbol: 'Card', kind: 'react-component' },
      before: { sourceHash: dummyHash, targetExisted: false },
      backupFiles: []
    });
    m1.createdAt = '2026-09-11T10:00:00.000Z';
    writeOperationManifest(path.join(getBackupDirectory(tempDir, op1), 'manifest.json'), m1);

    const m2 = createOperationManifest({
      operationId: op2,
      projectRoot: tempDir,
      sourceFile: 'src/App.jsx',
      targetFile: 'src/Header.jsx',
      candidate: { id: 'header', symbol: 'Header', kind: 'react-component' },
      before: { sourceHash: dummyHash, targetExisted: false },
      backupFiles: []
    });
    m2.createdAt = '2026-09-11T12:00:00.000Z';
    writeOperationManifest(path.join(getBackupDirectory(tempDir, op2), 'manifest.json'), m2);

    const history = listOperationHistory({ projectRoot: tempDir });
    expect(history.length).toBe(2);
    // op2 is newer, so it should be first
    expect(history[0].operationId).toBe(op2);
    expect(history[1].operationId).toBe(op1);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should fetch detailed manifest for a single operation ID', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-history-detail-'));
    const opId = '20260911T143012Z-a4f82c';
    const dummyHash = 'a'.repeat(64);

    const manifest = createOperationManifest({
      operationId: opId,
      projectRoot: tempDir,
      sourceFile: 'src/App.jsx',
      targetFile: 'src/Card.jsx',
      candidate: { id: 'card', symbol: 'Card', kind: 'react-component' },
      before: { sourceHash: dummyHash, targetExisted: false },
      backupFiles: []
    });
    writeOperationManifest(path.join(getBackupDirectory(tempDir, opId), 'manifest.json'), manifest);

    const detail = getOperationHistory({ projectRoot: tempDir, operationId: opId });
    expect(detail.operationId).toBe(opId);
    expect(detail.sourceFile).toBe('src/App.jsx');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should throw OperationNotFoundError for non-existent operation', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-history-notfound-'));

    expect(() =>
      getOperationHistory({ projectRoot: tempDir, operationId: 'unknown-op' })
    ).toThrow(OperationNotFoundError);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
