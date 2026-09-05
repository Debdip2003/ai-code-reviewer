import { describe, it, expect } from 'vitest';
import {
  findingIntersectsChangedLines,
  filterFindingsByScope
} from '../../src/review/filter-by-scope.js';

describe('Scope Finding Filter', () => {
  describe('findingIntersectsChangedLines', () => {
    it('should return true for file-level findings without line numbers', () => {
      const finding = {
        ruleId: 'file-error',
        severity: 'high',
        message: 'File failed'
      };
      expect(findingIntersectsChangedLines(finding, [{ start: 5, end: 10 }])).toBe(true);
    });

    it('should return false if changedLines is empty or invalid', () => {
      const finding = { lineStart: 5, lineEnd: 5 };
      expect(findingIntersectsChangedLines(finding, [])).toBe(false);
      expect(findingIntersectsChangedLines(finding, null)).toBe(false);
    });

    it('should return true when finding is fully contained within changed range', () => {
      const finding = { lineStart: 12, lineEnd: 14 };
      const changed = [{ start: 10, end: 20 }];
      expect(findingIntersectsChangedLines(finding, changed)).toBe(true);
    });

    it('should return true when single line finding falls inside changed range', () => {
      const finding = { lineStart: 15 };
      const changed = [{ start: 10, end: 20 }];
      expect(findingIntersectsChangedLines(finding, changed)).toBe(true);
    });

    it('should return true when finding overlaps boundary of changed range', () => {
      const findingOverStart = { lineStart: 5, lineEnd: 12 };
      const findingOverEnd = { lineStart: 18, lineEnd: 25 };
      const changed = [{ start: 10, end: 20 }];

      expect(findingIntersectsChangedLines(findingOverStart, changed)).toBe(true);
      expect(findingIntersectsChangedLines(findingOverEnd, changed)).toBe(true);
    });

    it('should return false when finding is strictly before or after changed ranges', () => {
      const findingBefore = { lineStart: 1, lineEnd: 8 };
      const findingAfter = { lineStart: 25, lineEnd: 30 };
      const changed = [{ start: 10, end: 20 }];

      expect(findingIntersectsChangedLines(findingBefore, changed)).toBe(false);
      expect(findingIntersectsChangedLines(findingAfter, changed)).toBe(false);
    });
  });

  describe('filterFindingsByScope', () => {
    const sampleFindings = [
      {
        ruleId: 'eqeqeq',
        relativePath: 'src/app.js',
        lineStart: 12,
        lineEnd: 12,
        severity: 'medium',
        message: 'Expected ==='
      },
      {
        ruleId: 'no-unused-vars',
        relativePath: 'src/app.js',
        lineStart: 50,
        lineEnd: 50,
        severity: 'high',
        message: 'Unused var'
      },
      {
        ruleId: 'react/array-index-key',
        relativePath: 'src/components/List.jsx',
        lineStart: 5,
        lineEnd: 5,
        severity: 'high',
        message: 'Avoid index key'
      }
    ];

    it('should return all findings when scope is not provided or mode is full', () => {
      expect(filterFindingsByScope({ findings: sampleFindings })).toEqual(sampleFindings);
      expect(
        filterFindingsByScope({
          findings: sampleFindings,
          reviewScope: { mode: 'full' }
        })
      ).toEqual(sampleFindings);
    });

    it('should filter findings to only changed files and changed line ranges', () => {
      const reviewScope = {
        mode: 'changed',
        files: {
          'src/app.js': {
            status: 'modified',
            changedLines: [{ start: 10, end: 15 }] // covers line 12, not 50
          }
        }
      };

      const filtered = filterFindingsByScope({
        findings: sampleFindings,
        reviewScope
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].ruleId).toBe('eqeqeq');
      expect(filtered[0].relativePath).toBe('src/app.js');
    });

    it('should preserve file-level findings without relativePath or line numbers', () => {
      const findingsWithGlobal = [
        ...sampleFindings,
        {
          ruleId: 'parse-failure',
          relativePath: 'src/app.js',
          severity: 'critical',
          message: 'Syntax error'
          // no lineStart
        }
      ];

      const reviewScope = {
        mode: 'changed',
        files: {
          'src/app.js': {
            status: 'modified',
            changedLines: [{ start: 10, end: 15 }]
          }
        }
      };

      const filtered = filterFindingsByScope({
        findings: findingsWithGlobal,
        reviewScope
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.map((f) => f.ruleId)).toEqual(['eqeqeq', 'parse-failure']);
    });
  });
});
