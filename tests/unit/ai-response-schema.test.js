import { describe, it, expect } from 'vitest';
import {
  AIFindingSchema,
  AIReviewResponseSchema,
  normalizeAIFindings
} from '../../src/ai/response-schema.js';

describe('AI Response Schema', () => {
  const validFinding = {
    ruleId: 'ai/unhandled-async-error',
    severity: 'high',
    category: 'correctness',
    title: 'Unhandled Async Promise Rejection',
    message: 'The async call to fetchData() lacks a catch block or try/catch wrapper.',
    lineStart: 10,
    lineEnd: 15,
    suggestion: 'Wrap the call in a try/catch block to handle network errors.',
    confidence: 0.95
  };

  it('should accept valid AI finding object', () => {
    const result = AIFindingSchema.safeParse(validFinding);
    expect(result.success).toBe(true);
  });

  it('should reject rule IDs that do not start with "ai/"', () => {
    const invalid = { ...validFinding, ruleId: 'no-undef' };
    const result = AIFindingSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject critical severity in V1', () => {
    const invalid = { ...validFinding, severity: 'critical' };
    const result = AIFindingSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject invalid confidence values (< 0 or > 1)', () => {
    expect(AIFindingSchema.safeParse({ ...validFinding, confidence: -0.1 }).success).toBe(false);
    expect(AIFindingSchema.safeParse({ ...validFinding, confidence: 1.1 }).success).toBe(false);
    expect(AIFindingSchema.safeParse({ ...validFinding, confidence: 0.8 }).success).toBe(true);
  });

  it('should reject non-positive lineStart or lineEnd', () => {
    expect(AIFindingSchema.safeParse({ ...validFinding, lineStart: 0 }).success).toBe(false);
    expect(AIFindingSchema.safeParse({ ...validFinding, lineEnd: -1 }).success).toBe(false);
  });

  it('should reject unknown fields in strict mode', () => {
    const invalid = { ...validFinding, unknownProp: 'extra' };
    const result = AIFindingSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should validate AIReviewResponseSchema with up to 10 findings', () => {
    const validResponse = {
      findings: [validFinding]
    };
    expect(AIReviewResponseSchema.safeParse(validResponse).success).toBe(true);

    const elevenFindings = {
      findings: Array.from({ length: 11 }, () => validFinding)
    };
    expect(AIReviewResponseSchema.safeParse(elevenFindings).success).toBe(false);
  });

  describe('normalizeAIFindings', () => {
    it('should drop findings with confidence below 0.65', () => {
      const findings = [
        { ...validFinding, confidence: 0.64 },
        { ...validFinding, confidence: 0.65 },
        { ...validFinding, confidence: 0.9 }
      ];

      const normalized = normalizeAIFindings(findings, {
        relativePath: 'src/app.js',
        chunkLineStart: 1,
        chunkLineEnd: 30
      });

      expect(normalized).toHaveLength(2);
      expect(normalized[0].confidence).toBe(0.65);
      expect(normalized[1].confidence).toBe(0.9);
    });

    it('should reject findings with line numbers outside the supplied chunk bounds', () => {
      const findings = [
        { ...validFinding, lineStart: 5, lineEnd: 10 }, // inside [5, 20]
        { ...validFinding, lineStart: 2, lineEnd: 10 }, // starts before chunk start
        { ...validFinding, lineStart: 15, lineEnd: 25 } // ends after chunk end
      ];

      const normalized = normalizeAIFindings(findings, {
        relativePath: 'src/app.js',
        chunkLineStart: 5,
        chunkLineEnd: 20
      });

      expect(normalized).toHaveLength(1);
      expect(normalized[0].lineStart).toBe(5);
      expect(normalized[0].lineEnd).toBe(10);
      expect(normalized[0].source).toBe('ai');
      expect(normalized[0].columnStart).toBe(1);
      expect(normalized[0].columnEnd).toBe(1);
      expect(normalized[0].fixable).toBe(false);
    });
  });
});
