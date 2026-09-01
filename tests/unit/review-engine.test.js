import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { reviewRepository } from '../../src/review/review-engine.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';

describe('reviewRepository engine', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-reviewer-engine-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should review clean repository and return zero findings', async () => {
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'src', 'app.js'),
      'export function greet(name) { return `Hello, ${name}`; }'
    );

    const result = await reviewRepository({
      rootDirectory: tempDir,
      config: DEFAULT_CONFIG
    });

    expect(result.summary.discovered).toBe(1);
    expect(result.summary.parsed).toBe(1);
    expect(result.summary.analyzed).toBe(1);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.findings).toBe(0);
    expect(result.findings).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
  });

  it('should discover and aggregate findings from multiple files', async () => {
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'src', 'bad1.js'),
      'export function calc() { return undefinedVariable * 2; }'
    );
    await fs.writeFile(
      path.join(tempDir, 'src', 'bad2.js'),
      'export function compare(a, b) { return a == b; }'
    );

    const result = await reviewRepository({
      rootDirectory: tempDir,
      config: DEFAULT_CONFIG
    });

    expect(result.summary.discovered).toBe(2);
    expect(result.summary.analyzed).toBe(2);
    expect(result.summary.findings).toBeGreaterThanOrEqual(2);
    expect(result.findings.some((f) => f.ruleId === 'no-undef')).toBe(true);
    expect(result.findings.some((f) => f.ruleId === 'eqeqeq')).toBe(true);
  });

  it('should isolate failures without blocking valid files', async () => {
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'src', 'broken.js'),
      'const a = ;'
    );
    await fs.writeFile(
      path.join(tempDir, 'src', 'valid.js'),
      'export function run() { return true; }'
    );

    const result = await reviewRepository({
      rootDirectory: tempDir,
      config: DEFAULT_CONFIG
    });

    expect(result.summary.discovered).toBe(2);
    expect(result.summary.parsed).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].relativePath).toBe('src/broken.js');
    expect(result.failures[0].stage).toBe('parse');
  });

  it('should not modify any reviewed source files', async () => {
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    const originalContent = 'export function check(a, b) { return a == b; }\n';
    const filePath = path.join(tempDir, 'src', 'code.js');
    await fs.writeFile(filePath, originalContent, 'utf-8');

    await reviewRepository({
      rootDirectory: tempDir,
      config: DEFAULT_CONFIG
    });

    const afterContent = await fs.readFile(filePath, 'utf-8');
    expect(afterContent).toBe(originalContent);
  });
});
