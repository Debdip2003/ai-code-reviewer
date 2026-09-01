import { describe, it, expect } from 'vitest';
import { parseJavaScript, JavaScriptParseError } from '../../src/parser/parse-javascript.js';

describe('parseJavaScript', () => {
  it('should parse valid JavaScript', () => {
    const ast = parseJavaScript({
      source: 'const a = 1; function add(x, y) { return x + y; }',
      filePath: 'src/math.js'
    });

    expect(ast).toBeDefined();
    expect(ast.type).toBe('File');
    expect(ast.program.body).toHaveLength(2);
  });

  it('should parse valid JSX syntax', () => {
    const ast = parseJavaScript({
      source: 'import React from "react"; export const Button = () => <button className="btn">Click</button>;',
      filePath: 'src/Button.jsx'
    });

    expect(ast).toBeDefined();
    expect(ast.program.body).toHaveLength(2);
  });

  it('should parse ES module imports and exports', () => {
    const ast = parseJavaScript({
      source: 'import { foo } from "./foo.js"; export default foo;',
      filePath: 'src/module.mjs'
    });

    expect(ast.program.sourceType).toBe('module');
    expect(ast.program.body).toHaveLength(2);
  });

  it('should parse CommonJS source', () => {
    const ast = parseJavaScript({
      source: 'const fs = require("fs"); module.exports = { fs };',
      filePath: 'src/legacy.cjs'
    });

    expect(ast.program.sourceType).toBe('script');
    expect(ast.program.body).toHaveLength(2);
  });

  it('should parse async/await and top-level await', () => {
    const ast = parseJavaScript({
      source: 'const data = await fetch("https://api.test"); async function run() { await data.json(); }',
      filePath: 'src/async.js'
    });

    expect(ast).toBeDefined();
  });

  it('should parse optional chaining, nullish coalescing, and object spread', () => {
    const ast = parseJavaScript({
      source: 'const val = user?.profile?.name ?? "Guest"; const merged = { ...val, extra: true };',
      filePath: 'src/modern.js'
    });

    expect(ast).toBeDefined();
  });

  it('should parse class fields and private class fields', () => {
    const ast = parseJavaScript({
      source: 'class User { publicField = 1; #privateSecret = 42; getSecret() { return this.#privateSecret; } }',
      filePath: 'src/User.js'
    });

    expect(ast).toBeDefined();
  });

  it('should reject invalid syntax with JavaScriptParseError containing line and 0-based column', () => {
    const brokenSource = 'const a = ;\nfunction bad() {';

    expect(() =>
      parseJavaScript({
        source: brokenSource,
        filePath: 'src/broken.js'
      })
    ).toThrow(JavaScriptParseError);

    try {
      parseJavaScript({
        source: brokenSource,
        filePath: 'src/broken.js'
      });
    } catch (error) {
      expect(error).toBeInstanceOf(JavaScriptParseError);
      expect(error.filePath).toBe('src/broken.js');
      expect(error.line).toBe(1);
      expect(typeof error.column).toBe('number');
      expect(error.message).toContain('Unable to parse src/broken.js at 1:');
      expect(error.cause).toBeDefined();
    }
  });

  it('should reject TypeScript syntax in V1', () => {
    const tsSource = 'interface User { id: number; } const x: number = 10;';

    expect(() =>
      parseJavaScript({
        source: tsSource,
        filePath: 'src/user.ts'
      })
    ).toThrow(JavaScriptParseError);
  });

  it('should validate non-string source parameter', () => {
    expect(() =>
      parseJavaScript({
        // @ts-expect-error - testing validation
        source: 12345,
        filePath: 'src/file.js'
      })
    ).toThrow(TypeError);
  });

  it('should validate empty or invalid filePath parameter', () => {
    expect(() =>
      parseJavaScript({
        source: 'const a = 1;',
        filePath: ''
      })
    ).toThrow(TypeError);

    expect(() =>
      parseJavaScript({
        source: 'const a = 1;',
        // @ts-expect-error - testing validation
        filePath: null
      })
    ).toThrow(TypeError);
  });

  it('should not execute the source code during parsing', () => {
    // @ts-expect-error - global flag test
    globalThis.__CODE_EXECUTION_DETECTED = false;

    const sourceWithSideEffect = 'globalThis.__CODE_EXECUTION_DETECTED = true; throw new Error("Executed!");';

    const ast = parseJavaScript({
      source: sourceWithSideEffect,
      filePath: 'src/safe.js'
    });

    expect(ast).toBeDefined();
    // @ts-expect-error - check that flag was not set
    expect(globalThis.__CODE_EXECUTION_DETECTED).toBe(false);
  });
});
