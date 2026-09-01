import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseFile } from '../../src/parser/parse-file.js';
import { JavaScriptParseError } from '../../src/parser/parse-javascript.js';

describe('parseFile', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-reviewer-parse-file-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should read UTF-8 files and parse valid JavaScript and JSX', async () => {
    const filePath = path.join(tempDir, 'App.jsx');
    const content = 'export const App = () => <h1>Hello World</h1>;';
    await fs.writeFile(filePath, content, 'utf-8');

    const result = await parseFile({
      absolutePath: filePath,
      relativePath: 'src/App.jsx'
    });

    expect(result.absolutePath).toBe(filePath);
    expect(result.relativePath).toBe('src/App.jsx');
    expect(result.source).toBe(content);
    expect(result.ast).toBeDefined();
    expect(result.ast.type).toBe('File');
  });

  it('should throw JavaScriptParseError with relative path context on syntax errors', async () => {
    const filePath = path.join(tempDir, 'broken.js');
    await fs.writeFile(filePath, 'const broken = ;', 'utf-8');

    await expect(
      parseFile({
        absolutePath: filePath,
        relativePath: 'src/broken.js'
      })
    ).rejects.toThrow(JavaScriptParseError);

    try {
      await parseFile({
        absolutePath: filePath,
        relativePath: 'src/broken.js'
      });
    } catch (error) {
      expect(error.filePath).toBe('src/broken.js');
      expect(error.message).toContain('Unable to parse src/broken.js');
    }
  });

  it('should throw error when target file does not exist', async () => {
    const nonExistentPath = path.join(tempDir, 'does-not-exist.js');

    await expect(
      parseFile({
        absolutePath: nonExistentPath,
        relativePath: 'src/does-not-exist.js'
      })
    ).rejects.toThrow(/Failed to read file/);
  });

  it('should reject files containing null bytes as unsupported binary files', async () => {
    const binaryFilePath = path.join(tempDir, 'binary.js');
    const binaryBuffer = Buffer.from([0x63, 0x6f, 0x6e, 0x73, 0x74, 0x20, 0x00, 0x3b]); // "const \0;"
    await fs.writeFile(binaryFilePath, binaryBuffer);

    await expect(
      parseFile({
        absolutePath: binaryFilePath,
        relativePath: 'src/binary.js'
      })
    ).rejects.toThrow(/null bytes/);
  });
});
