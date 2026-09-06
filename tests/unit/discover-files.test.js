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
      await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
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

  it('should respect .gitignore and .acrignore files', async () => {
    await fs.mkdir(path.join(tempDir, 'src', 'generated'), { recursive: true });

    await fs.writeFile(path.join(tempDir, '.gitignore'), 'temp.js\n');
    await fs.writeFile(path.join(tempDir, '.acrignore'), 'src/generated/**\n');

    await fs.writeFile(path.join(tempDir, 'temp.js'), 'temp');
    await fs.writeFile(path.join(tempDir, 'src', 'generated', 'types.js'), 'types');
    await fs.writeFile(path.join(tempDir, 'src', 'main.js'), 'main');

    const result = await discoverFiles({ rootDirectory: tempDir });

    expect(result.files.map((f) => f.relativePath)).toEqual(['src/main.js']);
    expect(result.ignoreSources).toContain('.gitignore');
    expect(result.ignoreSources).toContain('.acrignore');
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

  it('should not follow symbolic files', async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-reviewer-ext-'));
    try {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

      await fs.writeFile(path.join(tempDir, 'src', 'app.js'), '// app');
      await fs.writeFile(path.join(outsideDir, 'ext.js'), '// ext');

      let symlinkCreated = false;
      try {
        await fs.symlink(
          path.resolve(outsideDir, 'ext.js'),
          path.join(tempDir, 'src', 'symlink.js'),
          'file'
        );
        symlinkCreated = true;
      } catch {
        // On Windows without Developer Mode, file symlinks require elevated permissions
      }

      if (symlinkCreated) {
        const result = await discoverFiles({ rootDirectory: tempDir });
        expect(result.files.map((f) => f.relativePath)).toEqual(['src/app.js']);
      }
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it('should not follow symbolic directories or directory junctions', async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-reviewer-ext-dir-'));
    try {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'src', 'app.js'), '// app');
      await fs.writeFile(path.join(outsideDir, 'ext.js'), '// ext');

      const linkType = process.platform === 'win32' ? 'junction' : 'dir';
      await fs.symlink(path.resolve(outsideDir), path.join(tempDir, 'linked-external'), linkType);

      const result = await discoverFiles({ rootDirectory: tempDir });
      expect(result.files.map((f) => f.relativePath)).toEqual(['src/app.js']);
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it('should not follow symbolic directories or files when specified in allowedRelativePaths', async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-reviewer-ext-allowed-'));
    try {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'src', 'app.js'), '// app');
      await fs.writeFile(path.join(outsideDir, 'ext.js'), '// ext');

      const linkType = process.platform === 'win32' ? 'junction' : 'dir';
      await fs.symlink(path.resolve(outsideDir), path.join(tempDir, 'linked-external'), linkType);

      const result = await discoverFiles({
        rootDirectory: tempDir,
        allowedRelativePaths: ['linked-external/ext.js', 'src/app.js']
      });

      expect(result.files.map((f) => f.relativePath)).toEqual(['src/app.js']);
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it('should handle broken symbolic links gracefully without failing', async () => {
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src', 'app.js'), '// app');

    const tempTarget = path.join(tempDir, 'temp-target');
    await fs.mkdir(tempTarget, { recursive: true });

    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    try {
      await fs.symlink(
        path.resolve(tempTarget),
        path.join(tempDir, 'broken-link'),
        linkType
      );
      await fs.rm(tempTarget, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Ignore creation error if not supported
    }

    const result = await discoverFiles({ rootDirectory: tempDir });
    expect(result.files.map((f) => f.relativePath)).toEqual(['src/app.js']);
  });

  it('should avoid infinite recursion on circular directory links', async () => {
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src', 'app.js'), '// app');

    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    try {
      await fs.symlink(
        path.resolve(tempDir, 'src'),
        path.join(tempDir, 'src', 'loop'),
        linkType
      );
    } catch {
      // Ignore if circular symlink creation is restricted
    }

    const result = await discoverFiles({ rootDirectory: tempDir });
    expect(result.files.map((f) => f.relativePath)).toEqual(['src/app.js']);
  });

  it('should reject Windows directory junctions pointing outside rootDirectory', async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-reviewer-junc-out-'));
    try {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'src', 'app.js'), '// app');
      await fs.writeFile(path.join(outsideDir, 'ext.js'), '// ext');

      const linkType = process.platform === 'win32' ? 'junction' : 'dir';
      await fs.symlink(path.resolve(outsideDir), path.join(tempDir, 'junction-dir'), linkType);

      const result = await discoverFiles({ rootDirectory: tempDir });
      expect(result.files.map((f) => f.relativePath)).toEqual(['src/app.js']);
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it('should throw when root directory is not found or not a directory', async () => {
    await expect(
      discoverFiles({ rootDirectory: path.join(tempDir, 'does-not-exist') })
    ).rejects.toThrow();
  });
});
