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
      await fs.writeFile(path.join(tempDir, 'src', 'app.js'), 'import React from "react"; export const sum = (a, b) => a + b;');
      await fs.writeFile(path.join(tempDir, 'src', 'components', 'Button.jsx'), 'export const Button = () => <button>Click</button>;');
      await fs.writeFile(path.join(tempDir, 'src', 'helper.mjs'), 'export function helper() { return 42; }');
    });

    it('should discover, parse, and print files in terminal format with exit code 0', () => {
      const result = spawnSync(process.execPath, [cliPath, 'review', tempDir], {
        encoding: 'utf-8'
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Project root:');
      expect(result.stdout).toContain('Discovered 3 supported files');
      expect(result.stdout).toContain('Parsed successfully: 3');
      expect(result.stdout).toContain('Parse failures: 0');
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
      expect(parsed.status).toBe('parse-complete');
      expect(parsed.rootDirectory).toBe(path.resolve(tempDir));
      expect(parsed.summary.discovered).toBe(3);
      expect(parsed.summary.parsed).toBe(3);
      expect(parsed.summary.failed).toBe(0);
      expect(parsed.files).toHaveLength(3);
      expect(parsed.files[0]).toHaveProperty('relativePath');
      expect(parsed.files[0]).toHaveProperty('sourceType');
      expect(parsed.files[0]).toHaveProperty('statementCount');
      expect(parsed.files[0]).toHaveProperty('imports');
      expect(parsed.files[0]).toHaveProperty('functions');
    });

    it('should handle parse failures by setting exit code 2 and continuing to process valid files', async () => {
      await fs.writeFile(path.join(tempDir, 'src', 'broken.js'), 'const a = ;');

      const result = spawnSync(process.execPath, [cliPath, 'review', tempDir], {
        encoding: 'utf-8'
      });

      expect(result.status).toBe(2);
      expect(result.stdout).toContain('Discovered 4 supported files');
      expect(result.stdout).toContain('Parsed successfully: 3');
      expect(result.stdout).toContain('Parse failures: 1');
      expect(result.stdout).toContain('Parse failures:');
      expect(result.stdout).toContain('src/broken.js:1:');
    });

    it('should emit valid JSON containing failures when syntax errors occur', async () => {
      await fs.writeFile(path.join(tempDir, 'src', 'broken.js'), 'const a = ;');

      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--format', 'json'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(2);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.status).toBe('parse-complete');
      expect(parsed.summary.failed).toBe(1);
      expect(parsed.summary.parsed).toBe(3);
      expect(parsed.failures).toHaveLength(1);
      expect(parsed.failures[0].relativePath).toBe('src/broken.js');
      expect(parsed.failures[0].line).toBe(1);
    });

    it('should maintain sorted output order even with concurrency > 1', async () => {
      // Create additional files
      for (let i = 1; i <= 6; i++) {
        await fs.writeFile(path.join(tempDir, 'src', `z_${i}.js`), `export const z${i} = ${i};`);
      }

      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--format', 'json'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      const relativePaths = parsed.files.map((f) => f.relativePath);

      const sortedPaths = [...relativePaths].sort((a, b) => a.localeCompare(b));
      expect(relativePaths).toEqual(sortedPaths);
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

    it('should fail with exit code 2 when --changed is passed', () => {
      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--changed'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(2);
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput).toContain('Git diff review (--changed) is not implemented yet');
    });

    it('should fail with exit code 2 when invalid format is supplied', () => {
      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--format', 'xml'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(2);
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput).toContain('Invalid format "xml"');
    });

    it('should fail with exit code 2 when invalid max-files is supplied', () => {
      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--max-files', 'abc'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(2);
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput).toContain('positive integer');
    });
  });
});
