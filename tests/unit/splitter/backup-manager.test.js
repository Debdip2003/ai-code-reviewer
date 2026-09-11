import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createBackup,
  verifyBackup,
  restoreBackupFile,
  getBackupDirectory
} from '../../../src/splitter/apply/backup-manager.js';
import {
  calculateFileSha256,
  calculateSha256
} from '../../../src/splitter/apply/write-utils.js';
import { BackupVerificationError } from '../../../src/splitter/split-errors.js';

describe('backup-manager unit tests', () => {
  it('should create and verify byte-accurate backup file', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-backup-test-'));
    const sourceContent = 'export function App() { return <div>App</div>; }\n';
    const sourceHash = calculateSha256(sourceContent);
    const opId = '20260911T143012Z-a4f82c';

    const backupFiles = createBackup({
      projectRoot: tempDir,
      operationId: opId,
      sourceFile: 'src/App.jsx',
      sourceContent,
      beforeSourceHash: sourceHash
    });

    expect(backupFiles.length).toBe(1);
    expect(backupFiles[0].originalPath).toBe('src/App.jsx');
    expect(backupFiles[0].hash).toBe(sourceHash);

    const backupDir = getBackupDirectory(tempDir, opId);
    const backupFilePath = path.join(backupDir, backupFiles[0].backupPath);
    expect(fs.existsSync(backupFilePath)).toBe(true);
    expect(fs.readFileSync(backupFilePath, 'utf8')).toBe(sourceContent);

    // Verify
    expect(() =>
      verifyBackup({
        projectRoot: tempDir,
        operationId: opId,
        manifest: { backupFiles }
      })
    ).not.toThrow();

    // Restore to new destination
    const restoredPath = path.join(tempDir, 'restored', 'App.jsx');
    const restoredHash = restoreBackupFile({
      projectRoot: tempDir,
      operationId: opId,
      backupFileRecord: backupFiles[0],
      destinationPath: restoredPath
    });

    expect(restoredHash).toBe(sourceHash);
    expect(fs.readFileSync(restoredPath, 'utf8')).toBe(sourceContent);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should throw BackupVerificationError if backup file is tampered with', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-backup-tamper-'));
    const sourceContent = 'const original = true;';
    const sourceHash = calculateSha256(sourceContent);
    const opId = '20260911T143012Z-a4f82c';

    const backupFiles = createBackup({
      projectRoot: tempDir,
      operationId: opId,
      sourceFile: 'src/index.js',
      sourceContent,
      beforeSourceHash: sourceHash
    });

    // Tamper with backup file
    const backupDir = getBackupDirectory(tempDir, opId);
    const backupFilePath = path.join(backupDir, backupFiles[0].backupPath);
    fs.writeFileSync(backupFilePath, 'const tampered = true;');

    expect(() =>
      verifyBackup({
        projectRoot: tempDir,
        operationId: opId,
        manifest: { backupFiles }
      })
    ).toThrow(BackupVerificationError);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
