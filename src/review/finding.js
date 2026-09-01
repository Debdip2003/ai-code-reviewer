/**
 * Common finding model and validation schema.
 * Defines the normalized contract for all review findings produced across analyzers.
 */

import { z } from 'zod';

/**
 * Finding severity levels enum.
 * @type {Readonly<{ LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' }>}
 */
export const FindingSeverity = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
});

/**
 * Finding categories enum.
 * @type {Readonly<{ CORRECTNESS: 'correctness', SECURITY: 'security', PERFORMANCE: 'performance', MAINTAINABILITY: 'maintainability' }>}
 */
export const FindingCategory = Object.freeze({
  CORRECTNESS: 'correctness',
  SECURITY: 'security',
  PERFORMANCE: 'performance',
  MAINTAINABILITY: 'maintainability'
});

/**
 * Zod schema defining the normalized finding data contract.
 */
export const FindingSchema = z
  .object({
    source: z.string().min(1, 'Source identifier cannot be empty'),
    ruleId: z.string().min(1, 'Rule identifier cannot be empty'),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    category: z.enum(['correctness', 'security', 'performance', 'maintainability']),
    title: z.string().min(1, 'Finding title cannot be empty'),
    message: z.string().min(1, 'Finding message cannot be empty'),
    relativePath: z.string().min(1, 'Relative file path cannot be empty'),
    lineStart: z.number().int('lineStart must be an integer').positive('lineStart must be positive'),
    columnStart: z.number().int('columnStart must be an integer').positive('columnStart must be positive'),
    lineEnd: z.number().int('lineEnd must be an integer').positive('lineEnd must be positive'),
    columnEnd: z.number().int('columnEnd must be an integer').positive('columnEnd must be positive'),
    suggestion: z.string().nullable(),
    fixable: z.boolean()
  })
  .strict()
  .refine(
    (data) => {
      if (data.lineEnd < data.lineStart) {
        return false;
      }
      if (data.lineEnd === data.lineStart && data.columnEnd < data.columnStart) {
        return false;
      }
      return true;
    },
    {
      message: 'End position (lineEnd, columnEnd) cannot precede start position (lineStart, columnStart)'
    }
  );

/**
 * Validates a candidate finding object against the normalized finding schema.
 *
 * @template T
 * @param {T} finding - Candidate finding object.
 * @returns {z.infer<typeof FindingSchema>} Validated finding object.
 * @throws {Error} If validation fails.
 */
export function validateFinding(finding) {
  const result = FindingSchema.safeParse(finding);
  if (!result.success) {
    const issues = result.error.errors.map((e) => `  - ${e.path.join('.') || 'root'}: ${e.message}`).join('\n');
    throw new Error(`Invalid finding object:\n${issues}`);
  }
  return result.data;
}
