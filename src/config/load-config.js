/**
 * Configuration loader module.
 * Responsible for discovering, loading, and validating user configuration files
 * (.aireviewerrc.json) merged with default settings and CLI overrides.
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { DEFAULT_CONFIG, CONFIG_FILE_NAME } from './defaults.js';

/**
 * Loads environment variables from .env file into process.env if available.
 * @param {string} [dir=process.cwd()]
 */
export function loadEnvironment(dir = process.cwd()) {
  try {
    const envPath = path.join(dir, '.env');
    if (fsSync.existsSync(envPath)) {
      if (typeof process.loadEnvFile === 'function') {
        try {
          process.loadEnvFile(envPath);
        } catch {
          // ignore
        }
      }
      const content = fsSync.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (key === 'GROQ_API_KEY' || key === 'OPENAI_API_KEY') {
            if (!process.env[key] || val.startsWith('gsk_')) {
              process.env[key] = val;
            }
          }
        }
      }
    }
  } catch {
    // Ignore environment loading errors
  }
}

/**
 * Custom error class for configuration-related issues.
 */
export class ConfigurationError extends Error {
  /**
   * @param {string} message - Error description.
   * @param {unknown} [cause] - Underlying error cause.
   */
  constructor(message, cause) {
    super(message);
    this.name = 'ConfigurationError';
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Zod schema for complexity analyzer configuration.
 */
export const complexityConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    maxFunctionLines: z
      .number()
      .int('maxFunctionLines must be an integer')
      .min(10, 'maxFunctionLines must be at least 10')
      .max(1000, 'maxFunctionLines cannot exceed 1000')
      .optional(),
    maxParameters: z
      .number()
      .int('maxParameters must be an integer')
      .min(1, 'maxParameters must be at least 1')
      .max(20, 'maxParameters cannot exceed 20')
      .optional(),
    maxCyclomaticComplexity: z
      .number()
      .int('maxCyclomaticComplexity must be an integer')
      .min(1, 'maxCyclomaticComplexity must be at least 1')
      .max(100, 'maxCyclomaticComplexity cannot exceed 100')
      .optional(),
    maxNestingDepth: z
      .number()
      .int('maxNestingDepth must be an integer')
      .min(1, 'maxNestingDepth must be at least 1')
      .max(20, 'maxNestingDepth cannot exceed 20')
      .optional()
  })
  .strict();

/**
 * Zod schema for React analyzer configuration.
 */
export const reactConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    hooks: z.boolean().optional(),
    maxComponentLines: z
      .number()
      .int('maxComponentLines must be an integer')
      .min(20, 'maxComponentLines must be at least 20')
      .max(2000, 'maxComponentLines cannot exceed 2000')
      .optional(),
    maxEffectLines: z
      .number()
      .int('maxEffectLines must be an integer')
      .min(5, 'maxEffectLines must be at least 5')
      .max(500, 'maxEffectLines cannot exceed 500')
      .optional(),
    detectDirectStateMutation: z.boolean().optional(),
    detectArrayIndexKeys: z.boolean().optional()
  })
  .strict();

/**
 * Zod schema for AI review configuration.
 */
export const aiConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    provider: z.enum(['openai', 'groq'], {
      errorMap: () => ({ message: "provider must be 'openai' or 'groq'" })
    }).optional(),
    model: z.string().min(1, 'model cannot be empty string').optional(),
    reasoningEffort: z
      .enum(['none', 'low', 'medium', 'high'], {
        errorMap: () => ({ message: "reasoningEffort must be 'none', 'low', 'medium', or 'high'" })
      })
      .optional(),
    maxOutputTokens: z
      .number()
      .int('maxOutputTokens must be an integer')
      .min(100, 'maxOutputTokens must be at least 100')
      .max(20000, 'maxOutputTokens cannot exceed 20000')
      .optional(),
    maxRequests: z
      .number()
      .int('maxRequests must be an integer')
      .min(1, 'maxRequests must be at least 1')
      .max(100, 'maxRequests cannot exceed 100')
      .optional(),
    maxInputTokensPerChunk: z
      .number()
      .int('maxInputTokensPerChunk must be an integer')
      .min(500, 'maxInputTokensPerChunk must be at least 500')
      .max(100000, 'maxInputTokensPerChunk cannot exceed 100000')
      .optional(),
    maxEstimatedCostUsd: z
      .number()
      .positive('maxEstimatedCostUsd must be greater than zero')
      .max(100, 'maxEstimatedCostUsd cannot exceed 100')
      .optional(),
    timeoutMs: z
      .number()
      .int('timeoutMs must be an integer')
      .min(1000, 'timeoutMs must be at least 1000')
      .max(120000, 'timeoutMs cannot exceed 120000')
      .optional(),
    retries: z
      .number()
      .int('retries must be an integer')
      .min(0, 'retries cannot be negative')
      .max(5, 'retries cannot exceed 5')
      .optional()
  })
  .strict();

/**
 * Zod schema for cache configuration.
 */
export const cacheConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    directory: z
      .string()
      .min(1, 'Cache directory cannot be empty string')
      .refine((dir) => !path.isAbsolute(dir), 'Cache directory must be a relative path')
      .refine(
        (dir) => !dir.split(/[/\\]/).includes('..'),
        'Cache directory cannot contain directory traversal (..)'
      )
      .optional(),
    maxEntries: z
      .number()
      .int('maxEntries must be an integer')
      .min(10, 'maxEntries must be at least 10')
      .max(10000, 'maxEntries cannot exceed 10000')
      .optional()
  })
  .strict();

/**
 * Zod schema for analyzers configuration group.
 */
export const analyzersConfigSchema = z
  .object({
    complexity: complexityConfigSchema.optional(),
    react: reactConfigSchema.optional()
  })
  .strict();

/**
 * Zod schema for validating user-provided configuration objects.
 * All properties are optional to allow partial overrides of defaults.
 * Unknown properties are rejected.
 */
export const userConfigSchema = z
  .object({
    include: z
      .array(z.string().min(1, 'Include pattern cannot be empty string'))
      .min(1, 'Include patterns must contain at least one pattern')
      .optional(),
    exclude: z
      .array(z.string().min(1, 'Exclude pattern cannot be empty string'))
      .optional(),
    outputFormat: z
      .enum(['terminal', 'json'], {
        errorMap: () => ({ message: "outputFormat must be either 'terminal' or 'json'" })
      })
      .optional(),
    concurrency: z
      .number()
      .int('concurrency must be an integer')
      .min(1, 'concurrency must be at least 1')
      .max(10, 'concurrency cannot exceed 10')
      .optional(),
    severityThreshold: z
      .enum(['low', 'medium', 'high', 'critical'], {
        errorMap: () => ({ message: "severityThreshold must be 'low', 'medium', 'high', or 'critical'" })
      })
      .optional(),
    maxFiles: z
      .number()
      .int('maxFiles must be an integer')
      .positive('maxFiles must be a positive integer')
      .max(100000, 'maxFiles cannot exceed 100000')
      .optional(),
    maxFileSizeKb: z
      .number()
      .int('maxFileSizeKb must be an integer')
      .positive('maxFileSizeKb must be a positive integer')
      .max(500000, 'maxFileSizeKb cannot exceed 500000')
      .optional(),
    analyzers: analyzersConfigSchema.optional(),
    ai: aiConfigSchema.optional(),
    cache: cacheConfigSchema.optional()
  })
  .strict();

/**
 * Formats Zod validation issues into a human-readable message.
 * @param {z.ZodError} zodError - The Zod validation error.
 * @param {string} sourceDescription - Description of the source being validated.
 * @returns {string} Formatted error string.
 */
function formatZodError(zodError, sourceDescription) {
  const issues = zodError.errors
    .map((err) => {
      const fieldPath = err.path.length > 0 ? err.path.join('.') : 'root';
      return `  - ${fieldPath}: ${err.message}`;
    })
    .join('\n');
  return `Invalid configuration in ${sourceDescription}:\n${issues}`;
}

/**
 * Strips keys with `undefined` values from an object.
 * @param {Record<string, unknown>} [obj={}]
 * @returns {Record<string, unknown>}
 */
function stripUndefined(obj = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        clean[key] = stripUndefined(value);
      } else {
        clean[key] = value;
      }
    }
  }
  return clean;
}

/**
 * Loads project configuration from disk or returns default configuration merged with CLI overrides.
 *
 * @param {Object} [options={}]
 * @param {string} [options.rootDirectory] - Project root directory to search for configuration.
 * @param {Record<string, unknown>} [options.cliOverrides] - CLI options that override file and default settings.
 * @returns {Promise<import('./defaults.js').ReviewerConfig & { rootDirectory: string }>} Resolved configuration object.
 * @throws {ConfigurationError} When configuration file syntax or validation fails.
 */
export async function loadConfig(options = {}) {
  let rootDirectory = path.resolve(options.rootDirectory || process.cwd());

  try {
    const stat = await fs.stat(rootDirectory);
    if (stat.isFile()) {
      rootDirectory = path.dirname(rootDirectory);
    }
  } catch {
    // Directory will be validated during scanning or fallback to defaults
  }

  loadEnvironment(rootDirectory);
  const configFilePath = path.join(rootDirectory, CONFIG_FILE_NAME);

  let fileConfig = {};

  try {
    const rawContent = await fs.readFile(configFilePath, 'utf-8');
    try {
      fileConfig = JSON.parse(rawContent);
    } catch (parseError) {
      throw new ConfigurationError(
        `Failed to parse configuration file at "${configFilePath}": Invalid JSON (${parseError.message})`,
        parseError
      );
    }

    const validationResult = userConfigSchema.safeParse(fileConfig);
    if (!validationResult.success) {
      throw new ConfigurationError(
        formatZodError(validationResult.error, `"${configFilePath}"`),
        validationResult.error
      );
    }
    fileConfig = validationResult.data;
  } catch (err) {
    if (err instanceof ConfigurationError) {
      throw err;
    }
    if (err.code !== 'ENOENT') {
      throw new ConfigurationError(
        `Failed to read configuration file at "${configFilePath}": ${err.message}`,
        err
      );
    }
    // File not found is expected; proceed with defaults
  }

  // Clean CLI overrides to remove undefined values
  const cleanCliOverrides = stripUndefined(options.cliOverrides);

  if (Object.keys(cleanCliOverrides).length > 0) {
    const cliValidation = userConfigSchema.safeParse(cleanCliOverrides);
    if (!cliValidation.success) {
      throw new ConfigurationError(
        formatZodError(cliValidation.error, 'CLI overrides'),
        cliValidation.error
      );
    }
  }

  // Precedence: DEFAULT_CONFIG < fileConfig < cleanCliOverrides
  const mergedInclude = cleanCliOverrides.include ?? fileConfig.include ?? DEFAULT_CONFIG.include;
  const mergedExclude = cleanCliOverrides.exclude ?? fileConfig.exclude ?? DEFAULT_CONFIG.exclude;

  const defaultComplexity = DEFAULT_CONFIG.analyzers.complexity;
  const fileComplexity = fileConfig.analyzers?.complexity || {};
  const cliComplexity = cleanCliOverrides.analyzers?.complexity || {};

  const mergedComplexity = {
    enabled: cliComplexity.enabled ?? fileComplexity.enabled ?? defaultComplexity.enabled,
    maxFunctionLines:
      cliComplexity.maxFunctionLines ?? fileComplexity.maxFunctionLines ?? defaultComplexity.maxFunctionLines,
    maxParameters: cliComplexity.maxParameters ?? fileComplexity.maxParameters ?? defaultComplexity.maxParameters,
    maxCyclomaticComplexity:
      cliComplexity.maxCyclomaticComplexity ??
      fileComplexity.maxCyclomaticComplexity ??
      defaultComplexity.maxCyclomaticComplexity,
    maxNestingDepth:
      cliComplexity.maxNestingDepth ?? fileComplexity.maxNestingDepth ?? defaultComplexity.maxNestingDepth
  };

  const defaultReact = DEFAULT_CONFIG.analyzers.react;
  const fileReact = fileConfig.analyzers?.react || {};
  const cliReact = cleanCliOverrides.analyzers?.react || {};

  const mergedReact = {
    enabled: cliReact.enabled ?? fileReact.enabled ?? defaultReact.enabled,
    hooks: cliReact.hooks ?? fileReact.hooks ?? defaultReact.hooks,
    maxComponentLines: cliReact.maxComponentLines ?? fileReact.maxComponentLines ?? defaultReact.maxComponentLines,
    maxEffectLines: cliReact.maxEffectLines ?? fileReact.maxEffectLines ?? defaultReact.maxEffectLines,
    detectDirectStateMutation:
      cliReact.detectDirectStateMutation ?? fileReact.detectDirectStateMutation ?? defaultReact.detectDirectStateMutation,
    detectArrayIndexKeys:
      cliReact.detectArrayIndexKeys ?? fileReact.detectArrayIndexKeys ?? defaultReact.detectArrayIndexKeys
  };

  const defaultAi = DEFAULT_CONFIG.ai;
  const fileAi = fileConfig.ai || {};
  const cliAi = cleanCliOverrides.ai || {};

  const mergedAi = {
    enabled: cliAi.enabled ?? fileAi.enabled ?? defaultAi.enabled,
    provider: cliAi.provider ?? fileAi.provider ?? defaultAi.provider,
    model: cliAi.model ?? fileAi.model ?? defaultAi.model,
    reasoningEffort: cliAi.reasoningEffort ?? fileAi.reasoningEffort ?? defaultAi.reasoningEffort,
    maxOutputTokens: cliAi.maxOutputTokens ?? fileAi.maxOutputTokens ?? defaultAi.maxOutputTokens,
    maxRequests: cliAi.maxRequests ?? fileAi.maxRequests ?? defaultAi.maxRequests,
    maxInputTokensPerChunk:
      cliAi.maxInputTokensPerChunk ?? fileAi.maxInputTokensPerChunk ?? defaultAi.maxInputTokensPerChunk,
    maxEstimatedCostUsd:
      cliAi.maxEstimatedCostUsd ?? fileAi.maxEstimatedCostUsd ?? defaultAi.maxEstimatedCostUsd,
    timeoutMs: cliAi.timeoutMs ?? fileAi.timeoutMs ?? defaultAi.timeoutMs,
    retries: cliAi.retries ?? fileAi.retries ?? defaultAi.retries
  };

  const defaultCache = DEFAULT_CONFIG.cache;
  const fileCache = fileConfig.cache || {};
  const cliCache = cleanCliOverrides.cache || {};

  const mergedCache = {
    enabled: cliCache.enabled ?? fileCache.enabled ?? defaultCache.enabled,
    directory: cliCache.directory ?? fileCache.directory ?? defaultCache.directory,
    maxEntries: cliCache.maxEntries ?? fileCache.maxEntries ?? defaultCache.maxEntries
  };

  return {
    include: [...mergedInclude],
    exclude: [...mergedExclude],
    outputFormat: cleanCliOverrides.outputFormat ?? fileConfig.outputFormat ?? DEFAULT_CONFIG.outputFormat,
    concurrency: cleanCliOverrides.concurrency ?? fileConfig.concurrency ?? DEFAULT_CONFIG.concurrency,
    severityThreshold: cleanCliOverrides.severityThreshold ?? fileConfig.severityThreshold ?? DEFAULT_CONFIG.severityThreshold,
    maxFiles: cleanCliOverrides.maxFiles ?? fileConfig.maxFiles ?? DEFAULT_CONFIG.maxFiles,
    maxFileSizeKb: cleanCliOverrides.maxFileSizeKb ?? fileConfig.maxFileSizeKb ?? DEFAULT_CONFIG.maxFileSizeKb,
    analyzers: {
      complexity: mergedComplexity,
      react: mergedReact
    },
    ai: mergedAi,
    cache: mergedCache,
    rootDirectory
  };
}
