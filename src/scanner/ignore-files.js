/**
 * Ignore rules parser and matcher module.
 * Responsible for loading `.gitignore`, `.aireviewerignore`, and default/configured exclude patterns
 * to determine whether specific files should be excluded from scanning.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import ignore from 'ignore';
import { IGNORE_FILE_NAME } from '../config/defaults.js';

const GITIGNORE_FILE_NAME = '.gitignore';

/**
 * Normalizes a file path to forward slashes and removes leading relative indicators.
 * @param {string} filePath - Path to normalize.
 * @returns {string} Normalized relative path.
 */
export function normalizeRelativePath(filePath) {
  let normalized = filePath.replace(/\\/g, '/');
  normalized = normalized.replace(/^(\.\/|\/)+/, '');
  return normalized;
}

/**
 * Creates an ignore matcher by combining configured exclude patterns,
 * `.gitignore` rules, and `.aireviewerignore` rules from the root directory.
 *
 * @param {Object} options
 * @param {string} options.rootDirectory - Root directory containing ignore files.
 * @param {string[]} [options.excludePatterns=[]] - Configured exclude glob patterns.
 * @returns {Promise<{ ignores: (relativePath: string) => boolean, sources: string[] }>}
 */
export async function createIgnoreMatcher({ rootDirectory, excludePatterns = [] }) {
  const resolvedRoot = path.resolve(rootDirectory);
  const ig = ignore();
  const sources = [];

  // 1. Add configured exclude patterns
  if (Array.isArray(excludePatterns) && excludePatterns.length > 0) {
    ig.add(excludePatterns);
  }

  // 2. Load root .gitignore if present
  const gitignorePath = path.join(resolvedRoot, GITIGNORE_FILE_NAME);
  try {
    const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
    ig.add(gitignoreContent);
    sources.push(GITIGNORE_FILE_NAME);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  // 3. Load root .aireviewerignore if present
  const aireviewerIgnorePath = path.join(resolvedRoot, IGNORE_FILE_NAME);
  try {
    const aireviewerIgnoreContent = await fs.readFile(aireviewerIgnorePath, 'utf-8');
    ig.add(aireviewerIgnoreContent);
    sources.push(IGNORE_FILE_NAME);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  return {
    ignores(relativePath) {
      if (typeof relativePath !== 'string') {
        return false;
      }

      const normalized = normalizeRelativePath(relativePath);

      // Reject or ignore paths attempting to traverse outside root directory
      if (normalized.startsWith('../') || normalized === '..') {
        return true;
      }

      if (normalized === '' || normalized === '.') {
        return false;
      }

      return ig.ignores(normalized);
    },
    sources
  };
}
