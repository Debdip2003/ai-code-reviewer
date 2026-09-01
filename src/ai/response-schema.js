/**
 * AI response validation schemas using Zod.
 * Enforces structured schema compliance on LLM model outputs.
 */

import { z } from 'zod';

/**
 * Zod schema for an individual code review finding.
 */
export const reviewFindingSchema = z.object({
  filePath: z.string(),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
  ruleId: z.string(),
  message: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  suggestion: z.string().optional(),
});

/**
 * Zod schema for full structured review responses.
 */
export const reviewResponseSchema = z.object({
  summary: z.string(),
  findings: z.array(reviewFindingSchema),
});
