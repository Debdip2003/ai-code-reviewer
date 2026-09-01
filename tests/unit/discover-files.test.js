import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { discoverFiles } from '../../src/scanner/discover-files.js';

describe('discoverFiles', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-reviewer-discover-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should discover all supported JavaScript and React file extensions', async () => {
    await fs.mkdir(path.join(tempDir, 'src', 'components'), { recursive: true });

    await fs.writeFile(path.join(tempDir, 'src', 'index.js'), 'console.log("index");');
    await fs.writeFile(path.join(tempDir, 'src', 'module.mjs'), 'export default 42;');
    await fs.writeFile(path.join(tempDir, 'src', 'common.cjs'), 'module.exports = {};');
    await fs.writeFile(path.join(tempDir, 'src', 'components', 'Button.jsx'), 'export const Button = () => null;');

    // Non-supported files that should not be discovered
    await fs.writeFile(path.join(tempDir, 'package.json'), '{}');
    await fs.writeFile(path.join(tempDir, 'README.md'), '# Readme');
    await fs.writeFile(path.join(tempDir, 'styles.css'), 'body {}');

    const result = await discoverFiles({ rootDirectory: tempDir });

    const relativePaths = result.files.map((f) => f.relativePath);
    expect(relativePaths).toEqual([
      'src/common.cjs',
      'src/components/Button.jsx',
      'src/index.js',
      'src/module.mjs'
    ]);

    expect(result.skipped.ignored).toBe(0);
    expect(result.skipped.tooLarge).toBe(0);
    expect(result.skipped.limited).toBe(0);
  });

  it('should exclude files in default excluded directories', async () => {
    await fs.mkdir(path.join(tempDir, 'node_modules', 'pkg'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'dist'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    await fs.writeFile(path.join(tempDir, 'node_modules', 'pkg', 'index.js'), 'export const a = 1;');
    await fs.writeFile(path.join(tempDir, 'dist', 'bundle.js'), 'var bundle = 1;');
    await fs.writeFile(path.join(tempDir, 'src', 'app.js'), 'console.log("app");');
    await fs.writeFile(path.join(tempDir, 'src', 'app.min.js'), 'console.log("min");');

    const result = await discoverFiles({ rootDirectory: tempDir });

    const relativePaths = result.files.map((f) => f.relativePath);
    expect(relativePaths).toEqual(['src/app.js']);
    expect(result.skipped.ignored).toBeGreaterThanOrEqual(3);
  });

  it('should respect .gitignore and .aireviewerignore files', async () => {
    await fs.mkdir(path.join(tempDir, 'src', 'generated'), { recursive: true });

    await fs.writeFile(path.join(tempDir, '.gitignore'), 'temp.js\n');
    await fs.writeFile(path.join(tempDir, '.aireviewerignore'), 'src/generated/**\n');

    await fs.writeFile(path.join(tempDir, 'temp.js'), 'temp');
    await fs.writeFile(path.join(tempDir, 'src', 'generated', 'types.js'), 'types');
    await fs.writeFile(path.join(tempDir, 'src', 'main.js'), 'main');

    const result = await discoverFiles({ rootDirectory: tempDir });

    expect(result.files.map((f) => f.relativePath)).toEqual(['src/main.js']);
    expect(result.ignoreSources).toContain('.gitignore');
    expect(result.ignoreSources).toContain('.aireviewerignore');
  });

  it('should skip files exceeding maxFileSizeKb and track in skipped.tooLarge', async () => {
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    // Small file: 100 bytes
    await fs.writeFile(path.join(tempDir, 'src', 'small.js'), 'a'.repeat(100));
    // Large file: 2048 bytes (> 1 KB)
    await fs.writeFile(path.join(tempDir, 'src', 'large.js'), 'b'.repeat(2048));

    const result = await discoverFiles({
      rootDirectory: tempDir,
      maxFileSizeKb: 1 // 1 KB max
    });

    expect(result.files.map((f) => f.relativePath)).toEqual(['src/small.js']);
    expect(result.skipped.tooLarge).toBe(1);
  });

  it('should enforce maxFiles and track remainder in skipped.limited', async () => {
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    for (let i = 1; i <= 5; i++) {
      await fs.writeFile(path.join(tempDir, 'src', `file${i}.js`), `// file ${i}`);
    }

    const result = await discoverFiles({
      rootDirectory: tempDir,
      maxFiles: 3
    });

    expect(result.files).toHaveLength(3);
    expect(result.files.map((f) => f.relativePath)).toEqual([
      'src/file1.js',
      'src/file2.js',
      'src/file3.js'
    ]);
    expect(result.skipped.limited).toBe(2);
  });

  it('should deterministically sort files by relative path with forward slashes', async () => {
    await fs.mkdir(path.join(tempDir, 'src', 'b'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'src', 'a'), { recursive: true });

    await fs.writeFile(path.join(tempDir, 'src', 'b', 'index.js'), '// b');
    await fs.writeFile(path.join(tempDir, 'src', 'a', 'index.js'), '// a');
    await fs.writeFile(path.join(tempDir, 'src', 'z.js'), '// z');

    const result = await discoverFiles({ rootDirectory: tempDir });

    expect(result.files.map((f) => f.relativePath)).toEqual([
      'src/a/index.js',
      'src/b/index.js',
      'src/z.js'
    ]);

    // Ensure all relative paths use forward slashes
    for (const file of result.files) {
      expect(file.relativePath).not.toContain('\\');
    }
  });

  it('should not follow symbolic links', async () => {
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'external'), { recursive: true });

    await fs.writeFile(path.join(tempDir, 'src', 'app.js'), '// app');
    await fs.writeFile(path.join(tempDir, 'external', 'ext.js'), '// ext');

    try {
      await fs.symlink(
        path.join(tempDir, 'external', 'ext.js'),
        path.join(tempDir, 'src', 'symlink.js')
      );
    } catch {
      // On some Windows environments symlinks require admin rights; skip symlink assertion if creation fails
      return;
    }

    const result = await discoverFiles({ rootDirectory: tempDir });
    expect(result.files.map((f) => f.relativePath)).toEqual(['src/app.js']);
  });

  it('should throw when root directory is not found or not a directory', async () => {
    await expect(
      discoverFiles({ rootDirectory: path.join(tempDir, 'does-not-exist') })
    ).rejects.toThrow();
  });
});
