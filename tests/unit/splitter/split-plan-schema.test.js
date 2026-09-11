import { describe, it, expect } from 'vitest';
import { SplitPlanSchema, SplitCandidateSchema } from '../../../src/splitter/split-plan-schema.js';

describe('Split Plan Schema', () => {
  const validCandidate = {
    id: 'cand-1',
    kind: 'react-component',
    symbolName: 'ProductCard',
    lineStart: 10,
    lineEnd: 50,
    targetFile: 'src/ProductPage/ProductCard.jsx',
    reason: 'Independent JSX section.',
    confidence: 0.95,
    dependencies: [],
    dependents: ['ProductPage'],
    externalImports: ['react'],
    capturedBindings: [],
    safeForFutureExtraction: true,
    risks: []
  };

  const validPlan = {
    version: 1,
    mode: 'dry-run',
    sourceFile: 'src/ProductPage.jsx',
    targetDirectory: 'src/ProductPage',
    sourceSummary: {
      lines: 100,
      declarations: 5,
      imports: 2,
      exports: 1
    },
    candidates: [validCandidate],
    warnings: [],
    summary: {
      detected: 1,
      safe: 1,
      unsafe: 0,
      conflicts: 0
    }
  };

  it('should validate a correct split plan', () => {
    const result = SplitPlanSchema.safeParse(validPlan);
    expect(result.success).toBe(true);
  });

  it('should reject unknown fields (strict mode)', () => {
    const invalidPlan = {
      ...validPlan,
      unknownField: 'bad'
    };
    const result = SplitPlanSchema.safeParse(invalidPlan);
    expect(result.success).toBe(false);
  });

  it('should reject non-dry-run modes', () => {
    const invalidPlan = {
      ...validPlan,
      mode: 'apply'
    };
    const result = SplitPlanSchema.safeParse(invalidPlan);
    expect(result.success).toBe(false);
  });

  it('should reject candidates with lineStart > lineEnd', () => {
    const invalidCandidate = {
      ...validCandidate,
      lineStart: 60,
      lineEnd: 20
    };
    const result = SplitCandidateSchema.safeParse(invalidCandidate);
    expect(result.success).toBe(false);
  });

  it('should reject confidence values outside [0, 1]', () => {
    const invalidCandidate = {
      ...validCandidate,
      confidence: 1.5
    };
    const result = SplitCandidateSchema.safeParse(invalidCandidate);
    expect(result.success).toBe(false);
  });

  it('should reject plans where summary counts do not match candidates', () => {
    const mismatchedPlan = {
      ...validPlan,
      summary: {
        detected: 5,
        safe: 5,
        unsafe: 0,
        conflicts: 0
      }
    };
    const result = SplitPlanSchema.safeParse(mismatchedPlan);
    expect(result.success).toBe(false);
  });
});
