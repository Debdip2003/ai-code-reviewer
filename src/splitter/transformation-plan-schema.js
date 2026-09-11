/**
 * Zod Schema definitions for ACR Code Splitting Transformation Plans (Phase 2 Preview & Phase 3 Apply).
 * Enforces structured, validated representations of module extractions and applied operations.
 */

import { z } from 'zod';
import { CandidateKindSchema } from './split-plan-schema.js';

export const SafetyLevelSchema = z.enum([
  'automatic-ready',
  'manual-review',
  'blocked'
]);

export const CapturedBindingResolutionSchema = z.enum([
  'prop',
  'parameter',
  'import',
  'move-with-candidate',
  'remain-in-source',
  'unresolved'
]);

export const CapturedBindingUsageSchema = z.enum([
  'read',
  'call',
  'mutate',
  'pass',
  'other'
]);

export const CapturedBindingContractSchema = z
  .object({
    name: z.string().min(1),
    usage: CapturedBindingUsageSchema.default('read'),
    resolution: CapturedBindingResolutionSchema,
    propName: z.string().optional(),
    parameterName: z.string().optional(),
    sourcePath: z.string().optional()
  })
  .strict();

export const ContractImportSchema = z
  .object({
    source: z.string().min(1),
    imported: z.array(z.string()),
    type: z.enum(['named', 'default', 'namespace', 'side-effect', 'type-only']),
    isExternal: z.boolean().default(true)
  })
  .strict();

export const ContractExportSchema = z
  .object({
    name: z.string().min(1),
    type: z.enum(['named', 'default'])
  })
  .strict();

export const ExtractionContractSchema = z
  .object({
    symbol: z.string().min(1),
    kind: CandidateKindSchema,
    capturedBindings: z.array(CapturedBindingContractSchema),
    imports: z.array(ContractImportSchema),
    exports: z.array(ContractExportSchema),
    movedDependencies: z.array(z.string()),
    remainingDependencies: z.array(z.string())
  })
  .strict();

export const PlanOperationSchema = z
  .object({
    type: z.enum(['create-file', 'update-file']),
    path: z.string().min(1)
  })
  .strict();

export const TransformationValidationSchema = z
  .object({
    sourceParseable: z.boolean(),
    targetParseable: z.boolean(),
    unresolvedBindings: z.array(z.string()),
    nameCollisions: z.array(z.string()),
    cycles: z.array(z.string()),
    errors: z.array(z.string()),
    warnings: z.array(z.string())
  })
  .strict();

export const TransformationPreviewContentSchema = z
  .object({
    source: z.string(),
    target: z.string()
  })
  .strict();

export const TransformationPlanCandidateSchema = z
  .object({
    id: z.string().min(1),
    symbol: z.string().min(1),
    kind: CandidateKindSchema,
    safety: SafetyLevelSchema
  })
  .strict();

export const TransformationPlanSchema = z
  .object({
    version: z.literal(2, {
      errorMap: () => ({ message: 'Transformation plan version must be 2' })
    }),
    mode: z.literal('preview', {
      errorMap: () => ({ message: "Transformation plan mode must be 'preview'" })
    }),
    sourceFile: z.string().min(1),
    candidate: TransformationPlanCandidateSchema,
    targetFile: z.string().min(1),
    contract: ExtractionContractSchema,
    operations: z.array(PlanOperationSchema),
    validation: TransformationValidationSchema,
    sourceHash: z.string().length(64).optional(),
    before: z
      .object({
        sourceHash: z.string().length(64),
        targetExisted: z.boolean()
      })
      .strict()
      .optional(),
    filesModified: z.literal(0, {
      errorMap: () => ({ message: 'filesModified must be 0 in preview mode' })
    }),
    preview: TransformationPreviewContentSchema.optional()
  })
  .strict();

export const ApplyResultSchema = z
  .object({
    success: z.boolean(),
    mode: z.literal('apply'),
    operationId: z.string().min(1),
    sourceFile: z.string().min(1),
    targetFile: z.string().min(1),
    candidate: z.object({
      id: z.string().min(1),
      symbol: z.string().min(1),
      kind: CandidateKindSchema.optional()
    }).passthrough(),
    files: z
      .object({
        updated: z.array(z.string()),
        created: z.array(z.string())
      })
      .strict(),
    validation: z
      .object({
        preWrite: z.string(),
        postWrite: z.string()
      })
      .strict(),
    backup: z
      .object({
        created: z.boolean(),
        operationId: z.string()
      })
      .strict()
  })
  .passthrough();
