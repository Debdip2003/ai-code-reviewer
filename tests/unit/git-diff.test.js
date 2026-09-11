import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {
  findGitRoot,
  getChangedFiles,
  getChangedLineRanges,
  GitDiffError
} from '../../src/scanner/git-diff.js';

describe('Git Diff Discovery', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-diff-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // Ignore Windows temporary locks on temp folder
      }
    }
  });

  function initGitRepo(dir) {
    execFileSync('git', ['init'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  }

  describe('findGitRoot', () => {
    it('should throw GitDiffError when directory is not inside a git repository', async () => {
      await expect(findGitRoot(tempDir)).rejects.toThrow(GitDiffError);
      await expect(findGitRoot(tempDir)).rejects.toThrow(/not inside a Git repository/i);
    });

    it('should return normalized git root path for a valid git repository', async () => {
      initGitRepo(tempDir);
      const subDir = path.join(tempDir, 'nested', 'sub');
      await fs.mkdir(subDir, { recursive: true });

      const detected = await findGitRoot(subDir);
      // Compare real paths to handle macOS/Windows symlink casing
      expect(path.resolve(detected)).toBe(path.resolve(tempDir));
    });
  });

  describe('getChangedFiles', () => {
    it('should detect untracked and modified files in working-tree mode', async () => {
      initGitRepo(tempDir);

      // Create initial commit
      await fs.writeFile(path.join(tempDir, 'tracked.js'), 'console.log("v1");\n');
      execFileSync('git', ['add', 'tracked.js'], { cwd: dir => tempDir, cwd: tempDir });
      execFileSync('git', ['commit', '-m', 'initial commit'], { cwd: tempDir });

      // Modify tracked file and create untracked file
      await fs.writeFile(path.join(tempDir, 'tracked.js'), 'console.log("v2");\n');
      await fs.writeFile(path.join(tempDir, 'untracked.js'), 'console.log("new");\n');

      const result = await getChangedFiles({ rootDirectory: tempDir });

      expect(result.mode).toBe('working-tree');
      expect(result.files).toHaveLength(2);
      expect(result.files.map((f) => f.relativePath).sort()).toEqual(['tracked.js', 'untracked.js']);
    });

    it('should detect staged and deleted files in working-tree mode', async () => {
      initGitRepo(tempDir);

      await fs.writeFile(path.join(tempDir, 'file1.js'), 'const a = 1;\n');
      await fs.writeFile(path.join(tempDir, 'file2.js'), 'const b = 2;\n');
      execFileSync('git', ['add', '.'], { cwd: tempDir });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: tempDir });

      // Delete file1, stage file2 modification
      await fs.rm(path.join(tempDir, 'file1.js'));
      await fs.writeFile(path.join(tempDir, 'file2.js'), 'const b = 20;\n');
      execFileSync('git', ['add', 'file2.js'], { cwd: tempDir });

      const result = await getChangedFiles({ rootDirectory: tempDir });

      const file1 = result.files.find((f) => f.relativePath === 'file1.js');
      const file2 = result.files.find((f) => f.relativePath === 'file2.js');

      expect(file1?.status).toBe('deleted');
      expect(file2?.status).toBe('modified');
    });

    it('should throw GitDiffError when invalid baseRef is supplied', async () => {
      initGitRepo(tempDir);
      await fs.writeFile(path.join(tempDir, 'file.js'), 'const a = 1;\n');
      execFileSync('git', ['add', '.'], { cwd: tempDir });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: tempDir });

      await expect(
        getChangedFiles({ rootDirectory: tempDir, baseRef: 'non-existent-branch' })
      ).rejects.toThrow(GitDiffError);
    });

    it('should detect changes relative to a valid base reference commit', async () => {
      initGitRepo(tempDir);
      await fs.writeFile(path.join(tempDir, 'main.js'), 'const initial = 1;\n');
      execFileSync('git', ['add', '.'], { cwd: tempDir });
      execFileSync('git', ['commit', '-m', 'commit-1'], { cwd: tempDir });

      // Get initial commit hash
      const baseCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: tempDir,
        encoding: 'utf-8'
      }).trim();

      // Create branch changes
      await fs.writeFile(path.join(tempDir, 'feature.js'), 'export const f = 1;\n');
      execFileSync('git', ['add', '.'], { cwd: tempDir });
      execFileSync('git', ['commit', '-m', 'commit-2'], { cwd: tempDir });

      const result = await getChangedFiles({ rootDirectory: tempDir, baseRef: baseCommit });

      expect(result.mode).toBe('base');
      expect(result.baseRef).toBe(baseCommit);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].relativePath).toBe('feature.js');
    });
  });

  describe('getChangedLineRanges', () => {
    it('should return all lines for newly added file', async () => {
      initGitRepo(tempDir);
      const filePath = path.join(tempDir, 'new.js');
      await fs.writeFile(filePath, 'line 1\nline 2\nline 3\n');

      const ranges = await getChangedLineRanges({
        rootDirectory: tempDir,
        relativePath: 'new.js',
        status: 'added'
      });

      expect(ranges).toEqual([{ start: 1, end: 3 }]);
    });

    it('should return empty array for deleted file', async () => {
      initGitRepo(tempDir);
      const ranges = await getChangedLineRanges({
        rootDirectory: tempDir,
        relativePath: 'deleted.js',
        status: 'deleted'
      });

      expect(ranges).toEqual([]);
    });

    it('should calculate changed line ranges accurately from git diff hunk headers', async () => {
      initGitRepo(tempDir);

      const contentV1 = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
      await fs.writeFile(path.join(tempDir, 'target.js'), contentV1);
      execFileSync('git', ['add', '.'], { cwd: tempDir });
      execFileSync('git', ['commit', '-m', 'initial'], { cwd: tempDir });

      // Modify lines 5 and 15..17
      const lines = contentV1.split('\n');
      lines[4] = 'modified line 5';
      lines[14] = 'modified line 15';
      lines[15] = 'modified line 16';
      lines[16] = 'modified line 17';
      await fs.writeFile(path.join(tempDir, 'target.js'), lines.join('\n'));

      const ranges = await getChangedLineRanges({
        rootDirectory: tempDir,
        relativePath: 'target.js',
        status: 'modified'
      });

      expect(ranges).toEqual([
        { start: 5, end: 5 },
        { start: 15, end: 17 }
      ]);
    });

    it('should merge contiguous and overlapping line ranges', async () => {
      initGitRepo(tempDir);

      const contentV1 = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
      await fs.writeFile(path.join(tempDir, 'contiguous.js'), contentV1);
      execFileSync('git', ['add', '.'], { cwd: tempDir });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: tempDir });

      // Modify lines 3 and 4 (adjacent lines)
      const lines = contentV1.split('\n');
      lines[2] = 'changed line 3';
      lines[3] = 'changed line 4';
      await fs.writeFile(path.join(tempDir, 'contiguous.js'), lines.join('\n'));

      const ranges = await getChangedLineRanges({
        rootDirectory: tempDir,
        relativePath: 'contiguous.js',
        status: 'modified'
      });

      expect(ranges).toEqual([{ start: 3, end: 4 }]);
    });
  });
});
