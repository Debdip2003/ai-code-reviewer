/**
 * Content-addressed disk file cache implementation.
 * Stores normalized findings, metrics, and summary data atomically.
 * Never stores source code, ASTs, API keys, or raw provider prompts/responses.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Custom error class for cache operations.
 */
export class CacheError extends Error {
  /**
   * @param {string} message - Error description.
   * @param {unknown} [cause] - Underlying cause.
   */
  constructor(message, cause) {
    super(message);
    this.name = 'CacheError';
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Validates that a cache directory path is safe, relative, and strictly contained within the project root.
 *
 * @param {string} rootDirectory - Project root directory.
 * @param {string} cacheDir - Configured cache directory path.
 * @returns {string} Normalized absolute path to the verified cache directory.
 * @throws {CacheError} If directory path is invalid or attempts traversal.
 */
function resolveSafeCacheDirectory(rootDirectory, cacheDir) {
  if (typeof cacheDir !== 'string' || cacheDir.trim().length === 0) {
    throw new CacheError('Cache directory must be a non-empty string.');
  }

  if (path.isAbsolute(cacheDir)) {
    throw new CacheError(`Cache directory "${cacheDir}" cannot be an absolute path.`);
  }

  const parts = cacheDir.split(/[/\\]/);
  if (parts.includes('..')) {
    throw new CacheError(`Cache directory "${cacheDir}" cannot contain parent directory traversal (..).`);
  }

  const resolvedRoot = path.resolve(rootDirectory);
  const resolvedCache = path.resolve(resolvedRoot, cacheDir);

  const relative = path.relative(resolvedRoot, resolvedCache);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new CacheError(`Resolved cache path "${resolvedCache}" escapes the project root "${resolvedRoot}".`);
  }

  return resolvedCache;
}

/**
 * Sanitizes data before caching to guarantee no source code, ASTs, or API keys are stored.
 *
 * @param {Object} data
 * @returns {Object} Clean cache payload.
 */
function sanitizeCacheData(data) {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const findings = Array.isArray(data.findings)
    ? data.findings.map((f) => ({
        source: f.source,
        ruleId: f.ruleId,
        severity: f.severity,
        category: f.category,
        title: f.title,
        message: f.message,
        relativePath: f.relativePath,
        lineStart: f.lineStart,
        columnStart: f.columnStart,
        lineEnd: f.lineEnd,
        columnEnd: f.columnEnd,
        suggestion: f.suggestion || null,
        fixable: Boolean(f.fixable),
        confidence: typeof f.confidence === 'number' ? f.confidence : undefined
      }))
    : [];

  const metrics = data.metrics
    ? {
        functions: Array.isArray(data.metrics.functions) ? data.metrics.functions : [],
        react: data.metrics.react || {}
      }
    : { functions: [], react: {} };

  const astSummary = data.astSummary
    ? {
        relativePath: data.astSummary.relativePath,
        imports: Array.isArray(data.astSummary.imports) ? data.astSummary.imports : [],
        exports: Array.isArray(data.astSummary.exports) ? data.astSummary.exports : [],
        functions: Array.isArray(data.astSummary.functions) ? data.astSummary.functions : [],
        classes: Array.isArray(data.astSummary.classes) ? data.astSummary.classes : [],
        jsxElements: Array.isArray(data.astSummary.jsxElements) ? data.astSummary.jsxElements : [],
        metrics: data.astSummary.metrics || {}
      }
    : null;

  const aiChunks = data.aiChunks
    ? {
        created: data.aiChunks.created || 0,
        reviewed: data.aiChunks.reviewed || 0,
        skipped: data.aiChunks.skipped || 0
      }
    : null;

  return {
    findings,
    metrics,
    astSummary,
    aiChunks
  };
}

/**
 * Content-addressed file cache manager.
 */
export class FileCache {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.rootDirectory=process.cwd()] - Project root directory.
   * @param {string} [options.directory='.ai-code-reviewer-cache'] - Cache directory.
   * @param {number} [options.maxEntries=1000] - Maximum number of entries to retain.
   * @param {boolean} [options.enabled=true] - Whether caching is enabled.
   */
  constructor(options = {}) {
    this.rootDirectory = path.resolve(options.rootDirectory || process.cwd());
    this.enabled = options.enabled !== undefined ? Boolean(options.enabled) : true;
    this.maxEntries = typeof options.maxEntries === 'number' ? options.maxEntries : 1000;

    const dirName = options.directory || '.ai-code-reviewer-cache';
    this.cacheDirectory = resolveSafeCacheDirectory(this.rootDirectory, dirName);

    this.hits = 0;
    this.misses = 0;
    this.writes = 0;
    this.evictions = 0;
    this.invalidEntries = 0;
  }

  /**
   * Retrieves a cached result by SHA-256 key.
   *
   * @param {string} key - SHA-256 cache key.
   * @returns {Promise<Object | null>} Cached result or null on miss/error.
   */
  async get(key) {
    if (!this.enabled || !key || typeof key !== 'string') {
      return null;
    }

    const filePath = path.join(this.cacheDirectory, `${key}.json`);

    let content;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      this.misses++;
      return null;
    }

    let entry;
    try {
      entry = JSON.parse(content);
    } catch {
      this.invalidEntries++;
      this.misses++;
      return null;
    }

    if (!entry || typeof entry !== 'object' || entry.key !== key || !entry.data) {
      this.invalidEntries++;
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.data;
  }

  /**
   * Atomically stores a validated result in the cache.
   *
   * @param {string} key - SHA-256 cache key.
   * @param {Object} data - Clean result object.
   * @returns {Promise<boolean>} True if written successfully.
   */
  async set(key, data) {
    if (!this.enabled || !key || typeof key !== 'string' || !data) {
      return false;
    }

    const cleanData = sanitizeCacheData(data);
    const payload = JSON.stringify(
      {
        key,
        cachedAt: new Date().toISOString(),
        data: cleanData
      },
      null,
      2
    );

    try {
      await fs.mkdir(this.cacheDirectory, { recursive: true });

      const finalPath = path.join(this.cacheDirectory, `${key}.json`);
      const tempPath = path.join(
        this.cacheDirectory,
        `${key}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
      );

      await fs.writeFile(tempPath, payload, 'utf-8');
      await fs.rename(tempPath, finalPath);

      this.writes++;
      await this.enforceMaxEntries();
      return true;
    } catch {
      // Non-fatal: cache write failure does not stop analysis
      return false;
    }
  }

  /**
   * Evicts oldest cache entries if total entries exceed maxEntries.
   *
   * @returns {Promise<number>} Number of evicted entries.
   */
  async enforceMaxEntries() {
    if (!this.enabled || this.maxEntries <= 0) {
      return 0;
    }

    try {
      const files = await fs.readdir(this.cacheDirectory);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      if (jsonFiles.length <= this.maxEntries) {
        return 0;
      }

      const fileStats = [];
      for (const fileName of jsonFiles) {
        const fullPath = path.join(this.cacheDirectory, fileName);
        try {
          const stat = await fs.stat(fullPath);
          fileStats.push({ path: fullPath, mtimeMs: stat.mtimeMs });
        } catch {
          // Ignore files deleted concurrently
        }
      }

      // Sort oldest first
      fileStats.sort((a, b) => a.mtimeMs - b.mtimeMs);

      const toRemove = fileStats.slice(0, fileStats.length - this.maxEntries);
      let removedCount = 0;

      for (const item of toRemove) {
        try {
          await fs.unlink(item.path);
          removedCount++;
        } catch {
          // Ignore concurrent unlink errors
        }
      }

      this.evictions += removedCount;
      return removedCount;
    } catch {
      return 0;
    }
  }

  /**
   * Safely clears all cache files within the verified cache directory.
   *
   * @returns {Promise<{ cleared: boolean, deletedCount: number, directory: string }>}
   */
  async clear() {
    try {
      let files = [];
      try {
        files = await fs.readdir(this.cacheDirectory);
      } catch (readErr) {
        if (readErr.code === 'ENOENT') {
          return {
            cleared: true,
            deletedCount: 0,
            directory: this.cacheDirectory
          };
        }
        throw readErr;
      }

      const jsonOrTmp = files.filter((f) => f.endsWith('.json') || f.endsWith('.tmp'));
      const deletedCount = jsonOrTmp.length;

      await fs.rm(this.cacheDirectory, { recursive: true, force: true });

      return {
        cleared: true,
        deletedCount,
        directory: this.cacheDirectory
      };
    } catch (err) {
      throw new CacheError(`Failed to clear cache directory at "${this.cacheDirectory}": ${err.message}`, err);
    }
  }

  /**
   * Returns runtime cache statistics.
   *
   * @returns {{ enabled: boolean, hits: number, misses: number, writes: number, evictions: number, invalidEntries: number, directory: string }}
   */
  getStatistics() {
    return {
      enabled: this.enabled,
      hits: this.hits,
      misses: this.misses,
      writes: this.writes,
      evictions: this.evictions,
      invalidEntries: this.invalidEntries,
      directory: this.cacheDirectory
    };
  }
}
