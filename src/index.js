/**
 * Main public API entry point for ACR (Autonomous Code Reviewer).
 * Pure programmatic exports with zero side-effects upon import.
 */

// Exit Codes & Logging
export { EXIT_CODES } from './review/exit-codes.js';
export { Logger, logger } from './utils/logger.js';

// Configuration
export { DEFAULT_CONFIG, CONFIG_FILE_NAME, IGNORE_FILE_NAME } from './config/defaults.js';
export { loadConfig, ConfigurationError } from './config/load-config.js';

// Scanner & Git
export { discoverFiles } from './scanner/discover-files.js';
export {
  findGitRoot,
  getChangedFiles,
  getChangedLineRanges,
  GitDiffError
} from './scanner/git-diff.js';

// Parser & AST
export { parseJavaScript, JavaScriptParseError } from './parser/parse-javascript.js';
export { parseFile } from './parser/parse-file.js';
export { summarizeAst } from './parser/summarize-ast.js';

// Analyzers
export { analyzeWithEslint, EslintAnalysisError } from './analyzers/eslint-analyzer.js';
export { analyzeComplexity, ComplexityAnalysisError } from './analyzers/complexity-analyzer.js';
export { analyzeReact, ReactAnalysisError } from './analyzers/react-analyzer.js';

// Review Model, Scope & Utilities
export { FindingSchema, FindingSeverity, validateFinding } from './review/finding.js';
export {
  SEVERITY_ORDER,
  SEVERITY_LEVELS,
  isAtOrAboveSeverity,
  filterFindingsBySeverity,
  countFindingsBySeverity,
  sortFindings
} from './review/severity.js';
export { deduplicateFindings } from './review/deduplicate.js';
export { filterFindingsByScope, findingIntersectsChangedLines } from './review/filter-by-scope.js';
export { reviewRepository } from './review/review-engine.js';

// Cache
export { FileCache, CacheError } from './cache/file-cache.js';
export { generateCacheKey } from './cache/cache-key.js';

// AI Review Foundation
export {
  AIProvider,
  AIProviderError,
  createAIProvider
} from './ai/provider.js';
export {
  AIFindingSchema,
  AIReviewResponseSchema
} from './ai/response-schema.js';
export { createSemanticChunks } from './ai/chunker.js';
export { reviewWithAI } from './ai/review-with-ai.js';

// CLI Diagnostics & Actions
export { runDoctorChecks, doctorAction } from './cli/commands/doctor.js';
export { reviewAction } from './cli/commands/review.js';
export { initAction } from './cli/commands/init.js';
export { cacheClearAction } from './cli/commands/cache.js';
export { splitAction } from './cli/commands/split.js';

// Code Splitter (V2 Experimental)
export { createSplitPlan } from './splitter/split-planner.js';
export { createTransformationPlan } from './splitter/transformation-planner.js';
export { buildDependencyGraph } from './splitter/dependency-graph.js';
export { detectSplitCandidates } from './splitter/candidate-detector.js';
export { validateSplitPlan } from './splitter/plan-validator.js';
export { createExtractionContract } from './splitter/extraction-contract.js';
export { planReactProps } from './splitter/prop-planner.js';
export { planDependencyPlacement } from './splitter/dependency-placement.js';
export { planImports } from './splitter/import-planner.js';
export { planExports } from './splitter/export-planner.js';
export { buildLocalModuleGraph } from './splitter/module-graph.js';
export { detectImportCycles } from './splitter/cycle-detector.js';
export { generateTransformationPreviews } from './splitter/preview-generator.js';
export { toKebabId, parseAst, generateCode } from './splitter/ast-utils.js';
export { SplitPlanSchema, SplitCandidateSchema } from './splitter/split-plan-schema.js';
export { TransformationPlanSchema } from './splitter/transformation-plan-schema.js';
export {
  SplitError,
  SplitInputError,
  SplitValidationError,
  SplitAIPlanningError,
  CandidateNotFoundError,
  UnsafeExtractionError,
  TargetCollisionError,
  TargetOutsideProjectError,
  UnresolvedBindingError,
  CircularDependencyError,
  PreviewGenerationError,
  TransformationValidationError
} from './splitter/split-errors.js';


