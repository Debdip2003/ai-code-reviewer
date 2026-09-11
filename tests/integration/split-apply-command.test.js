import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import { ApplyResultSchema } from '../../src/splitter/transformation-plan-schema.js';

describe('Split Apply Command Integration Tests', { timeout: 30000 }, () => {
  const cliPath = path.resolve(__dirname, '../../bin/cli.js');
  const validFixtureSrc = path.resolve(__dirname, '../fixtures/splitter-apply/successful-react-split/Dashboard.jsx');
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acr-apply-integ-'));
  });

  afterEach(async () => {
    if (tempDir && fsSync.existsSync(tempDir)) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should apply valid split with --apply --yes, creating target and updating source', async () => {
    const sourceContent = await fs.readFile(validFixtureSrc, 'utf-8');

    const projectSrcDir = path.join(tempDir, 'src');
    await fs.mkdir(projectSrcDir, { recursive: true });
    const sourceFilePath = path.join(projectSrcDir, 'Dashboard.jsx');
    await fs.writeFile(sourceFilePath, sourceContent, 'utf-8');

    const result = spawnSync(
      process.execPath,
      [cliPath, 'split', sourceFilePath, '--candidate', 'user-card', '--apply', '--yes'],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ACR split applied successfully');
    expect(result.stdout).toContain('UPDATE src/Dashboard.jsx');
    expect(result.stdout).toContain('CREATE src/Dashboard/UserCard.jsx');

    // Verify target file created
    const targetFilePath = path.join(projectSrcDir, 'Dashboard', 'UserCard.jsx');
    expect(fsSync.existsSync(targetFilePath)).toBe(true);

    const targetContent = await fs.readFile(targetFilePath, 'utf-8');
    expect(targetContent).toContain('UserCard');

    // Verify source file updated
    const updatedSource = await fs.readFile(sourceFilePath, 'utf-8');
    expect(updatedSource).toContain('UserCard');

    // Verify backup created in .acr/backups/
    const backupsDir = path.join(tempDir, '.acr', 'backups');
    expect(fsSync.existsSync(backupsDir)).toBe(true);
    const backupEntries = await fs.readdir(backupsDir);
    expect(backupEntries.length).toBeGreaterThanOrEqual(1);
  });

  it('should reject non-interactive apply without --yes with exit code 4', async () => {
    const sourceContent = await fs.readFile(validFixtureSrc, 'utf-8');

    const projectSrcDir = path.join(tempDir, 'src');
    await fs.mkdir(projectSrcDir, { recursive: true });
    const sourceFilePath = path.join(projectSrcDir, 'Dashboard.jsx');
    await fs.writeFile(sourceFilePath, sourceContent, 'utf-8');

    const result = spawnSync(
      process.execPath,
      [cliPath, 'split', sourceFilePath, '--candidate', 'user-card', '--apply'],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    expect(result.status).toBe(4);
    expect(result.stderr).toContain('confirmation required');
  });

  it('should support custom target path override with --target', async () => {
    const sourceContent = await fs.readFile(validFixtureSrc, 'utf-8');

    const projectSrcDir = path.join(tempDir, 'src');
    await fs.mkdir(projectSrcDir, { recursive: true });
    const sourceFilePath = path.join(projectSrcDir, 'Dashboard.jsx');
    await fs.writeFile(sourceFilePath, sourceContent, 'utf-8');

    const customTarget = 'src/components/cards/UserCard.jsx';

    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        'split',
        sourceFilePath,
        '--candidate',
        'user-card',
        '--target',
        customTarget,
        '--apply',
        '--yes'
      ],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    expect(result.status).toBe(0);
    const absCustomTarget = path.join(tempDir, customTarget);
    expect(fsSync.existsSync(absCustomTarget)).toBe(true);
  });

  it('should output valid structured JSON matching schema when --format json is provided', async () => {
    const sourceContent = await fs.readFile(validFixtureSrc, 'utf-8');

    const projectSrcDir = path.join(tempDir, 'src');
    await fs.mkdir(projectSrcDir, { recursive: true });
    const sourceFilePath = path.join(projectSrcDir, 'Dashboard.jsx');
    await fs.writeFile(sourceFilePath, sourceContent, 'utf-8');

    const result = spawnSync(
      process.execPath,
      [cliPath, 'split', sourceFilePath, '--candidate', 'user-card', '--apply', '--yes', '--format', 'json'],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.mode).toBe('apply');
    expect(parsed.operationId).toBeDefined();

    const validated = ApplyResultSchema.safeParse(parsed);
    expect(validated.success).toBe(true);
  });

  it('should reject manual-review candidate on --apply with exit code 3', async () => {
    const fixtureSrc = path.resolve(__dirname, '../fixtures/splitter-apply/manual-review-candidate/input.jsx');
    const sourceContent = await fs.readFile(fixtureSrc, 'utf-8');

    const projectSrcDir = path.join(tempDir, 'src');
    await fs.mkdir(projectSrcDir, { recursive: true });
    const sourceFilePath = path.join(projectSrcDir, 'Component.jsx');
    await fs.writeFile(sourceFilePath, sourceContent, 'utf-8');

    const result = spawnSync(
      process.execPath,
      [cliPath, 'split', sourceFilePath, '--candidate', 'increment-button', '--apply', '--yes'],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    expect(result.status).toBe(3);
    expect(result.stderr).toContain('Only "automatic-ready" candidates can be applied automatically');
  });

  it('should reject apply if target file already exists with exit code 5 or 3', async () => {
    const sourceContent = await fs.readFile(validFixtureSrc, 'utf-8');

    const projectSrcDir = path.join(tempDir, 'src');
    await fs.mkdir(projectSrcDir, { recursive: true });
    const sourceFilePath = path.join(projectSrcDir, 'Dashboard.jsx');
    await fs.writeFile(sourceFilePath, sourceContent, 'utf-8');

    // Create colliding target file in Dashboard/UserCard.jsx
    const targetDir = path.join(projectSrcDir, 'Dashboard');
    await fs.mkdir(targetDir, { recursive: true });
    const targetFilePath = path.join(targetDir, 'UserCard.jsx');
    await fs.writeFile(targetFilePath, 'export function Existing() {}', 'utf-8');

    const result = spawnSync(
      process.execPath,
      [cliPath, 'split', sourceFilePath, '--candidate', 'user-card', '--apply', '--yes'],
      {
        cwd: tempDir,
        encoding: 'utf-8'
      }
    );

    expect(result.status).toBe(3); // Candidate safety blocked due to collision
  });
});
