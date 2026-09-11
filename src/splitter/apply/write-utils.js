/**
 * Filesystem, hashing, and encoding utilities for ACR Code Splitter transactions.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Calculates SHA-256 hex digest for a string or buffer.
 *
 * @param {string | Buffer} data
 * @returns {string}
 */
export function calculateSha256(data) {
  const hash = crypto.createHash('sha256');
  if (typeof data === 'string') {
    hash.update(data, 'utf8');
  } else {
    hash.update(data);
  }
  return hash.digest('hex');
}

/**
 * Calculates SHA-256 hex digest for a file on disk.
 *
 * @param {string} filePath
 * @returns {string}
 */
export function calculateFileSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return calculateSha256(content);
}

/**
 * Generates a collision-resistant timestamped operation identifier.
 * Format: YYYYMMDDTHHmmssZ-xxxxxx (e.g. 20260911T143012Z-a4f82c)
 *
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
export function generateOperationId(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  const randomSuffix = crypto.randomBytes(3).toString('hex');

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z-${randomSuffix}`;
}

/**
 * Encodes a project-relative file path into a single safe filename for backup storage.
 * e.g. "src/components/Dashboard.jsx" -> "src__components__Dashboard.jsx"
 *
 * @param {string} relativePath
 * @returns {string}
 */
export function encodePathForBackup(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  return normalized.replace(/\//g, '__');
}

/**
 * Decodes a backup filename back to its project-relative POSIX path.
 * e.g. "src__components__Dashboard.jsx" -> "src/components/Dashboard.jsx"
 *
 * @param {string} backupFilename
 * @returns {string}
 */
export function decodePathFromBackup(backupFilename) {
  return backupFilename.replace(/__/g, '/');
}

/**
 * Detects whether content uses CRLF or LF line endings.
 *
 * @param {string} content
 * @returns {'\r\n' | '\n'}
 */
export function detectLineEndings(content) {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Normalizes content to the target line ending convention.
 *
 * @param {string} content
 * @param {'\r\n' | '\n'} targetEnding
 * @returns {string}
 */
export function normalizeLineEndings(content, targetEnding = '\n') {
  const clean = content.replace(/\r\n/g, '\n');
  if (targetEnding === '\r\n') {
    return clean.replace(/\n/g, '\r\n');
  }
  return clean;
}

/**
 * Checks if a path is a symbolic link.
 *
 * @param {string} filePath
 * @returns {boolean}
 */
export function isSymlink(filePath) {
  try {
    const lstat = fs.lstatSync(filePath);
    return lstat.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Checks if a path is an existing regular file.
 *
 * @param {string} filePath
 * @returns {boolean}
 */
export function isRegularFile(filePath) {
  try {
    const lstat = fs.lstatSync(filePath);
    return lstat.isFile() && !lstat.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Retrieves file mode (permissions) from an existing file.
 * Returns default 0o644 if file cannot be queried.
 *
 * @param {string} filePath
 * @returns {number}
 */
export function getFileMode(filePath) {
  try {
    const stat = fs.statSync(filePath);
    // Mask off file-type bits, keep permission bits (0o777)
    return stat.mode & 0o777;
  } catch {
    return 0o644;
  }
}

/**
 * Ensures directory exists synchronously.
 *
 * @param {string} dirPath
 */
export function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Generates an unpredictable temporary file path in the same directory as destination.
 *
 * @param {string} destinationPath
 * @param {string} operationId
 * @returns {string}
 */
export function generateTempFilePath(destinationPath, operationId) {
  const dir = path.dirname(destinationPath);
  const randomHex = crypto.randomBytes(4).toString('hex');
  const tempName = `.acr-tmp-${operationId}-${randomHex}`;
  return path.join(dir, tempName);
}
