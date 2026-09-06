/**
 * File discovery scanner module.
 * Discovers eligible JavaScript and React source files based on inclusion glob patterns,
 * ignore rules, file size limits, and max file limits.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import { createIgnoreMatcher, normalizeRelativePath } from './ignore-files.js';

/**
 * Verifies that a relative path within rootDirectory contains no symbolic links,
 * junctions, or non-regular intermediate directories/files, and stays inside realRoot.
 *
 * @param {string} rootDirectory - Root directory path.
 * @param {string} relativePath - Relative path to inspect.
 * @param {string} realRoot - Resolved real path of the root directory.
 * @param {Map<string, boolean>} [dirSymlinkCache] - Cache of verified directory paths.
 * @returns {Promise<{ isRegularFile: boolean, sizeBytes: number } | null>}
 */
async function verifyRegularFileNoSymlinks(rootDirectory, relativePath, realRoot, dirSymlinkCache = new Map()) {
  const segments = relativePath.split(/[/\\]/);
  let currentPath = rootDirectory;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment || segment === '.') continue;
    if (segment === '..') return null;

    currentPath = path.join(currentPath, segment);
    const isLeaf = i === segments.length - 1;

    if (!isLeaf && dirSymlinkCache.has(currentPath)) {
      if (dirSymlinkCache.get(currentPath) === true) {
        return null;
      }
      continue;
    }

    try {
      const stat = await fs.lstat(currentPath);
      if (stat.isSymbolicLink()) {
        if (!isLeaf) dirSymlinkCache.set(currentPath, true);
        return null;
      }

      if (!isLeaf) {
        if (!stat.isDirectory()) {
          dirSymlinkCache.set(currentPath, true);
          return null;
        }
        dirSymlinkCache.set(currentPath, false);
      } else {
        if (!stat.isFile()) {
          return null;
        }

        // Verify the real path does not escape realRoot
        const realCandidate = await fs.realpath(currentPath);
        const relFromRealRoot = path.relative(realRoot, realCandidate);
        const isOutside =
          relFromRealRoot === '..' ||
          relFromRealRoot.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relFromRealRoot);

        if (isOutside) {
          return null;
        }

        return { isRegularFile: true, sizeBytes: stat.size };
      }
    } catch (err) {
      if (!isLeaf) dirSymlinkCache.set(currentPath, true);
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  return null;
}

/**
 * Discovers source files eligible for code review within a given root directory.
 *
 * @param {Object} [options={}]
 * @param {string} [options.rootDirectory=process.cwd()] - Root directory path to scan.
 * @param {string[]} [options.includePatterns] - Inclusion glob patterns.
 * @param {string[]} [options.excludePatterns] - Exclusion glob patterns.
 * @param {number} [options.maxFiles] - Maximum number of files to return.
 * @param {number} [options.maxFileSizeKb] - Maximum size limit per file in kilobytes.
 * @returns {Promise<{
 *   rootDirectory: string,
 *   files: Array<{ absolutePath: string, relativePath: string, extension: string, sizeBytes: number }>,
 *   skipped: { ignored: number, tooLarge: number, limited: number },
 *   ignoreSources: string[]
 * }>}
 */
export async function discoverFiles(options = {}) {
  const rootDirectory = options.rootDirectory || process.cwd();
  const resolvedRoot = path.resolve(rootDirectory);

  const maxFileSizeKb = options.maxFileSizeKb !== undefined
    ? options.maxFileSizeKb
    : DEFAULT_CONFIG.maxFileSizeKb;

  const maxSizeBytes = maxFileSizeKb * 1024;

  // 1. Validate root directory or single file
  let rootLstat;
  try {
    rootLstat = await fs.lstat(resolvedRoot);
  } catch (err) {
    throw new Error(`The specified path is not a directory or file: "${resolvedRoot}"`, { cause: err });
  }

  if (rootLstat.isSymbolicLink()) {
    let isDir = false;
    try {
      const stat = await fs.stat(resolvedRoot);
      isDir = stat.isDirectory();
    } catch {
      isDir = false;
    }

    if (!isDir) {
      return {
        rootDirectory: path.dirname(resolvedRoot),
        files: [],
        skipped: { ignored: 0, tooLarge: 0, limited: 0 },
        ignoreSources: []
      };
    }
  }

  if (rootLstat.isFile()) {
    if (rootLstat.size > maxSizeBytes) {
      return {
        rootDirectory: path.dirname(resolvedRoot),
        files: [],
        skipped: { ignored: 0, tooLarge: 1, limited: 0 },
        ignoreSources: []
      };
    }
    return {
      rootDirectory: path.dirname(resolvedRoot),
      files: [
        {
          absolutePath: resolvedRoot,
          relativePath: path.basename(resolvedRoot),
          extension: path.extname(resolvedRoot),
          sizeBytes: rootLstat.size
        }
      ],
      skipped: {
        ignored: 0,
        tooLarge: 0,
        limited: 0
      },
      ignoreSources: []
    };
  }

  let isDirectory = rootLstat.isDirectory();
  let realRoot;
  try {
    realRoot = await fs.realpath(resolvedRoot);
  } catch (err) {
    throw new Error(`The specified path is not a directory or file: "${resolvedRoot}"`, { cause: err });
  }

  if (!isDirectory) {
    try {
      const rootStat = await fs.stat(resolvedRoot);
      isDirectory = rootStat.isDirectory();
    } catch {
      isDirectory = false;
    }
  }

  if (!isDirectory) {
    throw new Error(`The specified path is not a directory or file: "${resolvedRoot}"`);
  }

  const includePatterns = options.includePatterns && options.includePatterns.length > 0
    ? options.includePatterns
    : DEFAULT_CONFIG.include;

  const excludePatterns = options.excludePatterns !== undefined
    ? options.excludePatterns
    : DEFAULT_CONFIG.exclude;

  const maxFiles = options.maxFiles !== undefined
    ? options.maxFiles
    : DEFAULT_CONFIG.maxFiles;

  // 2. Initialize ignore matcher
  const ignoreMatcher = await createIgnoreMatcher({
    rootDirectory: resolvedRoot,
    excludePatterns
  });

  const allowedSet = options.allowedRelativePaths
    ? new Set(
        (Array.isArray(options.allowedRelativePaths)
          ? options.allowedRelativePaths
          : Array.from(options.allowedRelativePaths)
        ).map((p) => normalizeRelativePath(p))
      )
    : null;

  // 3. Discover candidates using fast-glob (or allowed set)
  let entries = [];
  if (allowedSet) {
    entries = Array.from(allowedSet);
  } else {
    entries = await fg(includePatterns, {
      cwd: resolvedRoot,
      dot: true,
      onlyFiles: true,
      followSymbolicLinks: false,
      unique: true
    });
  }

  const skipped = {
    ignored: 0,
    tooLarge: 0,
    limited: 0
  };

  const validCandidates = [];
  const dirSymlinkCache = new Map();

  for (const entry of entries) {
    const relPath = normalizeRelativePath(entry);

    // Skip paths escaping root directory
    if (relPath.startsWith('../') || relPath === '..') {
      continue;
    }

    // Apply ignore matcher rules
    if (ignoreMatcher.ignores(relPath)) {
      skipped.ignored++;
      continue;
    }

    const verified = await verifyRegularFileNoSymlinks(resolvedRoot, relPath, realRoot, dirSymlinkCache);
    if (!verified || !verified.isRegularFile) {
      continue;
    }

    // Exclude files exceeding size limit
    if (verified.sizeBytes > maxSizeBytes) {
      skipped.tooLarge++;
      continue;
    }

    const absPath = path.join(resolvedRoot, relPath);

    validCandidates.push({
      absolutePath: absPath,
      relativePath: relPath,
      extension: path.extname(relPath),
      sizeBytes: verified.sizeBytes
    });
  }

  // 4. Sort deterministically by relative path
  validCandidates.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  // 5. Apply maxFiles limit
  let files = validCandidates;
  if (validCandidates.length > maxFiles) {
    skipped.limited = validCandidates.length - maxFiles;
    files = validCandidates.slice(0, maxFiles);
  }

  return {
    rootDirectory: resolvedRoot,
    files,
    skipped,
    ignoreSources: ignoreMatcher.sources
  };
}
