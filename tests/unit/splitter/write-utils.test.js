import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  calculateSha256,
  calculateFileSha256,
  generateOperationId,
  encodePathForBackup,
  decodePathFromBackup,
  detectLineEndings,
  normalizeLineEndings,
  isRegularFile,
  isSymlink,
  getFileMode
} from '../../../src/splitter/apply/write-utils.js';

describe('write-utils unit tests', () => {
  it('should calculate accurate SHA-256 hash for strings and buffers', () => {
    const text = 'hello world';
    const hash = calculateSha256(text);
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');

    const bufHash = calculateSha256(Buffer.from(text, 'utf8'));
    expect(bufHash).toBe(hash);
  });

  it('should generate collision-resistant operation IDs with valid timestamp format', () => {
    const d = new Date('2026-09-11T14:30:12.000Z');
    const opId = generateOperationId(d);
    expect(opId).toMatch(/^20260911T143012Z-[a-f0-9]{6}$/);

    const opId2 = generateOperationId(d);
    expect(opId2).toMatch(/^20260911T143012Z-[a-f0-9]{6}$/);
    expect(opId).not.toBe(opId2); // Random suffix ensures uniqueness
  });

  it('should encode and decode relative paths for backup storage reversibly', () => {
    const original = 'src/components/cards/UserCard.jsx';
    const encoded = encodePathForBackup(original);
    expect(encoded).toBe('src__components__cards__UserCard.jsx');

    const decoded = decodePathFromBackup(encoded);
    expect(decoded).toBe(original);
  });

  it('should detect CRLF vs LF line endings and normalize accurately', () => {
    const crlfText = 'line1\r\nline2\r\n';
    const lfText = 'line1\nline2\n';

    expect(detectLineEndings(crlfText)).toBe('\r\n');
    expect(detectLineEndings(lfText)).toBe('\n');

    expect(normalizeLineEndings(crlfText, '\n')).toBe(lfText);
    expect(normalizeLineEndings(lfText, '\r\n')).toBe(crlfText);
  });

  it('should correctly identify regular files and file permissions', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-write-utils-'));
    const tempFile = path.join(tempDir, 'test.js');
    fs.writeFileSync(tempFile, 'const a = 1;');

    expect(isRegularFile(tempFile)).toBe(true);
    expect(isSymlink(tempFile)).toBe(false);

    const mode = getFileMode(tempFile);
    expect(typeof mode).toBe('number');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
