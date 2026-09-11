import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve('bin/cli.js');
const FIXTURES_DIR = path.resolve('tests/fixtures/splitter');

/**
 * Computes a recursive sha256 hash of all files in a directory to verify no mutations.
 */
async function computeDirectoryHash(dirPath) {
  const hashes = [];
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const content = await fs.readFile(fullPath);
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        const relPath = path.relative(dirPath, fullPath).replace(/\\/g, '/');
        hashes.push(`${relPath}:${hash}`);
      }
    }
  }
  await walk(dirPath);
  hashes.sort();
  return crypto.createHash('sha256').update(hashes.join('\n')).digest('hex');
}

describe('Split Preview Command Integration Tests', { timeout: 30000 }, () => {
  let baselineHash;

  beforeAll(async () => {
    baselineHash = await computeDirectoryHash(FIXTURES_DIR);
  });

  afterAll(async () => {
    const afterHash = await computeDirectoryHash(FIXTURES_DIR);
    expect(afterHash).toBe(baselineHash);
  });

  it('should list candidates with stable IDs when --candidate is omitted', async () => {
    const fixture = 'tests/fixtures/splitter/react-nested-component/input.jsx';
    const result = await execFileAsync(process.execPath, [CLI_PATH, 'split', fixture]).catch(
      (err) => err
    );

    expect(result.code ?? 0).toBe(1); // Contains manual review candidate (nested component)
    expect(result.stdout).toContain('Split candidates found:');
    expect(result.stdout).toContain('user-card');
    expect(result.stdout).toContain('Symbol: UserCard');
    expect(result.stdout).toContain('Type: React component');
    expect(result.stdout).toContain('No files were modified.');
  });

  it('should generate transformation plan summary when --candidate is supplied', async () => {
    const fixture = 'tests/fixtures/splitter/react-nested-component/input.jsx';
    const { stdout } = await execFileAsync(process.execPath, [
      CLI_PATH,
      'split',
      fixture,
      '--candidate',
      'user-card'
    ]).catch((err) => err);

    expect(stdout).toContain('ACR split preview');
    expect(stdout).toContain('Candidate: UserCard');
    expect(stdout).toContain('Planned boundary:');
    expect(stdout).toContain('onDelete <- handleDelete');
    expect(stdout).toContain('Validation:');
    expect(stdout).toContain('Proposed source parses');
    expect(stdout).toContain('Proposed target parses');
    expect(stdout).toContain('No files were modified.');
  });

  it('should include source and target file contents when --preview is passed', async () => {
    const fixture = 'tests/fixtures/splitter/react-nested-component/input.jsx';
    const { stdout } = await execFileAsync(process.execPath, [
      CLI_PATH,
      'split',
      fixture,
      '--candidate',
      'user-card',
      '--preview'
    ]).catch((err) => err);

    expect(stdout).toContain('CREATE tests/fixtures/splitter/react-nested-component/input/UserCard.jsx');
    expect(stdout).toContain('export function UserCard');
    expect(stdout).toContain('selectedUser');
    expect(stdout).toContain('onDelete');
    expect(stdout).toContain('UPDATE tests/fixtures/splitter/react-nested-component/input.jsx');
    expect(stdout).toContain('<UserCard');
    expect(stdout).toContain('selectedUser={selectedUser}');
    expect(stdout).toContain('onDelete={handleDelete}');
    expect(stdout).toContain('No files were modified.');
  });

  it('should output structured machine-readable JSON when --format json is provided', async () => {
    const fixture = 'tests/fixtures/splitter/react-nested-component/input.jsx';
    const { stdout } = await execFileAsync(process.execPath, [
      CLI_PATH,
      'split',
      fixture,
      '--candidate',
      'user-card',
      '--format',
      'json'
    ]).catch((err) => err);

    const parsed = JSON.parse(stdout);
    expect(parsed.version).toBe(2);
    expect(parsed.mode).toBe('preview');
    expect(parsed.candidate.id).toBe('user-card');
    expect(parsed.filesModified).toBe(0);
    expect(parsed.contract).toBeDefined();
  });

  it('should support custom target path override via --target', async () => {
    const fixture = 'tests/fixtures/splitter/react-nested-component/input.jsx';
    const targetOverride = 'tests/fixtures/splitter/custom/UserCard.jsx';
    const { stdout } = await execFileAsync(process.execPath, [
      CLI_PATH,
      'split',
      fixture,
      '--candidate',
      'user-card',
      '--target',
      targetOverride,
      '--format',
      'json'
    ]).catch((err) => err);

    const parsed = JSON.parse(stdout);
    expect(parsed.targetFile).toBe(targetOverride);
  });

  it('should fail with exit code 2 and list valid IDs when candidate ID is invalid', async () => {
    const fixture = 'tests/fixtures/splitter/react-nested-component/input.jsx';
    const result = await execFileAsync(process.execPath, [
      CLI_PATH,
      'split',
      fixture,
      '--candidate',
      'invalid-candidate-id'
    ]).catch((err) => err);

    expect(result.code).toBe(2);
    expect(result.stdout || result.stderr).toContain('invalid-candidate-id');
    expect(result.stdout || result.stderr).toContain('user-card');
  });

  it('should guarantee zero files are created or modified on disk', async () => {
    const currentHash = await computeDirectoryHash(FIXTURES_DIR);
    expect(currentHash).toBe(baselineHash);
  });
});
