import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';

describe('Split History Command Integration Tests', { timeout: 30000 }, () => {
  const cliPath = path.resolve(__dirname, '../../bin/cli.js');
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acr-history-integ-'));
  });

  afterEach(async () => {
    if (tempDir && fsSync.existsSync(tempDir)) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should list history and inspect specific operation after split application', async () => {
    const fixtureSrc = path.resolve(__dirname, '../fixtures/splitter-apply/successful-react-split/Dashboard.jsx');
    const sourceContent = await fs.readFile(fixtureSrc, 'utf-8');

    const projectSrcDir = path.join(tempDir, 'src');
    await fs.mkdir(projectSrcDir, { recursive: true });
    const sourceFilePath = path.join(projectSrcDir, 'Dashboard.jsx');
    await fs.writeFile(sourceFilePath, sourceContent, 'utf-8');

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
    expect(opId).toBeDefined();

    // 2. List history in terminal mode
    const listResult = spawnSync(
      process.execPath,
      [cliPath, 'split', 'history'],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    expect(listResult.status).toBe(0);
    expect(listResult.stdout).toContain('Split history');
    expect(listResult.stdout).toContain(opId);
    expect(listResult.stdout).toContain('UserCard');

    // 3. Inspect specific operation in terminal mode
    const detailResult = spawnSync(
      process.execPath,
      [cliPath, 'split', 'history', opId],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    expect(detailResult.status).toBe(0);
    expect(detailResult.stdout).toContain(`Operation Details: ${opId}`);
    expect(detailResult.stdout).toContain('UserCard');

    // 4. List history in JSON mode
    const jsonListResult = spawnSync(
      process.execPath,
      [cliPath, 'split', 'history', '--format', 'json'],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    expect(jsonListResult.status).toBe(0);
    const historyArray = JSON.parse(jsonListResult.stdout);
    expect(Array.isArray(historyArray)).toBe(true);
    expect(historyArray[0].operationId).toBe(opId);

    // 5. Inspect operation in JSON mode
    const jsonDetailResult = spawnSync(
      process.execPath,
      [cliPath, 'split', 'history', opId, '--format', 'json'],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    expect(jsonDetailResult.status).toBe(0);
    const detailObj = JSON.parse(jsonDetailResult.stdout);
    expect(detailObj.operationId).toBe(opId);
    expect(detailObj.status).toBe('completed');
  });

  it('should fail with exit code 2 when history operation is not found', async () => {
    const result = spawnSync(
      process.execPath,
      [cliPath, 'split', 'history', 'unknown-operation-id'],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('not found in history');
  });
});
