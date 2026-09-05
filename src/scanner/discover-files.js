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

  // 1. Validate root directory or single file
  const rootStat = await fs.stat(resolvedRoot);
  if (rootStat.isFile()) {
    return {
      rootDirectory: path.dirname(resolvedRoot),
      files: [
        {
          absolutePath: resolvedRoot,
          relativePath: path.basename(resolvedRoot),
          extension: path.extname(resolvedRoot),
          sizeBytes: rootStat.size
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

  if (!rootStat.isDirectory()) {
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

  const maxFileSizeKb = options.maxFileSizeKb !== undefined
    ? options.maxFileSizeKb
    : DEFAULT_CONFIG.maxFileSizeKb;

  const maxSizeBytes = maxFileSizeKb * 1024;

  // 2. Initialize ignore matcher
  const ignoreMatcher = await createIgnoreMatcher({
    rootDirectory: resolvedRoot,
    excludePatterns
  });

  // 3. Discover candidates using fast-glob
  const entries = await fg(includePatterns, {
    cwd: resolvedRoot,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    unique: true
  });

  const skipped = {
    ignored: 0,
    tooLarge: 0,
    limited: 0
  };

  const validCandidates = [];

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

    const absPath = path.join(resolvedRoot, relPath);

    try {
      const fileStat = await fs.lstat(absPath);

      // Exclude symlinks and non-regular files
      if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
        continue;
      }

      // Exclude files exceeding size limit
      if (fileStat.size > maxSizeBytes) {
        skipped.tooLarge++;
        continue;
      }

      validCandidates.push({
        absolutePath: absPath,
        relativePath: relPath,
        extension: path.extname(relPath),
        sizeBytes: fileStat.size
      });
    } catch {
      // If stat fails (e.g. broken link or deleted), skip
      continue;
    }
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
