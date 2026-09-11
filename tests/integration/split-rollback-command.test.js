import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';

describe('Split Rollback Command Integration Tests', { timeout: 30000 }, () => {
  const cliPath = path.resolve(__dirname, '../../bin/cli.js');
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acr-rollback-integ-'));
  });

  afterEach(async () => {
    if (tempDir && fsSync.existsSync(tempDir)) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should roll back an applied split with --yes, restoring source and removing target', async () => {
    const fixtureSrc = path.resolve(__dirname, '../fixtures/splitter-apply/successful-react-split/Dashboard.jsx');
    const originalContent = await fs.readFile(fixtureSrc, 'utf-8');

    const projectSrcDir = path.join(tempDir, 'src');
    await fs.mkdir(projectSrcDir, { recursive: true });
    const sourceFilePath = path.join(projectSrcDir, 'Dashboard.jsx');
    await fs.writeFile(sourceFilePath, originalContent, 'utf-8');

    // 1. Apply split
    const applyResult = spawnSync(
      process.execPath,
      [cliPath, 'split', sourceFilePath, '--candidate', 'user-card', '--apply', '--yes', '--format', 'json'],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    expect(applyResult.status).toBe(0);
    const applyData = JSON.parse(applyResult.stdout);
    const opId = applyData.operationId;

    const targetFilePath = path.join(projectSrcDir, 'Dashboard', 'UserCard.jsx');
    expect(fsSync.existsSync(targetFilePath)).toBe(true);

    // 2. Roll back split
    const rollbackResult = spawnSync(
      process.execPath,
      [cliPath, 'split', 'rollback', opId, '--yes'],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    expect(rollbackResult.status).toBe(0);
    expect(rollbackResult.stdout).toContain('ACR rollback completed');
    expect(rollbackResult.stdout).toContain(opId);

    // Verify source restored to original content
    const restoredSource = await fs.readFile(sourceFilePath, 'utf-8');
    expect(restoredSource).toBe(originalContent);

    // Verify target file removed
    expect(fsSync.existsSync(targetFilePath)).toBe(false);
  });

  it('should output structured JSON on rollback when --format json is passed', async () => {
    const fixtureSrc = path.resolve(__dirname, '../fixtures/splitter-apply/successful-react-split/Dashboard.jsx');
    const originalContent = await fs.readFile(fixtureSrc, 'utf-8');

    const projectSrcDir = path.join(tempDir, 'src');
    await fs.mkdir(projectSrcDir, { recursive: true });
    const sourceFilePath = path.join(projectSrcDir, 'Dashboard.jsx');
    await fs.writeFile(sourceFilePath, originalContent, 'utf-8');

    const applyResult = spawnSync(
      process.execPath,
      [cliPath, 'split', sourceFilePath, '--candidate', 'user-card', '--apply', '--yes', '--format', 'json'],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    const applyData = JSON.parse(applyResult.stdout);
    const opId = applyData.operationId;

    const rollbackResult = spawnSync(
      process.execPath,
      [cliPath, 'split', 'rollback', opId, '--yes', '--format', 'json'],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    expect(rollbackResult.status).toBe(0);
    const rollbackData = JSON.parse(rollbackResult.stdout);
    expect(rollbackData.success).toBe(true);
    expect(rollbackData.mode).toBe('rollback');
    expect(rollbackData.operationId).toBe(opId);
    expect(rollbackData.restored.length).toBeGreaterThanOrEqual(1);
    expect(rollbackData.removed.length).toBeGreaterThanOrEqual(1);
  });

  it('should reject non-interactive rollback without --yes with exit code 4', async () => {
    const fixtureSrc = path.resolve(__dirname, '../fixtures/splitter-apply/successful-react-split/Dashboard.jsx');
    const originalContent = await fs.readFile(fixtureSrc, 'utf-8');

    const projectSrcDir = path.join(tempDir, 'src');
    await fs.mkdir(projectSrcDir, { recursive: true });
    const sourceFilePath = path.join(projectSrcDir, 'Dashboard.jsx');
    await fs.writeFile(sourceFilePath, originalContent, 'utf-8');

    const applyResult = spawnSync(
      process.execPath,
      [cliPath, 'split', sourceFilePath, '--candidate', 'user-card', '--apply', '--yes', '--format', 'json'],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    const applyData = JSON.parse(applyResult.stdout);
    const opId = applyData.operationId;

    const rollbackResult = spawnSync(
      process.execPath,
      [cliPath, 'split', 'rollback', opId],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    expect(rollbackResult.status).toBe(4);
    expect(rollbackResult.stderr).toContain('Rollback requires confirmation');
  });

  it('should reject rollback with exit code 7 if source file was modified after split', async () => {
    const fixtureSrc = path.resolve(__dirname, '../fixtures/splitter-apply/successful-react-split/Dashboard.jsx');
    const originalContent = await fs.readFile(fixtureSrc, 'utf-8');

    const projectSrcDir = path.join(tempDir, 'src');
    await fs.mkdir(projectSrcDir, { recursive: true });
    const sourceFilePath = path.join(projectSrcDir, 'Dashboard.jsx');
    await fs.writeFile(sourceFilePath, originalContent, 'utf-8');

    const applyResult = spawnSync(
      process.execPath,
      [cliPath, 'split', sourceFilePath, '--candidate', 'user-card', '--apply', '--yes', '--format', 'json'],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    const applyData = JSON.parse(applyResult.stdout);
    const opId = applyData.operationId;

    // Modify source file after split
    await fs.appendFile(sourceFilePath, '\n// user modified source code\n', 'utf-8');

    const rollbackResult = spawnSync(
      process.execPath,
      [cliPath, 'split', 'rollback', opId, '--yes'],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    expect(rollbackResult.status).toBe(7);
    expect(rollbackResult.stderr).toContain('modified after the split operation');
  });
});
