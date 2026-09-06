import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { CONFIG_FILE_NAME } from '../../src/config/defaults.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../../bin/cli.js');

describe('CLI Integration Tests', { timeout: 20000 }, () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acr-cli-test-'));
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
    expect(result.stdout).toContain('acr');
    expect(result.stdout).toContain('review');
    expect(result.stdout).toContain('init');
    expect(result.stdout).toContain('doctor');
    expect(result.stdout).toContain('cache');
  });

  it('should display version information when invoked with --version', async () => {
    const pkgJson = JSON.parse(await fs.readFile(path.resolve(__dirname, '../../package.json'), 'utf-8'));
    const result = spawnSync(process.execPath, [cliPath, '--version'], {
      encoding: 'utf-8'
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(pkgJson.version);
  });

  describe('doctor command', () => {
    it('should run doctor diagnostics in terminal mode', () => {
      const result = spawnSync(process.execPath, [cliPath, 'doctor', tempDir], {
        encoding: 'utf-8'
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('ACR Doctor');
      expect(result.stdout).toContain('Node.js');
      expect(result.stdout).toContain('Directory valid');
      expect(result.stdout).toContain('configuration');
    });

    it('should output valid JSON diagnostics when --format json is provided', () => {
      const result = spawnSync(process.execPath, [cliPath, 'doctor', tempDir, '--format', 'json'], {
        encoding: 'utf-8'
      });

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.status).toBe('doctor-pass');
      expect(parsed.nodeSupported).toBe(true);
      expect(parsed.rootValid).toBe(true);
      expect(parsed.configValid).toBe(true);
      expect(parsed.apiKeyConfigured).toBeDefined();
    });
  });

  describe('init command', () => {
    it('should create .acrrc.json in current directory with analyzers config', () => {
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
      expect(parsed.analyzers?.react).toBeDefined();
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

    it('should support --debug flag and write debug logs strictly to stderr', async () => {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'src', 'clean.js'),
        'export function add(a, b) { return a + b; }\n'
      );

      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--debug', '--format', 'json'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toContain('[DEBUG]');
      // Verify stdout is pure valid JSON without debug text
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.status).toBe('review-complete');
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
      expect(parsed.summary.findingsBySource).toEqual({ eslint: 1, complexity: 0, react: 0, ai: 0 });
      expect(parsed.summary.ai).toBeDefined();
      expect(parsed.summary.ai.enabled).toBe(false);

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

    it('should report React findings and summary metrics in CLI review', async () => {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'src', 'ProductList.jsx'),
        `import React, { useState } from 'react';
        export function ProductList({ items }) {
          const [stateItems, setStateItems] = useState([]);
          function addItem(item) {
            stateItems.push(item);
          }
          return (
            <div>
              {items.map((it, idx) => (
                <span key={idx}>{it.name}</span>
              ))}
            </div>
          );
        }\n`
      );

      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('react/direct-state-mutation');
      expect(result.stdout).toContain('react/array-index-key');
      expect(result.stdout).toContain('React findings:');
      expect(result.stdout).toContain('Components analyzed: 1');
      expect(result.stdout).toContain('State variables tracked: 1');
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

    it('should fail with exit code 2 when --base is provided without --changed', () => {
      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--base', 'main'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(2);
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput).toContain('Option --base requires --changed to be specified');
    });

    it('should fail with exit code 2 when --changed is used in non-git directory', () => {
      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--changed'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(2);
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput).toContain('not inside a Git repository');
    });

    it('should review only changed lines when --changed is used in a git repo', async () => {
      // Initialize Git repo
      spawnSync('git', ['init'], { cwd: tempDir });
      spawnSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
      spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tempDir });

      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      // File with preexisting issue on line 1
      const initialCode = 'export function oldBad() { return a == b; }\nexport function clean() { return 1; }\n';
      await fs.writeFile(path.join(tempDir, 'src', 'app.js'), initialCode);
      spawnSync('git', ['add', '.'], { cwd: tempDir });
      spawnSync('git', ['commit', '-m', 'initial'], { cwd: tempDir });

      // Add a clean change to line 2 (line 1 is NOT changed)
      const updatedCode = 'export function oldBad() { return a == b; }\nexport function clean() { return 2; }\n';
      await fs.writeFile(path.join(tempDir, 'src', 'app.js'), updatedCode);

      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--changed', '--format', 'json'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.summary.scope.mode).toBe('changed');
      expect(parsed.findings).toHaveLength(0); // line 1 eqeqeq finding filtered out because it was not changed
    });

    it('should reuse cached review results on second run', async () => {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'src', 'calc.js'),
        'export function calc(a, b) { return a + b; }\n'
      );

      // Run 1: Cold cache (write)
      const run1 = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--format', 'json'],
        { encoding: 'utf-8' }
      );
      expect(run1.status).toBe(0);
      const parsed1 = JSON.parse(run1.stdout.trim());
      expect(parsed1.summary.cache.writes).toBe(1);
      expect(parsed1.summary.cache.hits).toBe(0);

      // Run 2: Warm cache (hit)
      const run2 = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--format', 'json'],
        { encoding: 'utf-8' }
      );
      expect(run2.status).toBe(0);
      const parsed2 = JSON.parse(run2.stdout.trim());
      expect(parsed2.summary.cache.hits).toBe(1);
      expect(parsed2.summary.cache.writes).toBe(0);
    });

    it('should bypass cache when --no-cache is passed', async () => {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'src', 'calc.js'),
        'export function calc(a, b) { return a + b; }\n'
      );

      const run = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--no-cache', '--format', 'json'],
        { encoding: 'utf-8' }
      );
      expect(run.status).toBe(0);
      const parsed = JSON.parse(run.stdout.trim());
      expect(parsed.summary.cache.enabled).toBe(false);
      expect(parsed.summary.cache.hits).toBe(0);
      expect(parsed.summary.cache.writes).toBe(0);
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

    it('should fail with exit code 2 when --ai is passed without OPENAI_API_KEY', async () => {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'src', 'clean.js'),
        'export function add(a, b) { return a + b; }\n'
      );

      const envWithoutKey = { ...process.env };
      delete envWithoutKey.OPENAI_API_KEY;
      delete envWithoutKey.GROQ_API_KEY;

      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--ai'],
        {
          encoding: 'utf-8',
          env: envWithoutKey
        }
      );

      expect(result.status).toBe(2);
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput).toContain('OPENAI_API_KEY environment variable is missing');
    });

    it('should fail with exit code 2 when invalid --max-ai-cost is provided', () => {
      const result = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir, '--max-ai-cost', '-5'],
        { encoding: 'utf-8' }
      );

      expect(result.status).toBe(2);
      const combinedOutput = result.stdout + result.stderr;
      expect(combinedOutput).toContain('Option --max-ai-cost must be a positive number');
    });
  });

  describe('cache command', () => {
    it('should clear cache directory and output confirmation', async () => {
      // First populate cache
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'src', 'clean.js'),
        'export function add(a, b) { return a + b; }\n'
      );

      const reviewRun = spawnSync(
        process.execPath,
        [cliPath, 'review', tempDir],
        { encoding: 'utf-8' }
      );
      expect(reviewRun.status).toBe(0);

      // Now clear cache
      const clearRun = spawnSync(
        process.execPath,
        [cliPath, 'cache', 'clear', tempDir],
        { encoding: 'utf-8' }
      );
      expect(clearRun.status).toBe(0);
      expect(clearRun.stdout).toContain('Cache cleared');

      // Clear again (should say 0 items)
      const clearAgainJson = spawnSync(
        process.execPath,
        [cliPath, 'cache', 'clear', tempDir, '--format', 'json'],
        { encoding: 'utf-8' }
      );
      expect(clearAgainJson.status).toBe(0);
      const parsed = JSON.parse(clearAgainJson.stdout.trim());
      expect(parsed.status).toBe('cache-cleared');
      expect(parsed.deletedCount).toBe(0);
    });
  });
});
