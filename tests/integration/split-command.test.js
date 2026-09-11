import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../../bin/cli.js');
const fixturesDir = path.resolve(__dirname, '../fixtures/splitter');

/**
 * Calculates SHA-256 hash of a file.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function computeFileHash(filePath) {
  const content = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

describe('Split Command Integration Tests', { timeout: 30000 }, () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = path.join(fixturesDir, `.tmp-split-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (tempDir && fsSync.existsSync(tempDir)) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should display correct help text for acr split', () => {
    const result = spawnSync(process.execPath, [cliPath, 'split', '--help'], {
      encoding: 'utf-8'
    });

    expect(result.status).toBe(0);
    expect(result.stdout.replace(/\r?\n\s*/g, ' ')).toContain(
      'Analyze a JavaScript or React file and propose a safe split plan without modifying source code.'
    );
    expect(result.stdout).toContain('--format');
    expect(result.stdout).toContain('--target-dir');
    expect(result.stdout).toContain('--min-lines');
    expect(result.stdout).toContain('--ai');
  });

  it('should reject unknown --apply option with non-zero exit code', () => {
    const fixturePath = path.join(fixturesDir, 'large-react-component.jsx');
    const result = spawnSync(process.execPath, [cliPath, 'split', fixturePath, '--apply'], {
      encoding: 'utf-8'
    });

    expect(result.status).not.toBe(0);
  });

  it('should propose split plan for a large React component without mutating source or creating files', async () => {
    const fixturePath = path.join(fixturesDir, 'large-react-component.jsx');
    const hashBefore = await computeFileHash(fixturePath);

    const result = spawnSync(process.execPath, [cliPath, 'split', fixturePath], {
      encoding: 'utf-8'
    });

    const hashAfter = await computeFileHash(fixturePath);
    expect(hashBefore).toBe(hashAfter);

    expect([0, 1]).toContain(result.status);
    expect(result.stdout).toContain('ACR Split Planner');
    expect(result.stdout).toContain('Safe extraction candidates');
    expect(result.stdout).toContain('ProductCard');
    expect(result.stdout).toContain('useProducts');
    expect(result.stdout).toContain('fetchProducts');
    expect(result.stdout).toContain('formatPrice');
    expect(result.stdout).toContain('PRODUCT_STATUS_LABELS');
    expect(result.stdout).toContain('Dry run only. No source files were modified.');

    // Verify proposed directory was not created on disk
    const proposedDir = path.join(fixturesDir, 'large-react-component');
    expect(fsSync.existsSync(proposedDir)).toBe(false);
  });

  it('should emit valid machine-readable JSON when --format json is provided', async () => {
    const fixturePath = path.join(fixturesDir, 'large-react-component.jsx');
    const result = spawnSync(process.execPath, [cliPath, 'split', fixturePath, '--format', 'json'], {
      encoding: 'utf-8'
    });

    expect([0, 1]).toContain(result.status);
    expect(result.stdout).not.toContain('\x1b');

    let parsed;
    expect(() => {
      parsed = JSON.parse(result.stdout);
    }).not.toThrow();

    expect(parsed.version).toBe(1);
    expect(parsed.mode).toBe('dry-run');
    expect(parsed.filesModified).toBe(0);
    expect(parsed.sourceSummary.lines).toBeGreaterThan(50);
    expect(Array.isArray(parsed.candidates)).toBe(true);
    expect(parsed.summary.detected).toBe(parsed.candidates.length);
  });

  it('should analyze JavaScript modules and detect services, utilities, and constants with exit code 0', () => {
    const fixturePath = path.join(fixturesDir, 'javascript-module.js');
    const result = spawnSync(process.execPath, [cliPath, 'split', fixturePath], {
      encoding: 'utf-8'
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('HTTP_STATUS_CODES');
    expect(result.stdout).toContain('fetchUserData');
    expect(result.stdout).toContain('sanitizeQueryParam');
    expect(result.stdout).toContain('Candidates detected:');
  });

  it('should return exit code 0 on clean component with zero candidates', () => {
    const fixturePath = path.join(fixturesDir, 'clean-small-component.jsx');
    const result = spawnSync(process.execPath, [cliPath, 'split', fixturePath], {
      encoding: 'utf-8'
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Candidates detected: 0');
  });

  it('should return exit code 1 when candidates requiring manual review are detected', () => {
    const fixturePath = path.join(fixturesDir, 'unsafe-closures.jsx');
    const result = spawnSync(process.execPath, [cliPath, 'split', fixturePath], {
      encoding: 'utf-8'
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Candidates requiring manual review');
    expect(result.stdout).toContain('handleCheckout');
    expect(result.stdout).toContain('Risks:');
    expect(result.stdout).toContain('Captures');
  });

  it('should fail with exit code 2 when file does not exist', () => {
    const result = spawnSync(process.execPath, [cliPath, 'split', 'non-existent-file.jsx'], {
      encoding: 'utf-8'
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('File not found');
  });

  it('should fail with exit code 2 when target is a directory', () => {
    const result = spawnSync(process.execPath, [cliPath, 'split', fixturesDir], {
      encoding: 'utf-8'
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Expected a file but found directory');
  });

  it('should fail with exit code 2 when file extension is unsupported', async () => {
    const unsupportedFile = path.join(tempDir, 'component.vue');
    await fs.writeFile(unsupportedFile, '<template><div>Vue</div></template>');

    const result = spawnSync(process.execPath, [cliPath, 'split', unsupportedFile], {
      encoding: 'utf-8'
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unsupported file extension');
  });

  it('should fail with exit code 2 when file has syntax parse errors', async () => {
    const badSyntaxFile = path.join(tempDir, 'bad.js');
    await fs.writeFile(badSyntaxFile, 'function broken( { return ;');

    const result = spawnSync(process.execPath, [cliPath, 'split', badSyntaxFile], {
      encoding: 'utf-8'
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unable to parse');
  });

  it('should fail with exit code 2 when --ai is requested without API key', async () => {
    // In an isolated subfolder without .env file
    const cleanComp = path.join(tempDir, 'sample.jsx');
    await fs.writeFile(cleanComp, 'export function Sample() { return <div>Sample</div>; }');

    const result = spawnSync(process.execPath, [cliPath, 'split', cleanComp, '--ai'], {
      encoding: 'utf-8',
      cwd: tempDir,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot
      }
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('API key is missing');
  });
});
