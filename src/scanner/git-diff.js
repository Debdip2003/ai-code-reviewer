/**
 * Git diff and repository scope discovery module.
 * Executes read-only Git commands using child_process.execFile with argument arrays
 * to detect changed files and calculate changed line ranges safely and deterministically.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const GIT_ENV = Object.freeze({
  ...process.env,
  GIT_OPTIONAL_LOCKS: '0',
  LC_ALL: 'C',
  LANG: 'C',
  GIT_PAGER: 'cat',
  GIT_NO_PAGER: '1'
});

/**
 * Custom error class for Git operations with sanitized messages.
 */
export class GitDiffError extends Error {
  /**
   * @param {string} message - Sanitized error message.
   * @param {unknown} [cause] - Underlying error cause.
   */
  constructor(message, cause) {
    super(message);
    this.name = 'GitDiffError';
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Executes a read-only Git command safely with an array of arguments.
 *
 * @param {string[]} args - Git arguments array.
 * @param {string} cwd - Working directory for the Git process.
 * @param {AbortSignal} [signal] - Optional abort signal for cancellation.
 * @returns {Promise<{ stdout: string, stderr: string }>}
 * @throws {GitDiffError} If Git execution fails or is unavailable.
 */
async function runGit(args, cwd, signal) {
  if (signal?.aborted) {
    const abortErr = new Error('Git operation aborted.');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  try {
    return await execFileAsync('git', args, {
      cwd,
      env: GIT_ENV,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
      signal
    });
  } catch (err) {
    if (err && (err.name === 'AbortError' || signal?.aborted)) {
      throw err;
    }
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      throw new GitDiffError('Git executable was not found on the system PATH.', err);
    }
    const cleanStderr = typeof err.stderr === 'string' ? err.stderr.trim() : '';
    const cleanStdout = typeof err.stdout === 'string' ? err.stdout.trim() : '';
    const detail = cleanStderr || cleanStdout || err.message || 'Unknown Git error';
    throw new GitDiffError(`Git command "git ${args.join(' ')}" failed: ${detail}`, err);
  }
}

/**
 * Finds and validates the root directory of the enclosing Git repository.
 *
 * @param {string} rootDirectory - Path to start searching from.
 * @param {AbortSignal} [signal] - Optional abort signal.
 * @returns {Promise<string>} Normalized absolute path to the Git repository root.
 * @throws {GitDiffError} If directory is not inside a Git repository.
 */
export async function findGitRoot(rootDirectory = process.cwd(), signal) {
  const resolvedRoot = path.resolve(rootDirectory);

  try {
    const { stdout } = await runGit(['rev-parse', '--show-toplevel'], resolvedRoot, signal);
    const gitRoot = path.resolve(stdout.trim());

    // Verify rootDirectory is inside gitRoot
    const relative = path.relative(gitRoot, resolvedRoot);
    if (relative.startsWith('..') && !relative.startsWith(`..${path.sep}`)) {
      throw new GitDiffError(`Path "${resolvedRoot}" is outside discovered Git root "${gitRoot}".`);
    }

    return gitRoot;
  } catch (err) {
    if (err && (err.name === 'AbortError' || signal?.aborted)) {
      throw err;
    }
    if (err instanceof GitDiffError) {
      if (err.message.includes('not a git repository') || err.message.includes('fatal:')) {
        throw new GitDiffError(`"${resolvedRoot}" is not inside a Git repository.`, err);
      }
      throw err;
    }
    throw new GitDiffError(`"${resolvedRoot}" is not inside a Git repository.`, err);
  }
}

/**
 * Counts total lines in file content accounting for trailing newlines.
 * @param {string} content
 * @returns {number}
 */
function countSourceLines(content) {
  if (typeof content !== 'string' || content.length === 0) {
    return 1;
  }
  const lines = content.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    return Math.max(1, lines.length - 1);
  }
  return Math.max(1, lines.length);
}

/**
 * Checks if the repository HEAD ref is valid (i.e. has at least one commit).
 *
 * @param {string} gitRoot
 * @param {AbortSignal} [signal]
 * @returns {Promise<boolean>}
 */
async function hasHeadCommit(gitRoot, signal) {
  try {
    await runGit(['rev-parse', '--verify', 'HEAD'], gitRoot, signal);
    return true;
  } catch {
    return false;
  }
}

/**
 * Discovers changed files in the repository for either local working-tree or base-ref review.
 *
 * @param {Object} options
 * @param {string} [options.rootDirectory=process.cwd()] - Target directory being reviewed.
 * @param {string} [options.baseRef] - Base reference for comparative branch review.
 * @param {AbortSignal} [options.signal] - Optional abort signal.
 * @returns {Promise<{
 *   gitRoot: string,
 *   mode: 'working-tree' | 'base',
 *   baseRef: string | null,
 *   files: Array<{ relativePath: string, status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied', previousPath: string | null }>
 * }>}
 */
export async function getChangedFiles({ rootDirectory = process.cwd(), baseRef, signal } = {}) {
  const resolvedRoot = path.resolve(rootDirectory);
  const gitRoot = await findGitRoot(resolvedRoot, signal);

  const rawEntries = [];

  if (baseRef) {
    // 1. Validate base ref
    try {
      await runGit(['rev-parse', '--verify', `${baseRef}^{commit}`], gitRoot, signal);
    } catch (err) {
      if (err && (err.name === 'AbortError' || signal?.aborted)) throw err;
      throw new GitDiffError(`Invalid base reference "${baseRef}". Reference must point to a valid commit.`, err);
    }

    // 2. Find merge base
    let mergeBase;
    try {
      const { stdout } = await runGit(['merge-base', baseRef, 'HEAD'], gitRoot, signal);
      mergeBase = stdout.trim();
    } catch (err) {
      if (err && (err.name === 'AbortError' || signal?.aborted)) throw err;
      throw new GitDiffError(`Could not find a common merge base between "${baseRef}" and HEAD.`, err);
    }

    // 3. Diff merge base against HEAD
    const { stdout } = await runGit(['diff', '--name-status', '--no-renames', mergeBase, 'HEAD'], gitRoot, signal);
    if (stdout.trim().length > 0) {
      for (const line of stdout.trim().split('\n')) {
        const parts = line.trim().split(/\t+/);
        if (parts.length >= 2) {
          rawEntries.push({ statusChar: parts[0][0], filePath: parts[1], previousPath: parts[2] || null });
        }
      }
    }
  } else {
    // Local working-tree mode: staged + unstaged + untracked
    const hasHead = await hasHeadCommit(gitRoot);

    if (hasHead) {
      // Tracked staged + unstaged changes
      const { stdout: diffOutput } = await runGit(['diff', '--name-status', '--no-renames', 'HEAD'], gitRoot);
      if (diffOutput.trim().length > 0) {
        for (const line of diffOutput.trim().split('\n')) {
          const parts = line.trim().split(/\t+/);
          if (parts.length >= 2) {
            rawEntries.push({ statusChar: parts[0][0], filePath: parts[1], previousPath: parts[2] || null });
          }
        }
      }
    } else {
      // Unborn repo: read staged changes
      try {
        const { stdout: stagedOutput } = await runGit(['diff', '--name-status', '--no-renames', '--cached'], gitRoot);
        if (stagedOutput.trim().length > 0) {
          for (const line of stagedOutput.trim().split('\n')) {
            const parts = line.trim().split(/\t+/);
            if (parts.length >= 2) {
              rawEntries.push({ statusChar: parts[0][0], filePath: parts[1], previousPath: null });
            }
          }
        }
      } catch {
        // Ignore diff error on empty repo
      }
    }

    // Untracked files
    const { stdout: untrackedOutput } = await runGit(['ls-files', '--others', '--exclude-standard'], gitRoot);
    if (untrackedOutput.trim().length > 0) {
      for (const line of untrackedOutput.trim().split('\n')) {
        const cleanPath = line.trim();
        if (cleanPath.length > 0) {
          rawEntries.push({ statusChar: 'A', filePath: cleanPath, previousPath: null });
        }
      }
    }
  }

  // Normalize paths relative to the requested review root directory
  const seenPaths = new Set();
  const files = [];

  for (const entry of rawEntries) {
    const absPath = path.resolve(gitRoot, entry.filePath);

    // Filter out files outside the requested review root directory
    const relFromReviewRoot = path.relative(resolvedRoot, absPath);
    if (relFromReviewRoot.startsWith('..') || path.isAbsolute(relFromReviewRoot)) {
      continue;
    }

    const normalizedRelPath = relFromReviewRoot.replace(/\\/g, '/');
    if (seenPaths.has(normalizedRelPath)) {
      continue;
    }
    seenPaths.add(normalizedRelPath);

    let status = 'modified';
    switch (entry.statusChar.toUpperCase()) {
      case 'A':
        status = 'added';
        break;
      case 'D':
        status = 'deleted';
        break;
      case 'R':
        status = 'renamed';
        break;
      case 'C':
        status = 'copied';
        break;
      default:
        status = 'modified';
        break;
    }

    files.push({
      relativePath: normalizedRelPath,
      status,
      previousPath: entry.previousPath ? entry.previousPath.replace(/\\/g, '/') : null
    });
  }

  // Deterministic sorting by relative path
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return {
    gitRoot,
    mode: baseRef ? 'base' : 'working-tree',
    baseRef: baseRef || null,
    files
  };
}

/**
 * Calculates changed 1-based line ranges for a specific file using unified diff output.
 *
 * @param {Object} options
 * @param {string} [options.rootDirectory=process.cwd()] - Project root directory.
 * @param {string} options.relativePath - Relative file path to inspect.
 * @param {string} [options.baseRef] - Base reference if in base mode.
 * @param {'added' | 'modified' | 'deleted' | 'renamed' | 'copied'} [options.status] - Known file status.
 * @returns {Promise<Array<{ start: number, end: number }>>} Array of merged, sorted, 1-based line ranges.
 */
export async function getChangedLineRanges({
  rootDirectory = process.cwd(),
  relativePath,
  baseRef,
  status,
  signal
}) {
  if (signal?.aborted) {
    const abortErr = new Error('Git operation aborted.');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  if (!relativePath || typeof relativePath !== 'string') {
    throw new TypeError('relativePath is required');
  }

  const resolvedRoot = path.resolve(rootDirectory);
  const gitRoot = await findGitRoot(resolvedRoot, signal);
  const absoluteFilePath = path.resolve(resolvedRoot, relativePath);
  const gitRelativePath = path.relative(gitRoot, absoluteFilePath).replace(/\\/g, '/');

  // If file was deleted, no lines exist in the current working tree
  if (status === 'deleted') {
    return [];
  }

  // If newly added or untracked file, treat all lines in the file as changed
  if (status === 'added') {
    try {
      const content = await fs.readFile(absoluteFilePath, 'utf-8');
      const lineCount = countSourceLines(content);
      return [{ start: 1, end: lineCount }];
    } catch {
      return [{ start: 1, end: 1 }];
    }
  }

  // Run unified zero-context diff for modified files
  let diffOutput = '';
  try {
    if (baseRef) {
      const { stdout: mbOut } = await runGit(['merge-base', baseRef, 'HEAD'], gitRoot, signal);
      const mergeBase = mbOut.trim();
      const { stdout } = await runGit(
        ['diff', '--unified=0', '--no-color', mergeBase, 'HEAD', '--', gitRelativePath],
        gitRoot,
        signal
      );
      diffOutput = stdout;
    } else {
      const hasHead = await hasHeadCommit(gitRoot, signal);
      if (hasHead) {
        const { stdout } = await runGit(
          ['diff', '--unified=0', '--no-color', 'HEAD', '--', gitRelativePath],
          gitRoot,
          signal
        );
        diffOutput = stdout;
      } else {
        // Unborn repo fallback: all lines changed
        const content = await fs.readFile(absoluteFilePath, 'utf-8');
        const lineCount = countSourceLines(content);
        return [{ start: 1, end: lineCount }];
      }
    }
  } catch (err) {
    if (err && (err.name === 'AbortError' || signal?.aborted)) {
      throw err;
    }
    // If diff fails, fallback to entire file range if readable
    try {
      const content = await fs.readFile(absoluteFilePath, 'utf-8');
      const lineCount = countSourceLines(content);
      return [{ start: 1, end: lineCount }];
    } catch {
      return [];
    }
  }

  // Parse @@ -oldStart,oldCount +newStart,newCount @@ hunk headers
  const hunkRegex = /^@@\s+-(?:\d+)(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/gm;
  const rawRanges = [];

  let match;
  while ((match = hunkRegex.exec(diffOutput)) !== null) {
    const newStart = parseInt(match[1], 10);
    const newCount = match[2] !== undefined ? parseInt(match[2], 10) : 1;

    // Skip deletion-only hunks (+start,0)
    if (newCount === 0) {
      continue;
    }

    const start = Math.max(1, newStart);
    const end = Math.max(start, start + newCount - 1);
    rawRanges.push({ start, end });
  }

  if (rawRanges.length === 0) {
    return [];
  }

  // Sort and merge overlapping or adjacent ranges
  rawRanges.sort((a, b) => a.start - b.start);

  const merged = [rawRanges[0]];
  for (let i = 1; i < rawRanges.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = rawRanges[i];

    if (curr.start <= prev.end + 1) {
      prev.end = Math.max(prev.end, curr.end);
    } else {
      merged.push({ start: curr.start, end: curr.end });
    }
  }

  return merged;
}
