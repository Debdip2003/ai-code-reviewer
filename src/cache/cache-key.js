/**
 * Content-addressed cache key generator.
 * Produces deterministic SHA-256 cache keys from source hashes, relative paths,
 * review scopes, analyzer options, and AI configurations.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';

const PROMPT_VERSION = '1.0.0';
const RESPONSE_SCHEMA_VERSION = '1.0.0';

let packageVersion = '0.1.0';
try {
  const pkgUrl = new URL('../../package.json', import.meta.url);
  const pkg = JSON.parse(fs.readFileSync(pkgUrl, 'utf-8'));
  if (pkg.version) {
    packageVersion = pkg.version;
  }
} catch {
  // Fallback to default
}

/**
 * Deterministically sorts and serializes an arbitrary object to a stable JSON string.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${pairs.join(',')}}`;
}

/**
 * Computes a SHA-256 hexadecimal hash for a given string or buffer.
 *
 * @param {string | Buffer} input
 * @returns {string} 64-character lowercase hexadecimal hash.
 */
export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Generates a content-addressed SHA-256 cache key for an individual file review.
 *
 * @param {Object} params
 * @param {string} params.source - Complete source code of the file.
 * @param {string} params.relativePath - Normalized relative path of the file.
 * @param {Object} [params.config] - Reviewer configuration.
 * @param {Object} [params.fileScope] - Changed line scope for this file (null if full review).
 * @param {string} [params.customPackageVersion] - Override package version for testing.
 * @returns {string} 64-character SHA-256 cache key.
 */
export function generateCacheKey({
  source,
  relativePath,
  config = {},
  fileScope = null,
  customPackageVersion
}) {
  if (typeof source !== 'string') {
    throw new TypeError('source must be a string');
  }
  if (typeof relativePath !== 'string') {
    throw new TypeError('relativePath must be a string');
  }

  const sourceHash = sha256(source);

  const normalizedScope = fileScope
    ? {
        status: fileScope.status || 'modified',
        changedLines: Array.isArray(fileScope.changedLines)
          ? [...fileScope.changedLines].sort((a, b) => a.start - b.start)
          : null
      }
    : null;

  const analyzersConfig = {
    complexity: config.analyzers?.complexity || {},
    react: config.analyzers?.react || {},
    severityThreshold: config.severityThreshold || 'medium'
  };

  const isAiEnabled = Boolean(config.ai?.enabled);
  const aiConfig = isAiEnabled
    ? {
        enabled: true,
        provider: config.ai?.provider || 'openai',
        model: config.ai?.model || 'gpt-5.6-luna',
        reasoningEffort: config.ai?.reasoningEffort || 'low',
        maxOutputTokens: config.ai?.maxOutputTokens || 2000,
        promptVersion: PROMPT_VERSION,
        responseSchemaVersion: RESPONSE_SCHEMA_VERSION
      }
    : {
        enabled: false
      };

  const payload = {
    sourceHash,
    relativePath,
    scope: normalizedScope,
    packageVersion: customPackageVersion || packageVersion,
    analyzers: analyzersConfig,
    ai: aiConfig
  };

  const serialized = stableStringify(payload);
  return sha256(serialized);
}
