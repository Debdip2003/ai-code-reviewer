/**
 * AI response validation schemas and normalization helpers using Zod.
 * Enforces structured schema compliance on LLM model outputs.
 */

import { z } from 'zod';
import { validateFinding } from '../review/finding.js';

export const MIN_AI_CONFIDENCE = 0.65;

/**
 * Zod schema for an individual AI code review finding.
 * Strictly compliant with OpenAI Structured Outputs JSON schema constraints.
 */
export const AIFindingSchema = z
  .object({
    ruleId: z
      .string()
      .min(4, 'ruleId must be at least 4 characters')
      .max(100, 'ruleId cannot exceed 100 characters')
      .regex(/^ai\/[a-z0-9-]+$/, 'AI rule ID must begin with "ai/" and contain lowercase alphanumeric or dash characters'),
    severity: z.enum(['low', 'medium', 'high'], {
      errorMap: () => ({ message: "severity must be 'low', 'medium', or 'high'" })
    }),
    category: z.enum(['correctness', 'security', 'performance', 'maintainability'], {
      errorMap: () => ({
        message: "category must be 'correctness', 'security', 'performance', or 'maintainability'"
      })
    }),
    title: z
      .string()
      .min(1, 'title cannot be empty')
      .max(200, 'title cannot exceed 200 characters'),
    message: z
      .string()
      .min(1, 'message cannot be empty')
      .max(2000, 'message cannot exceed 2000 characters'),
    lineStart: z
      .number()
      .int('lineStart must be an integer')
      .positive('lineStart must be a positive integer'),
    lineEnd: z
      .number()
      .int('lineEnd must be an integer')
      .positive('lineEnd must be a positive integer'),
    suggestion: z
      .string()
      .min(1, 'suggestion cannot be empty')
      .max(2000, 'suggestion cannot exceed 2000 characters'),
    confidence: z
      .number()
      .min(0, 'confidence must be at least 0')
      .max(1, 'confidence cannot exceed 1')
  })
  .strict();

/**
 * Zod schema for full structured AI review response.
 */
export const AIReviewResponseSchema = z
  .object({
    findings: z
      .array(AIFindingSchema)
      .max(10, 'Cannot return more than 10 findings per chunk')
  })
  .strict();

/**
 * Pre-processes and sanitizes loosely structured LLM JSON outputs into strict schema shape.
 *
 * @param {unknown} raw - Raw parsed JSON from AI completion.
 * @returns {{ findings: Array<Object> }} Sanitized findings object conforming to AIReviewResponseSchema.
 */
export function sanitizeRawAIFindings(raw) {
  if (!raw || typeof raw !== 'object') return { findings: [] };
  const rawList = Array.isArray(raw.findings) ? raw.findings : [];

  const cleaned = rawList
    .map((item) => {
      if (!item || typeof item !== 'object') return null;

      let ruleId = typeof item.ruleId === 'string' ? item.ruleId : (item.rule || item.type || 'ai/code-issue');
      ruleId = String(ruleId).toLowerCase().replace(/[^a-z0-9/-]/g, '-');
      if (!ruleId.startsWith('ai/')) {
        ruleId = `ai/${ruleId.replace(/^ai-?/, '').replace(/^-+/, '') || 'issue'}`;
      }

      const severity = ['low', 'medium', 'high'].includes(item.severity) ? item.severity : 'medium';
      const category = ['correctness', 'security', 'performance', 'maintainability'].includes(item.category)
        ? item.category
        : 'correctness';

      const title =
        typeof item.title === 'string' && item.title.trim().length > 0
          ? item.title.trim()
          : (typeof item.message === 'string' && item.message.trim().length > 0
              ? item.message.trim().slice(0, 60)
              : 'Code Issue');

      const message =
        typeof item.message === 'string' && item.message.trim().length > 0
          ? item.message.trim()
          : (typeof item.description === 'string' && item.description.trim().length > 0
              ? item.description.trim()
              : 'Potential issue identified in code.');

      const line = typeof item.line === 'number' ? item.line : undefined;
      const lineStart = typeof item.lineStart === 'number' ? item.lineStart : (line || 1);
      const lineEnd = typeof item.lineEnd === 'number' ? item.lineEnd : lineStart;

      const suggestion =
        typeof item.suggestion === 'string' && item.suggestion.trim().length > 0
          ? item.suggestion.trim()
          : 'Review and update the code.';

      const confidence =
        typeof item.confidence === 'number' && !isNaN(item.confidence)
          ? Math.max(0, Math.min(1, item.confidence))
          : 0.85;

      return {
        ruleId,
        severity,
        category,
        title,
        message,
        lineStart,
        lineEnd,
        suggestion,
        confidence
      };
    })
    .filter(Boolean);

  return { findings: cleaned };
}

/**
 * Normalizes and validates raw AI findings against the chunk's boundaries and confidence threshold.
 *
 * @param {Array<z.infer<typeof AIFindingSchema>>} rawFindings - Findings returned by AI provider.
 * @param {Object} context - Review context.
 * @param {string} context.relativePath - File relative path.
 * @param {number} context.chunkLineStart - Starting line of chunk.
 * @param {number} context.chunkLineEnd - Ending line of chunk.
 * @returns {Array<import('../review/finding.js').FindingSchema>} Validated, normalized findings.
 */
export function normalizeAIFindings(rawFindings, { relativePath, chunkLineStart, chunkLineEnd }) {
  if (!Array.isArray(rawFindings) || rawFindings.length === 0) {
    return [];
  }

  const normalized = [];

  for (const finding of rawFindings) {
    // 1. Drop findings below confidence threshold (0.65)
    if (typeof finding.confidence !== 'number' || finding.confidence < MIN_AI_CONFIDENCE) {
      continue;
    }

    // 2. Validate line ranges against chunk bounds and start <= end
    if (
      typeof finding.lineStart !== 'number' ||
      typeof finding.lineEnd !== 'number' ||
      finding.lineStart < chunkLineStart ||
      finding.lineEnd > chunkLineEnd ||
      finding.lineEnd < finding.lineStart
    ) {
      // Reject findings with line numbers outside the supplied chunk
      continue;
    }

    // 3. Shape into shared FindingSchema
    const normalizedCandidate = {
      source: 'ai',
      ruleId: finding.ruleId,
      severity: finding.severity,
      category: finding.category,
      title: finding.title.trim(),
      message: finding.message.trim(),
      relativePath,
      lineStart: finding.lineStart,
      columnStart: 1,
      lineEnd: finding.lineEnd,
      columnEnd: 1,
      suggestion: finding.suggestion ? finding.suggestion.trim() : null,
      fixable: false,
      confidence: finding.confidence
    };

    // 4. Validate against FindingSchema
    try {
      const validated = validateFinding(normalizedCandidate);
      normalized.push(validated);
    } catch {
      // If validation fails, discard invalid finding
    }
  }

  return normalized;
}
