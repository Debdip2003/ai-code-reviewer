/**
 * Zod Schema definitions for ACR Code Splitting Plans.
 * Enforces strict, validated, serializable plan structures for dry-run code splitting.
 */

import { z } from 'zod';

export const CandidateKindSchema = z.enum([
  'react-component',
  'custom-hook',
  'utility',
  'service',
  'constant-group'
]);

export const SplitCandidateSchema = z
  .object({
    id: z.string().min(1, 'Candidate ID cannot be empty'),
    kind: CandidateKindSchema,
    symbolName: z.string().min(1, 'Symbol name cannot be empty'),
    lineStart: z.number().int('lineStart must be an integer').min(1, 'lineStart must be >= 1'),
    lineEnd: z.number().int('lineEnd must be an integer').min(1, 'lineEnd must be >= 1'),
    lines: z.number().int('lines must be an integer').min(1).optional(),
    targetFile: z
      .string()
      .min(1, 'targetFile cannot be empty')
      .refine((f) => !f.startsWith('/') && !f.includes('..') && !/^[a-zA-Z]:/.test(f), {
        message: 'targetFile must be a safe repository-relative path'
      }),
    reason: z.string().min(1, 'Reason cannot be empty'),
    confidence: z
      .number()
      .min(0, 'confidence must be >= 0')
      .max(1, 'confidence cannot exceed 1'),
    dependencies: z.array(z.string()),
    dependents: z.array(z.string()),
    externalImports: z.array(z.string()),
    capturedBindings: z.array(z.string()),
    safeForFutureExtraction: z.boolean(),
    safety: z.enum(['automatic-ready', 'manual-review', 'blocked']).optional(),
    risks: z.array(z.string())
  })
  .strict()
  .refine((data) => data.lineStart <= data.lineEnd, {
    message: 'lineStart must be less than or equal to lineEnd',
    path: ['lineEnd']
  });

export const SourceSummarySchema = z
  .object({
    lines: z.number().int().min(0),
    declarations: z.number().int().min(0),
    imports: z.number().int().min(0),
    exports: z.number().int().min(0)
  })
  .strict();

export const PlanSummarySchema = z
  .object({
    detected: z.number().int().min(0),
    safe: z.number().int().min(0),
    unsafe: z.number().int().min(0),
    conflicts: z.number().int().min(0)
  })
  .strict();

export const SplitPlanSchema = z
  .object({
    version: z.literal(1, {
      errorMap: () => ({ message: 'Plan version must be 1' })
    }),
    mode: z.literal('dry-run', {
      errorMap: () => ({ message: "Plan mode must be 'dry-run'" })
    }),
    sourceFile: z
      .string()
      .min(1, 'sourceFile cannot be empty')
      .refine((f) => !f.startsWith('/') && !f.includes('..') && !/^[a-zA-Z]:/.test(f), {
        message: 'sourceFile must be a repository-relative path'
      }),
    targetDirectory: z
      .string()
      .min(1, 'targetDirectory cannot be empty')
      .refine((d) => !d.startsWith('/') && !d.includes('..') && !/^[a-zA-Z]:/.test(d), {
        message: 'targetDirectory must be a repository-relative path'
      }),
    sourceSummary: SourceSummarySchema,
    candidates: z.array(SplitCandidateSchema),
    warnings: z.array(z.string()),
    summary: PlanSummarySchema
  })
  .strict()
  .refine((data) => {
    // Validate candidate IDs are unique
    const ids = new Set();
    for (const cand of data.candidates) {
      if (ids.has(cand.id)) return false;
      ids.add(cand.id);
    }
    return true;
  }, {
    message: 'Candidate IDs must be unique within a split plan',
    path: ['candidates']
  })
  .refine((data) => {
    // Validate summary count matches candidates array
    const safeCount = data.candidates.filter((c) => c.safeForFutureExtraction).length;
    const unsafeCount = data.candidates.filter((c) => !c.safeForFutureExtraction).length;
    return (
      data.summary.detected === data.candidates.length &&
      data.summary.safe === safeCount &&
      data.summary.unsafe === unsafeCount
    );
  }, {
    message: 'Summary counts must match candidates array counts',
    path: ['summary']
  });
