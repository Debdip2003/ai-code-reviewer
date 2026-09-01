import { describe, it, expect } from 'vitest';
import { analyzeWithEslint } from '../../src/analyzers/eslint-analyzer.js';

describe('analyzeWithEslint', () => {
  it('should return no findings for clean JavaScript', async () => {
    const source = `
      export function add(a, b) {
        return a + b;
      }
    `;
    const result = await analyzeWithEslint({
      source,
      relativePath: 'src/math.js'
    });

    expect(result.relativePath).toBe('src/math.js');
    expect(result.findings).toHaveLength(0);
    expect(result.statistics.errors).toBe(0);
    expect(result.statistics.warnings).toBe(0);
  });

  it('should detect undefined variables (no-undef) with high severity', async () => {
    const source = `
      export function calculate() {
        return total * 1.1;
      }
    `;
    const result = await analyzeWithEslint({
      source,
      relativePath: 'src/calc.js'
    });

    expect(result.findings.some((f) => f.ruleId === 'no-undef')).toBe(true);
    const undefFinding = result.findings.find((f) => f.ruleId === 'no-undef');
    expect(undefFinding.severity).toBe('high');
    expect(undefFinding.category).toBe('correctness');
    expect(undefFinding.relativePath).toBe('src/calc.js');
    expect(undefFinding.lineStart).toBe(3);
  });

  it('should detect unused variables (no-unused-vars)', async () => {
    const source = `
      const unusedValue = 42;
      export function run() {
        return true;
      }
    `;
    const result = await analyzeWithEslint({
      source,
      relativePath: 'src/unused.js'
    });

    expect(result.findings.some((f) => f.ruleId === 'no-unused-vars')).toBe(true);
    const unusedFinding = result.findings.find((f) => f.ruleId === 'no-unused-vars');
    expect(unusedFinding.severity).toBe('medium');
    expect(unusedFinding.category).toBe('maintainability');
  });

  it('should detect unreachable code (no-unreachable)', async () => {
    const source = `
      export function foo() {
        return 1;
        const x = 2;
        return x;
      }
    `;
    const result = await analyzeWithEslint({
      source,
      relativePath: 'src/unreachable.js'
    });

    expect(result.findings.some((f) => f.ruleId === 'no-unreachable')).toBe(true);
  });

  it('should detect duplicate object keys (no-dupe-keys)', async () => {
    const source = `
      export const obj = {
        name: 'Alice',
        name: 'Bob'
      };
    `;
    const result = await analyzeWithEslint({
      source,
      relativePath: 'src/dupe.js'
    });

    expect(result.findings.some((f) => f.ruleId === 'no-dupe-keys')).toBe(true);
  });

  it('should detect duplicate switch cases (no-duplicate-case)', async () => {
    const source = `
      export function test(val) {
        switch (val) {
          case 1:
            break;
          case 1:
            break;
        }
      }
    `;
    const result = await analyzeWithEslint({
      source,
      relativePath: 'src/switch.js'
    });

    expect(result.findings.some((f) => f.ruleId === 'no-duplicate-case')).toBe(true);
  });

  it('should detect incorrect NaN comparisons (use-isnan)', async () => {
    const source = `
      export function check(x) {
        return x === NaN;
      }
    `;
    const result = await analyzeWithEslint({
      source,
      relativePath: 'src/nan.js'
    });

    expect(result.findings.some((f) => f.ruleId === 'use-isnan')).toBe(true);
  });

  it('should detect invalid typeof comparisons (valid-typeof)', async () => {
    const source = `
      export function check(x) {
        return typeof x === 'strng';
      }
    `;
    const result = await analyzeWithEslint({
      source,
      relativePath: 'src/typeof.js'
    });

    expect(result.findings.some((f) => f.ruleId === 'valid-typeof')).toBe(true);
  });

  it('should detect switch case fallthrough (no-fallthrough)', async () => {
    const source = `
      export function check(x) {
        switch (x) {
          case 1:
            doSomething();
          case 2:
            return 2;
        }
      }
      function doSomething() {}
    `;
    const result = await analyzeWithEslint({
      source,
      relativePath: 'src/fallthrough.js'
    });

    expect(result.findings.some((f) => f.ruleId === 'no-fallthrough')).toBe(true);
  });

  it('should detect loose equality (eqeqeq)', async () => {
    const source = `
      export function isEqual(a, b) {
        return a == b;
      }
    `;
    const result = await analyzeWithEslint({
      source,
      relativePath: 'src/equality.js'
    });

    expect(result.findings.some((f) => f.ruleId === 'eqeqeq')).toBe(true);
  });

  it('should parse and analyze valid React JSX without errors', async () => {
    const source = `
      export const Button = () => (
        <button onClick={() => console.log('clicked')}>
          Click me
        </button>
      );
    `;
    const result = await analyzeWithEslint({
      source,
      relativePath: 'src/Button.jsx'
    });

    expect(result.findings).toHaveLength(0);
  });

  it('should detect conditional Hook calls (react-hooks/rules-of-hooks)', async () => {
    const source = `
      import { useState } from 'react';
      export function MyComponent({ condition }) {
        if (condition) {
          const [val, setVal] = useState(0);
          return val;
        }
        return null;
      }
    `;
    const result = await analyzeWithEslint({
      source,
      relativePath: 'src/ConditionalHook.jsx'
    });

    expect(result.findings.some((f) => f.ruleId === 'react-hooks/rules-of-hooks')).toBe(true);
    const hookFinding = result.findings.find((f) => f.ruleId === 'react-hooks/rules-of-hooks');
    expect(hookFinding.severity).toBe('high');
    expect(hookFinding.category).toBe('correctness');
  });

  it('should detect missing effect dependencies (react-hooks/exhaustive-deps)', async () => {
    const source = `
      import { useEffect, useState } from 'react';
      export function Profile({ userId }) {
        const [user, setUser] = useState(null);
        useEffect(() => {
          console.log(userId);
        }, []); // missing userId
        return user;
      }
    `;
    const result = await analyzeWithEslint({
      source,
      relativePath: 'src/Profile.jsx'
    });

    expect(result.findings.some((f) => f.ruleId === 'react-hooks/exhaustive-deps')).toBe(true);
    const depFinding = result.findings.find((f) => f.ruleId === 'react-hooks/exhaustive-deps');
    expect(depFinding.severity).toBe('medium');
    expect(depFinding.category).toBe('correctness');
  });

  it('should not report Hook violations when react-hooks rules are disabled in config', async () => {
    const source = `
      import { useState } from 'react';
      export function MyComponent({ condition }) {
        if (condition) {
          const [val] = useState(0);
          return val;
        }
        return null;
      }
    `;
    const result = await analyzeWithEslint({
      source,
      relativePath: 'src/ConditionalHook.jsx',
      options: {
        react: {
          hooks: false
        }
      }
    });

    expect(result.findings.some((f) => f.ruleId === 'react-hooks/rules-of-hooks')).toBe(false);
  });

  it('should recognize browser and Node.js globals without false positives', async () => {
    const source = `
      export function logEnv() {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('key', 'val');
        }
        if (typeof process !== 'undefined') {
          return process.env.NODE_ENV;
        }
        return Buffer.from('hello').toString('hex');
      }
    `;
    const result = await analyzeWithEslint({
      source,
      relativePath: 'src/globals.js'
    });

    expect(result.findings.some((f) => f.ruleId === 'no-undef')).toBe(false);
  });

  it('should never contain absolute paths in finding objects', async () => {
    const source = 'export const a = badVar;';
    const result = await analyzeWithEslint({
      source,
      relativePath: 'src/test.js'
    });

    for (const finding of result.findings) {
      expect(finding.relativePath).toBe('src/test.js');
      expect(finding.relativePath).not.toContain('C:');
      expect(finding.relativePath).not.toContain('/home/');
    }
  });
});
