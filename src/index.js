/**
 * Main public API entry point for the ai-code-reviewer package.
 * Pure programmatic exports with zero side-effects upon import.
 */

// Configuration
export { DEFAULT_CONFIG, CONFIG_FILE_NAME, IGNORE_FILE_NAME } from './config/defaults.js';
export { loadConfig, ConfigurationError } from './config/load-config.js';

// Scanner
export { discoverFiles } from './scanner/discover-files.js';

// Parser & AST
export { parseJavaScript, JavaScriptParseError } from './parser/parse-javascript.js';
export { parseFile } from './parser/parse-file.js';
export { summarizeAst } from './parser/summarize-ast.js';

// Analyzer
export { analyzeWithEslint, EslintAnalysisError } from './analyzers/eslint-analyzer.js';

// Review Model & Utilities
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
export { reviewRepository } from './review/review-engine.js';
