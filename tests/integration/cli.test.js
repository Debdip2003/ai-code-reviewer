import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { CONFIG_FILE_NAME } from '../../src/config/defaults.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../../bin/cli.js');

describe('CLI Integration Tests', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-reviewer-cli-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should display help and exit successfully when invoked with --help', () => {
    const result = spawnSync(process.execPath, [cliPath, '--help'], {
      encoding: 'utf-8'
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ai-code-reviewer');
    expect(result.stdout).toContain('review');
    expect(result.stdout).toContain('init');
  });

  it('should display version information when invoked with --version', () => {
    const result = spawnSync(process.execPath, [cliPath, '--version'], {
      encoding: 'utf-8'
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('0.1.0');
  });

  describe('init command', () => {
    it('should create .aireviewerrc.json in current directory', () => {
      const result = spawnSync(process.execPath, [cliPath, 'init'], {
        cwd: tempDir,
        encoding: 'utf-8'
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Created configuration file');

      const configPath = path.join(tempDir, CONFIG_FILE_NAME);
      const content = spawnSync(process.execPath, ['-e', `console.log(require('fs').existsSync(${JSON.stringify(configPath)}))`], {
        encoding: 'utf-8'
      });
      expect(content.stdout.trim()).toBe('true');
    });

    it('should not overwrite existing configuration file without --force', async () => {
      const configPath = path.join(tempDir, CONFIG_FILE_NAME);
      await fs.writeFile(configPath, '{"custom": true}\n');

      const result = spawnSync(process.execPath, [cliPath, 'init'], {
        cwd: tempDir,
        encoding: 'utf-8'
      });

      expect(result.status).toBe(0);
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput).toContain('already exists');
      expect(combinedOutput).toContain('--force');

      const raw = await fs.readFile(configPath, 'utf-8');
      expect(raw).toBe('{"custom": true}\n');
    });

    it('should overwrite existing configuration file with --force', async () => {
      const configPath = path.join(tempDir, CONFIG_FILE_NAME);
      await fs.writeFile(configPath, '{"custom": true}\n');

      const result = spawnSync(process.execPath, [cliPath, 'init', '--force'], {
        cwd: tempDir,
        encoding: 'utf-8'
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Created configuration file');

      const raw = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.concurrency).toBe(2);
      expect(parsed.include).toBeDefined();
    });
  });

  describe('review command', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(tempDir, 'src', 'components'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'src', 'app.js'), 'console.log("app");');
      await fs.writeFile(path.join(tempDir, 'src', 'components', 'Button.jsx'), 'export const Button = null;');
      await fs.writeFile(path.join(tempDir, 'src', 'helper.mjs'), 'export const h = 1;');
    });

    it('should discover and print files in terminal format by default', () => {
      const result = spawnSync(process.execPath, [cliPath, 'review', tempDir], {
        encoding: 'utf-8'
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Project root:');
      expect(result.stdout).toContain('Discovered 3 supported files');
      expect(result.stdout).toContain('src/app.js');
      expect(result.stdout).toContain('src/components/Button.jsx');
      expect(result.stdout).toContain('src/helper.mjs');
    });

    it('should emit valid machine-readable JSON when --format json is specified', () => {
      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--format', 'json'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.status).toBe('scan-complete');
      expect(parsed.rootDirectory).toBe(path.resolve(tempDir));
      expect(parsed.summary.discovered).toBe(3);
      expect(parsed.files).toHaveLength(3);
      expect(parsed.files[0]).toHaveProperty('relativePath');
      expect(parsed.files[0]).toHaveProperty('extension');
      expect(parsed.files[0]).toHaveProperty('sizeBytes');
    });

    it('should limit discovered files when --max-files is passed', () => {
      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--max-files', '2'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Discovered 2 supported files');
      expect(result.stdout).toContain('Skipped: 1 limited');
    });

    it('should fail with nonzero exit code when --changed is passed', () => {
      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--changed'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(1);
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput).toContain('Git diff review (--changed) is not implemented yet');
    });

    it('should fail with nonzero exit code when invalid format is supplied', () => {
      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--format', 'xml'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(1);
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput).toContain('Invalid format "xml"');
    });

    it('should fail with nonzero exit code when invalid max-files is supplied', () => {
      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--max-files', 'abc'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(1);
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput).toContain('positive integer');
    });
  });
});
