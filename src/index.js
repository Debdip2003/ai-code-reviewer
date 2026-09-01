/**
 * Main public API entry point for the ai-code-reviewer package.
 */

// Configuration
export { DEFAULT_CONFIG } from './config/defaults.js';
export { loadConfig } from './config/load-config.js';

// Output Formatter
export { formatJsonOutput } from './cli/output/json.js';

// Scanner
export { discoverFiles } from './scanner/discover-files.js';
export { loadIgnoreRules, isIgnored } from './scanner/ignore-files.js';
export { getGitDiffFiles } from './scanner/git-diff.js';

// Parser
export { parseJavaScript } from './parser/parse-javascript.js';

// Analyzers
export { runEslintAnalyzer } from './analyzers/eslint-analyzer.js';
export { runComplexityAnalyzer } from './analyzers/complexity-analyzer.js';
export { runReactAnalyzer } from './analyzers/react-analyzer.js';

// AI Integration
export { getAiProvider } from './ai/provider.js';
export { buildReviewPrompt } from './ai/prompts.js';
export { chunkCode } from './ai/chunker.js';
export { reviewFindingSchema, reviewResponseSchema } from './ai/response-schema.js';

// Review Pipeline
export { runReview } from './review/review-engine.js';
export { deduplicateFindings } from './review/deduplicate.js';
export { filterBySeverity, SEVERITY_LEVELS, SEVERITY_WEIGHTS } from './review/severity.js';
