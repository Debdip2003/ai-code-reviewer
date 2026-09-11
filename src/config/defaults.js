/**
 * Default configuration constants for ACR (AI Code Reviewer).
 * Defined as an immutable, deep-frozen object to prevent accidental mutation.
 */

/**
 * @typedef {Object} ComplexityConfig
 * @property {boolean} enabled - Whether complexity analysis is active.
 * @property {number} maxFunctionLines - Maximum allowable line count for a function.
 * @property {number} maxParameters - Maximum allowable parameter count for a function.
 * @property {number} maxCyclomaticComplexity - Maximum allowable cyclomatic complexity score.
 * @property {number} maxNestingDepth - Maximum allowable decision nesting depth.
 */

/**
 * @typedef {Object} ReactConfig
 * @property {boolean} enabled - Whether React-specific analysis is active.
 * @property {boolean} hooks - Whether official React Hook rules are active.
 * @property {number} maxComponentLines - Maximum allowable line count for a React component.
 * @property {number} maxEffectLines - Maximum allowable line count for an effect callback.
 * @property {boolean} detectDirectStateMutation - Whether to detect direct React state mutations.
 * @property {boolean} detectArrayIndexKeys - Whether to detect array index used as React keys.
 */

/**
 * @typedef {Object} AnalyzersConfig
 * @property {ComplexityConfig} complexity - Complexity analyzer settings.
 * @property {ReactConfig} react - React analyzer settings.
 */

/**
 * @typedef {Object} AIConfig
 * @property {boolean} enabled - Whether AI review is active.
 * @property {'openai'} provider - AI provider identifier.
 * @property {string} model - Target AI model name.
 * @property {'none' | 'low' | 'medium' | 'high'} reasoningEffort - Reasoning effort level for reasoning-capable models.
 * @property {number} maxOutputTokens - Maximum allowable output tokens per request.
 * @property {number} maxRequests - Maximum number of AI requests allowed per review run.
 * @property {number} maxInputTokensPerChunk - Maximum input tokens permitted per chunk before skipping.
 * @property {number} maxEstimatedCostUsd - Maximum allowable estimated total cost in USD for the review run.
 * @property {number} timeoutMs - Timeout in milliseconds for AI requests.
 * @property {number} retries - Maximum retry attempts for transient failures.
 */

/**
 * @typedef {Object} CacheConfig
 * @property {boolean} enabled - Whether local result caching is active.
 * @property {string} directory - Relative directory path for storing cache files.
 * @property {number} maxEntries - Maximum number of cache entries to retain.
 */

/**
 * @typedef {Object} SplitterConfig
 * @property {boolean} enabled - Whether code splitting planner is enabled.
 * @property {number} minFileLines - Minimum file line count to suggest splitting.
 * @property {number} minCandidateLines - Minimum candidate line count to consider for extraction.
 * @property {string | null} targetDirectory - Target directory relative path or null.
 * @property {number} maxCandidates - Maximum number of split candidates to return.
 * @property {boolean} aiPlanning - Whether to use AI for candidate ranking and plan explanation.
 */

/**
 * @typedef {Object} ReviewerConfig
 * @property {readonly string[]} include - Glob patterns for files to include in the review.
 * @property {readonly string[]} exclude - Glob patterns for files and directories to exclude from the review.
 * @property {'terminal' | 'json'} outputFormat - Default output reporter format.
 * @property {number} concurrency - Maximum parallel file analyzers to run.
 * @property {'low' | 'medium' | 'high' | 'critical'} severityThreshold - Minimum issue severity to report.
 * @property {number} maxFiles - Maximum number of files to discover/review.
 * @property {number} maxFileSizeKb - Maximum size in kilobytes for a single file to be analyzed.
 * @property {AnalyzersConfig} analyzers - Analyzer-specific configuration settings.
 * @property {AIConfig} ai - AI review configuration settings.
 * @property {CacheConfig} cache - Cache configuration settings.
 * @property {SplitterConfig} splitter - Splitter configuration settings.
 */

/**
 * Immutable default configuration values.
 * @type {Readonly<ReviewerConfig>}
 */
export const DEFAULT_CONFIG = Object.freeze({
  include: Object.freeze([
    '**/*.js',
    '**/*.jsx',
    '**/*.mjs',
    '**/*.cjs'
  ]),
  exclude: Object.freeze([
    'node_modules/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '.next/**',
    'public/**',
    'vendor/**',
    '.acr-cache/**',
    '**/*.min.js'
  ]),
  outputFormat: 'terminal',
  concurrency: 2,
  severityThreshold: 'medium',
  maxFiles: 100,
  maxFileSizeKb: 150,
  analyzers: Object.freeze({
    complexity: Object.freeze({
      enabled: true,
      maxFunctionLines: 80,
      maxParameters: 5,
      maxCyclomaticComplexity: 10,
      maxNestingDepth: 4
    }),
    react: Object.freeze({
      enabled: true,
      hooks: true,
      maxComponentLines: 200,
      maxEffectLines: 50,
      detectDirectStateMutation: true,
      detectArrayIndexKeys: true
    })
  }),
  ai: Object.freeze({
    enabled: false,
    provider: 'openai',
    model: 'gpt-5.6-luna',
    reasoningEffort: 'low',
    maxOutputTokens: 2000,
    maxRequests: 20,
    maxInputTokensPerChunk: 12000,
    maxEstimatedCostUsd: 0.25,
    timeoutMs: 30000,
    retries: 2
  }),
  cache: Object.freeze({
    enabled: true,
    directory: '.acr-cache',
    maxEntries: 1000
  }),
  splitter: Object.freeze({
    enabled: true,
    minFileLines: 120,
    minCandidateLines: 20,
    targetDirectory: null,
    maxCandidates: 10,
    aiPlanning: false
  })
});

export const CONFIG_FILE_NAME = '.acrrc.json';
export const IGNORE_FILE_NAME = '.acrignore';

