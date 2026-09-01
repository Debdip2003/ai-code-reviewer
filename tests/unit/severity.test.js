import { describe, it, expect } from 'vitest';
import {
  SEVERITY_ORDER,
  isAtOrAboveSeverity,
  filterFindingsBySeverity,
  countFindingsBySeverity,
  sortFindings
} from '../../src/review/severity.js';

describe('Severity Utilities and Ordering', () => {
  it('should define expected numeric weights in SEVERITY_ORDER', () => {
    expect(SEVERITY_ORDER.low).toBe(1);
    expect(SEVERITY_ORDER.medium).toBe(2);
    expect(SEVERITY_ORDER.high).toBe(3);
    expect(SEVERITY_ORDER.critical).toBe(4);
    expect(Object.isFrozen(SEVERITY_ORDER)).toBe(true);
  });

  describe('isAtOrAboveSeverity', () => {
    it('should correctly evaluate severity comparisons', () => {
      expect(isAtOrAboveSeverity('high', 'medium')).toBe(true);
      expect(isAtOrAboveSeverity('medium', 'medium')).toBe(true);
      expect(isAtOrAboveSeverity('low', 'medium')).toBe(false);
      expect(isAtOrAboveSeverity('critical', 'high')).toBe(true);
      expect(isAtOrAboveSeverity('low', 'critical')).toBe(false);
    });

    it('should throw when encountering unknown severity values', () => {
      expect(() => isAtOrAboveSeverity('unknown', 'medium')).toThrow(/Unknown finding severity/);
      expect(() => isAtOrAboveSeverity('high', 'invalid')).toThrow(/Unknown severity threshold/);
    });
  });

  describe('filterFindingsBySeverity', () => {
    const findings = [
      { ruleId: 'r1', severity: 'low' },
      { ruleId: 'r2', severity: 'medium' },
      { ruleId: 'r3', severity: 'high' },
      { ruleId: 'r4', severity: 'critical' }
    ];

    it('should filter findings based on minimum threshold', () => {
      const highAndAbove = filterFindingsBySeverity(findings, 'high');
      expect(highAndAbove).toHaveLength(2);
      expect(highAndAbove.map((f) => f.ruleId)).toEqual(['r3', 'r4']);

      const mediumAndAbove = filterFindingsBySeverity(findings, 'medium');
      expect(mediumAndAbove).toHaveLength(3);
      expect(mediumAndAbove.map((f) => f.ruleId)).toEqual(['r2', 'r3', 'r4']);
    });

    it('should not mutate the input array', () => {
      const copy = [...findings];
      filterFindingsBySeverity(findings, 'high');
      expect(findings).toEqual(copy);
    });
  });

  describe('countFindingsBySeverity', () => {
    it('should accurately count findings by severity level', () => {
      const findings = [
        { severity: 'high' },
        { severity: 'high' },
        { severity: 'medium' },
        { severity: 'low' },
        { severity: 'critical' }
      ];

      const counts = countFindingsBySeverity(findings);
      expect(counts).toEqual({
        critical: 1,
        high: 2,
        medium: 1,
        low: 1
      });
    });

    it('should throw on unknown severity level during count', () => {
      expect(() => countFindingsBySeverity([{ severity: 'bad-level' }])).toThrow();
    });
  });

  describe('sortFindings', () => {
    it('should deterministically sort by path, line, col, severity desc, and ruleId', () => {
      const unsorted = [
        { relativePath: 'src/b.js', lineStart: 5, columnStart: 1, severity: 'medium', ruleId: 'rule-b' },
        { relativePath: 'src/a.js', lineStart: 10, columnStart: 5, severity: 'low', ruleId: 'rule-z' },
        { relativePath: 'src/a.js', lineStart: 5, columnStart: 2, severity: 'high', ruleId: 'rule-b' },
        { relativePath: 'src/a.js', lineStart: 5, columnStart: 2, severity: 'high', ruleId: 'rule-a' },
        { relativePath: 'src/a.js', lineStart: 5, columnStart: 2, severity: 'low', ruleId: 'rule-c' },
        { relativePath: 'src/a.js', lineStart: 5, columnStart: 1, severity: 'medium', ruleId: 'rule-x' }
      ];

      const sorted = sortFindings(unsorted);

      expect(sorted).toEqual([
        { relativePath: 'src/a.js', lineStart: 5, columnStart: 1, severity: 'medium', ruleId: 'rule-x' },
        { relativePath: 'src/a.js', lineStart: 5, columnStart: 2, severity: 'high', ruleId: 'rule-a' },
        { relativePath: 'src/a.js', lineStart: 5, columnStart: 2, severity: 'high', ruleId: 'rule-b' },
        { relativePath: 'src/a.js', lineStart: 5, columnStart: 2, severity: 'low', ruleId: 'rule-c' },
        { relativePath: 'src/a.js', lineStart: 10, columnStart: 5, severity: 'low', ruleId: 'rule-z' },
        { relativePath: 'src/b.js', lineStart: 5, columnStart: 1, severity: 'medium', ruleId: 'rule-b' }
      ]);
    });
  });
});
