import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { generateCacheKey } from '../../src/cache/cache-key.js';
import { FileCache, CacheError } from '../../src/cache/file-cache.js';

describe('Local File Cache', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cache-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('generateCacheKey', () => {
    const baseParams = {
      source: 'export const x = 1;',
      relativePath: 'src/x.js',
      config: {
        analyzers: {
          eslint: { enabled: true },
          complexity: { enabled: true, maxCyclomaticComplexity: 10 },
          react: { enabled: true }
        },
        ai: {
          enabled: false,
          model: 'gpt-5.6-luna'
        }
      }
    };

    it('should generate a 64-character deterministic hex string', () => {
      const key1 = generateCacheKey(baseParams);
      const key2 = generateCacheKey(baseParams);

      expect(key1).toHaveLength(64);
      expect(key1).toMatch(/^[0-9a-f]{64}$/);
      expect(key1).toBe(key2);
    });

    it('should produce different keys when source code changes', () => {
      const key1 = generateCacheKey(baseParams);
      const key2 = generateCacheKey({ ...baseParams, source: 'export const x = 2;' });

      expect(key1).not.toBe(key2);
    });

    it('should produce different keys when analyzer configuration changes', () => {
      const key1 = generateCacheKey(baseParams);
      const key2 = generateCacheKey({
        ...baseParams,
        config: {
          ...baseParams.config,
          analyzers: {
            ...baseParams.config.analyzers,
            complexity: { enabled: true, maxCyclomaticComplexity: 5 }
          }
        }
      });

      expect(key1).not.toBe(key2);
    });

    it('should produce different keys when AI configuration changes', () => {
      const key1 = generateCacheKey(baseParams);
      const key2 = generateCacheKey({
        ...baseParams,
        config: {
          ...baseParams.config,
          ai: { enabled: true, model: 'openai/gpt-oss-120b' }
        }
      });

      expect(key1).not.toBe(key2);
    });

    it('should produce different keys when changed line scope changes', () => {
      const keyFull = generateCacheKey(baseParams);
      const keyScoped = generateCacheKey({
        ...baseParams,
        fileScope: {
          status: 'modified',
          changedLines: [{ start: 1, end: 10 }]
        }
      });

      expect(keyFull).not.toBe(keyScoped);
    });
  });

  describe('FileCache operations', () => {
    it('should safely do nothing when enabled is false', async () => {
      const cache = new FileCache({
        rootDirectory: tempDir,
        enabled: false
      });

      const key = 'a'.repeat(64);
      await cache.set(key, { findings: [], metrics: {} });
      const retrieved = await cache.get(key);

      expect(retrieved).toBeNull();
      const stats = cache.getStatistics();
      expect(stats.enabled).toBe(false);
      expect(stats.writes).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('should store, retrieve, and track statistics for valid cache entries', async () => {
      const cache = new FileCache({
        rootDirectory: tempDir,
        enabled: true
      });

      const key = 'b'.repeat(64);
      const entryData = {
        findings: [
          {
            ruleId: 'eqeqeq',
            severity: 'medium',
            message: 'Expected ===',
            lineStart: 1,
            columnStart: 1
          }
        ],
        metrics: {
          functions: [{ name: 'test', cyclomaticComplexity: 1 }]
        },
        astSummary: { imports: [], exports: [] },
        aiChunks: { created: 1, reviewed: 1, skipped: 0 }
      };

      await cache.set(key, entryData);
      const statsAfterSet = cache.getStatistics();
      expect(statsAfterSet.writes).toBe(1);

      const retrieved = await cache.get(key);
      expect(retrieved).toBeDefined();
      expect(retrieved.findings).toHaveLength(1);
      expect(retrieved.findings[0].ruleId).toBe('eqeqeq');
      expect(retrieved.metrics.functions).toHaveLength(1);

      const statsAfterGet = cache.getStatistics();
      expect(statsAfterGet.hits).toBe(1);
      expect(statsAfterGet.misses).toBe(0);
    });

    it('should never store source code or raw AST in cache file', async () => {
      const cache = new FileCache({
        rootDirectory: tempDir,
        enabled: true
      });

      const key = 'c'.repeat(64);
      await cache.set(key, {
        source: 'SECRET_API_KEY_OR_SOURCE',
        ast: { type: 'Program', body: [] },
        findings: [{ ruleId: 'no-console', severity: 'low', message: 'Avoid console' }]
      });

      const rawContent = await fs.readFile(
        path.join(tempDir, '.ai-code-reviewer-cache', `${key}.json`),
        'utf-8'
      );
      expect(rawContent).not.toContain('SECRET_API_KEY_OR_SOURCE');
      expect(rawContent).not.toContain('"body":[]');
      expect(rawContent).toContain('no-console');
    });

    it('should handle corrupted cache files gracefully without crashing', async () => {
      const cache = new FileCache({
        rootDirectory: tempDir,
        enabled: true
      });

      const key = 'd'.repeat(64);
      const cacheFilePath = path.join(tempDir, '.ai-code-reviewer-cache', `${key}.json`);
      await fs.mkdir(path.dirname(cacheFilePath), { recursive: true });
      await fs.writeFile(cacheFilePath, '{ corrupted invalid json content');

      const retrieved = await cache.get(key);
      expect(retrieved).toBeNull();

      const stats = cache.getStatistics();
      expect(stats.invalidEntries).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should evict oldest entries when maxEntries limit is exceeded', async () => {
      const cache = new FileCache({
        rootDirectory: tempDir,
        maxEntries: 2,
        enabled: true
      });

      const key1 = '1'.repeat(64);
      const key2 = '2'.repeat(64);
      const key3 = '3'.repeat(64);

      await cache.set(key1, { findings: [] });
      // Small delay to ensure distinct file mtime
      await new Promise((resolve) => setTimeout(resolve, 50));
      await cache.set(key2, { findings: [] });
      await new Promise((resolve) => setTimeout(resolve, 50));
      await cache.set(key3, { findings: [] });

      const files = await fs.readdir(path.join(tempDir, '.ai-code-reviewer-cache'));
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      expect(jsonFiles.length).toBeLessThanOrEqual(2);
      expect(cache.getStatistics().evictions).toBeGreaterThanOrEqual(1);
    });

    it('should clear cache directory and return deleted item count', async () => {
      const cache = new FileCache({
        rootDirectory: tempDir,
        enabled: true
      });

      await cache.set('e'.repeat(64), { findings: [] });
      await cache.set('f'.repeat(64), { findings: [] });

      const clearResult = await cache.clear();
      expect(clearResult.deletedCount).toBe(2);

      const exists = await fs
        .access(path.join(tempDir, '.ai-code-reviewer-cache'))
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });

    it('should throw CacheError if cache directory attempts path traversal', () => {
      expect(() => {
        new FileCache({
          rootDirectory: tempDir,
          directory: '../outside-cache'
        });
      }).toThrow(CacheError);
    });
  });
});
