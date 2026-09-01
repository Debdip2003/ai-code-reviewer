import { describe, it, expect } from 'vitest';
import { deduplicateFindings } from '../../src/review/deduplicate.js';

describe('deduplicateFindings', () => {
  const baseFinding = {
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

  it('should remove exact duplicate findings', () => {
    const input = [
      { ...baseFinding },
      { ...baseFinding, message: "  'total' is   not defined.  " }, // whitespace variation
      { ...baseFinding }
    ];

    const result = deduplicateFindings(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(baseFinding);
  });

  it('should preserve findings with different rule IDs', () => {
    const input = [
      { ...baseFinding, ruleId: 'no-undef' },
      { ...baseFinding, ruleId: 'no-unused-vars' }
    ];

    const result = deduplicateFindings(input);
    expect(result).toHaveLength(2);
  });

  it('should preserve findings with different locations or files', () => {
    const input = [
      { ...baseFinding, lineStart: 12 },
      { ...baseFinding, lineStart: 15 },
      { ...baseFinding, relativePath: 'src/other.js' }
    ];

    const result = deduplicateFindings(input);
    expect(result).toHaveLength(3);
  });

  it('should preserve original order and not mutate input', () => {
    const input = [
      { ...baseFinding, lineStart: 1 },
      { ...baseFinding, lineStart: 2 },
      { ...baseFinding, lineStart: 1 } // duplicate of first
    ];

    const copy = [...input];
    const result = deduplicateFindings(input);

    expect(result).toHaveLength(2);
    expect(result[0].lineStart).toBe(1);
    expect(result[1].lineStart).toBe(2);
    expect(input).toEqual(copy);
  });
});
