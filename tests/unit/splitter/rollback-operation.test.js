import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { rollbackOperation } from '../../../src/splitter/apply/rollback-operation.js';
import { createBackup, getBackupDirectory } from '../../../src/splitter/apply/backup-manager.js';
import { createOperationManifest, writeOperationManifest } from '../../../src/splitter/apply/operation-manifest.js';
import { calculateSha256 } from '../../../src/splitter/apply/write-utils.js';
import {
  OperationNotFoundError,
  RollbackConflictError
} from '../../../src/splitter/split-errors.js';

describe('rollback-operation unit tests', () => {
  it('should successfully roll back an applied operation and restore source file', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-rollback-test-'));
    const opId = '20260911T143012Z-a4f82c';
    const sourceFile = 'src/Dashboard.jsx';
    const targetFile = 'src/UserCard.jsx';
    const absSource = path.join(tempDir, sourceFile);
    const absTarget = path.join(tempDir, targetFile);

    const originalSourceContent = 'export function Dashboard() { return <div />; }\n';
    const beforeSourceHash = calculateSha256(originalSourceContent);

    const modifiedSourceContent = 'import { UserCard } from "./UserCard.jsx";\nexport function Dashboard() { return <UserCard />; }\n';
    const targetContent = 'export function UserCard() { return <div>User</div>; }\n';
    const afterSourceHash = calculateSha256(modifiedSourceContent);
    const afterTargetHash = calculateSha256(targetContent);

    // Setup project files in "after split" state
    fs.mkdirSync(path.dirname(absSource), { recursive: true });
    fs.writeFileSync(absSource, modifiedSourceContent);
    fs.writeFileSync(absTarget, targetContent);

    // Setup backup and manifest
    const backupFiles = createBackup({
      projectRoot: tempDir,
      operationId: opId,
      sourceFile,
      sourceContent: originalSourceContent,
      beforeSourceHash
    });

    const manifest = createOperationManifest({
      operationId: opId,
      projectRoot: tempDir,
      sourceFile,
      targetFile,
      candidate: { id: 'user-card', symbol: 'UserCard', kind: 'react-component' },
      before: { sourceHash: beforeSourceHash, targetExisted: false },
      backupFiles
    });
    manifest.status = 'completed';
    manifest.after = { sourceHash: afterSourceHash, targetHash: afterTargetHash };

    const manifestPath = path.join(getBackupDirectory(tempDir, opId), 'manifest.json');
    writeOperationManifest(manifestPath, manifest);

    // Execute rollback
    const res = await rollbackOperation({
      projectRoot: tempDir,
      operationId: opId,
      yes: true
    });

    expect(res.success).toBe(true);
    expect(res.restored).toContain(sourceFile);
    expect(res.removed).toContain(targetFile);

    // Verify source restored to original
    expect(fs.readFileSync(absSource, 'utf8')).toBe(originalSourceContent);
    // Verify target file removed
    expect(fs.existsSync(absTarget)).toBe(false);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should abort rollback with RollbackConflictError if source file was modified after split', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-rollback-src-conflict-'));
    const opId = '20260911T143012Z-a4f82c';
    const sourceFile = 'src/Dashboard.jsx';
    const targetFile = 'src/UserCard.jsx';
    const absSource = path.join(tempDir, sourceFile);
    const absTarget = path.join(tempDir, targetFile);

    const originalSourceContent = 'export function Dashboard() { return <div />; }\n';
    const beforeSourceHash = calculateSha256(originalSourceContent);

    const modifiedSourceContent = 'import { UserCard } from "./UserCard.jsx";\nexport function Dashboard() { return <UserCard />; }\n';
    const targetContent = 'export function UserCard() { return <div>User</div>; }\n';
    const afterSourceHash = calculateSha256(modifiedSourceContent);
    const afterTargetHash = calculateSha256(targetContent);

    // Setup files
    fs.mkdirSync(path.dirname(absSource), { recursive: true });
    // User modified source file with new changes!
    fs.writeFileSync(absSource, '/* USER NEW CHANGE */\n' + modifiedSourceContent);
    fs.writeFileSync(absTarget, targetContent);

    const backupFiles = createBackup({
      projectRoot: tempDir,
      operationId: opId,
      sourceFile,
      sourceContent: originalSourceContent,
      beforeSourceHash
    });

    const manifest = createOperationManifest({
      operationId: opId,
      projectRoot: tempDir,
      sourceFile,
      targetFile,
      candidate: { id: 'user-card', symbol: 'UserCard', kind: 'react-component' },
      before: { sourceHash: beforeSourceHash, targetExisted: false },
      backupFiles
    });
    manifest.status = 'completed';
    manifest.after = { sourceHash: afterSourceHash, targetHash: afterTargetHash };

    const manifestPath = path.join(getBackupDirectory(tempDir, opId), 'manifest.json');
    writeOperationManifest(manifestPath, manifest);

    await expect(
      rollbackOperation({
        projectRoot: tempDir,
        operationId: opId,
        yes: true
      })
    ).rejects.toThrow(RollbackConflictError);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should abort rollback with RollbackConflictError if target file was modified after split', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-rollback-tgt-conflict-'));
    const opId = '20260911T143012Z-a4f82c';
    const sourceFile = 'src/Dashboard.jsx';
    const targetFile = 'src/UserCard.jsx';
    const absSource = path.join(tempDir, sourceFile);
    const absTarget = path.join(tempDir, targetFile);

    const originalSourceContent = 'export function Dashboard() { return <div />; }\n';
    const beforeSourceHash = calculateSha256(originalSourceContent);

    const modifiedSourceContent = 'import { UserCard } from "./UserCard.jsx";\nexport function Dashboard() { return <UserCard />; }\n';
    const targetContent = 'export function UserCard() { return <div>User</div>; }\n';
    const afterSourceHash = calculateSha256(modifiedSourceContent);
    const afterTargetHash = calculateSha256(targetContent);

    fs.mkdirSync(path.dirname(absSource), { recursive: true });
    fs.writeFileSync(absSource, modifiedSourceContent);
    // User modified target file with new edits!
    fs.writeFileSync(absTarget, targetContent + '\n// user added edit');

    const backupFiles = createBackup({
      projectRoot: tempDir,
      operationId: opId,
      sourceFile,
      sourceContent: originalSourceContent,
      beforeSourceHash
    });

    const manifest = createOperationManifest({
      operationId: opId,
      projectRoot: tempDir,
      sourceFile,
      targetFile,
      candidate: { id: 'user-card', symbol: 'UserCard', kind: 'react-component' },
      before: { sourceHash: beforeSourceHash, targetExisted: false },
      backupFiles
    });
    manifest.status = 'completed';
    manifest.after = { sourceHash: afterSourceHash, targetHash: afterTargetHash };

    const manifestPath = path.join(getBackupDirectory(tempDir, opId), 'manifest.json');
    writeOperationManifest(manifestPath, manifest);

    await expect(
      rollbackOperation({
        projectRoot: tempDir,
        operationId: opId,
        yes: true
      })
    ).rejects.toThrow(RollbackConflictError);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should throw OperationNotFoundError when rolling back non-existent operation', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-rollback-missing-'));

    await expect(
      rollbackOperation({
        projectRoot: tempDir,
        operationId: 'non-existent-op',
        yes: true
      })
    ).rejects.toThrow(OperationNotFoundError);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
