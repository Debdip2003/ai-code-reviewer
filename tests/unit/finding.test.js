import { describe, it, expect } from 'vitest';
import {
  FindingSchema,
  FindingSeverity,
  FindingCategory,
  validateFinding
} from '../../src/review/finding.js';

describe('Finding Model and Validation', () => {
  const validFinding = {
    source: 'eslint',
    ruleId: 'no-undef',
    severity: 'high',
    category: 'correctness',
    title: 'Undefined identifier',
    message: "'total' is not defined.",
    relativePath: 'src/cart.js',
    lineStart: 12,
    columnStart: 5,
    lineEnd: 12,
    columnEnd: 10,
    suggestion: null,
    fixable: false
  };

  it('should validate a complete, valid finding object', () => {
    const result = validateFinding(validFinding);
    expect(result).toEqual(validFinding);
  });

  it('should accept null suggestion and true fixable', () => {
    const findingWithFix = {
      ...validFinding,
      suggestion: 'Remove unused variable',
      fixable: true
    };
    expect(() => validateFinding(findingWithFix)).not.toThrow();
  });

  it('should reject invalid severity level', () => {
    const invalid = {
      ...validFinding,
      severity: 'extreme'
    };
    expect(() => validateFinding(invalid)).toThrow(/Invalid finding object/);
  });

  it('should reject invalid category', () => {
    const invalid = {
      ...validFinding,
      category: 'style'
    };
    expect(() => validateFinding(invalid)).toThrow(/Invalid finding object/);
  });

  it('should reject empty or missing relativePath', () => {
    const invalid = {
      ...validFinding,
      relativePath: ''
    };
    expect(() => validateFinding(invalid)).toThrow(/Relative file path cannot be empty/);
  });

  it('should reject non-positive line and column values', () => {
    expect(() =>
      validateFinding({ ...validFinding, lineStart: 0 })
    ).toThrow();

    expect(() =>
      validateFinding({ ...validFinding, columnStart: -1 })
    ).toThrow();
  });

  it('should reject end positions preceding start positions', () => {
    // lineEnd before lineStart
    expect(() =>
      validateFinding({
        ...validFinding,
        lineStart: 10,
        lineEnd: 9
      })
    ).toThrow(/End position .* cannot precede start position/);

    // columnEnd before columnStart on same line
    expect(() =>
      validateFinding({
        ...validFinding,
        lineStart: 10,
        lineEnd: 10,
        columnStart: 15,
        columnEnd: 10
      })
    ).toThrow(/End position .* cannot precede start position/);
  });

  it('should export immutable FindingSeverity and FindingCategory', () => {
    expect(Object.isFrozen(FindingSeverity)).toBe(true);
    expect(Object.isFrozen(FindingCategory)).toBe(true);
    expect(FindingSeverity.HIGH).toBe('high');
    expect(FindingCategory.CORRECTNESS).toBe('correctness');
  });
});
