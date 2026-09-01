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
    it('should create .aireviewerrc.json in current directory with analyzers config', () => {
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
      expect(parsed.analyzers?.complexity).toBeDefined();
    });
  });

  describe('review command', () => {
    it('should exit with 0 for a clean codebase without findings', async () => {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'src', 'clean.js'),
        'export function add(a, b) { return a + b; }\n'
      );

      const result = spawnSync(process.execPath, [cliPath, 'review', tempDir], {
        encoding: 'utf-8'
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Discovered: 1 file');
      expect(result.stdout).toContain('Analyzed: 1 file');
      expect(result.stdout).toContain('Total: 0');
      expect(result.stdout).toContain('Review passed');
    });

    it('should exit with 1 when findings meet or exceed default medium threshold', async () => {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'src', 'equality.js'),
        'export function check(a, b) { return a == b; }\n' // triggers medium eqeqeq
      );

      const result = spawnSync(process.execPath, [cliPath, 'review', tempDir], {
        encoding: 'utf-8'
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('MEDIUM');
      expect(result.stdout).toContain('eqeqeq');
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput).toContain('Review failed');
    });

    it('should exit with 0 when only medium findings exist but threshold is set to high', async () => {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'src', 'equality.js'),
        'export function check(a, b) { return a == b; }\n' // medium finding
      );

      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--severity', 'high'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('MEDIUM');
      expect(result.stdout).toContain('Review passed: no findings reached the configured high threshold');
    });

    it('should exit with 1 when high severity finding is present under medium threshold', async () => {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'src', 'undef.js'),
        'export function run() { return missingVar; }\n' // high no-undef
      );

      const result = spawnSync(process.execPath, [cliPath, 'review', tempDir], {
        encoding: 'utf-8'
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('HIGH');
      expect(result.stdout).toContain('no-undef');
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput).toContain('Review failed');
    });

    it('should report complexity findings with suggestions in terminal mode', async () => {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'src', 'complex.js'),
        `export function evaluate(a, b, c, d, e, f, g) {
          if (a) return 1;
          return 0;
        }` // 7 parameters
      );

      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('complexity/too-many-parameters');
      expect(result.stdout).toContain('Suggestion:');
      expect(result.stdout).toContain('Functions analyzed: 1');
      expect(result.stdout).toContain('Complexity findings: 1');
    });

    it('should exit with 2 when a parser syntax failure occurs', async () => {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'src', 'broken.js'), 'const a = ;');

      const result = spawnSync(process.execPath, [cliPath, 'review', tempDir], {
        encoding: 'utf-8'
      });

      expect(result.status).toBe(2);
      expect(result.stdout).toContain('Failures:');
      expect(result.stdout).toContain('src/broken.js');
    });

    it('should emit valid machine-readable JSON without ANSI escapes or spinners', async () => {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'src', 'app.js'),
        'export function run() { return undefinedVar; }\n'
      );

      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--format', 'json'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(1);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.status).toBe('review-complete');
      expect(parsed.rootDirectory).toBe(path.resolve(tempDir));
      expect(parsed.findings).toHaveLength(1);
      expect(parsed.findings[0].ruleId).toBe('no-undef');
      expect(parsed.findings[0].severity).toBe('high');
      expect(parsed.summary.discovered).toBe(1);
      expect(parsed.summary.analyzed).toBe(1);
      expect(parsed.summary.functionsAnalyzed).toBe(1);
      expect(parsed.summary.findingsBySource).toEqual({ eslint: 1, complexity: 0 });

      // Verify no ANSI escape codes in output
      expect(result.stdout).not.toMatch(/\x1B\[[0-9;]*m/);
    });

    it('should disable complexity analysis when configured with enabled: false', async () => {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'src', 'params.js'),
        'export function test(a, b, c, d, e, f, g, h) { return a + b + c + d + e + f + g + h; }\n'
      );
      await fs.writeFile(
        path.join(tempDir, CONFIG_FILE_NAME),
        JSON.stringify({
          analyzers: {
            complexity: {
              enabled: false
            }
          }
        }, null, 2)
      );

      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--format', 'json'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.findings).toHaveLength(0);
      expect(parsed.summary.findingsBySource.complexity).toBe(0);
    });

    it('should limit discovered files when --max-files is passed', async () => {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'src', 'f1.js'), 'export const a = 1;');
      await fs.writeFile(path.join(tempDir, 'src', 'f2.js'), 'export const b = 2;');
      await fs.writeFile(path.join(tempDir, 'src', 'f3.js'), 'export const c = 3;');

      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--max-files', '2'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Discovered: 2 files');
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

    it('should fail with exit code 2 when invalid severity is supplied', () => {
      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--severity', 'extreme'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(2);
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput).toContain('Invalid severity "extreme"');
    });
  });
});
