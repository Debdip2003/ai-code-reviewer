import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  createIgnoreMatcher,
  normalizeRelativePath
} from '../../src/scanner/ignore-files.js';

describe('normalizeRelativePath', () => {
  it('should convert Windows backslashes to forward slashes', () => {
    expect(normalizeRelativePath('src\\components\\Button.jsx')).toBe('src/components/Button.jsx');
    expect(normalizeRelativePath('.\\src\\app.js')).toBe('src/app.js');
    expect(normalizeRelativePath('/src/index.js')).toBe('src/index.js');
  });
});

describe('createIgnoreMatcher', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-reviewer-ignore-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should work without error when no ignore files exist', async () => {
    const matcher = await createIgnoreMatcher({
      rootDirectory: tempDir,
      excludePatterns: ['node_modules/**']
    });

    expect(matcher.sources).toEqual([]);
    expect(matcher.ignores('node_modules/pkg/index.js')).toBe(true);
    expect(matcher.ignores('src/index.js')).toBe(false);
  });

  it('should respect configured exclude patterns', async () => {
    const matcher = await createIgnoreMatcher({
      rootDirectory: tempDir,
      excludePatterns: ['dist/**', 'coverage/**', '**/*.min.js']
    });

    expect(matcher.ignores('dist/bundle.js')).toBe(true);
    expect(matcher.ignores('coverage/lcov.info')).toBe(true);
    expect(matcher.ignores('src/vendor/app.min.js')).toBe(true);
    expect(matcher.ignores('src/components/App.jsx')).toBe(false);
  });

  it('should load and apply .gitignore rules', async () => {
    await fs.writeFile(
      path.join(tempDir, '.gitignore'),
      '# git ignore comment\nbuild/\n.env*\ntemp.js\n'
    );

    const matcher = await createIgnoreMatcher({
      rootDirectory: tempDir
    });

    expect(matcher.sources).toContain('.gitignore');
    expect(matcher.ignores('build/main.js')).toBe(true);
    expect(matcher.ignores('temp.js')).toBe(true);
    expect(matcher.ignores('src/main.js')).toBe(false);
  });

  it('should load and apply .acrignore rules', async () => {
    await fs.writeFile(
      path.join(tempDir, '.acrignore'),
      'legacy/**\ngenerated/*.js\n'
    );

    const matcher = await createIgnoreMatcher({
      rootDirectory: tempDir
    });

    expect(matcher.sources).toContain('.acrignore');
    expect(matcher.ignores('legacy/old.js')).toBe(true);
    expect(matcher.ignores('generated/api.js')).toBe(true);
    expect(matcher.ignores('src/api.js')).toBe(false);
  });

  it('should support .gitignore negation rules', async () => {
    await fs.writeFile(
      path.join(tempDir, '.gitignore'),
      'generated/**\n!generated/keep.js\n'
    );

    const matcher = await createIgnoreMatcher({
      rootDirectory: tempDir
    });

    expect(matcher.ignores('generated/skip.js')).toBe(true);
    expect(matcher.ignores('generated/keep.js')).toBe(false);
  });

  it('should normalize Windows backslashes when matching paths', async () => {
    await fs.writeFile(
      path.join(tempDir, '.gitignore'),
      'dist/**\n'
    );

    const matcher = await createIgnoreMatcher({
      rootDirectory: tempDir
    });

    expect(matcher.ignores('dist\\bundle.js')).toBe(true);
    expect(matcher.ignores('src\\index.js')).toBe(false);
  });

  it('should treat paths escaping root as ignored/rejected', async () => {
    const matcher = await createIgnoreMatcher({
      rootDirectory: tempDir
    });

    expect(matcher.ignores('../outside.js')).toBe(true);
    expect(matcher.ignores('..\\outside.js')).toBe(true);
  });
});
