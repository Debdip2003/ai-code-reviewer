import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, ConfigurationError } from '../../src/config/load-config.js';
import { DEFAULT_CONFIG, CONFIG_FILE_NAME } from '../../src/config/defaults.js';

describe('loadConfig', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-reviewer-config-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should return default configuration when config file is missing', async () => {
    const config = await loadConfig({ rootDirectory: tempDir });

    expect(config.include).toEqual(DEFAULT_CONFIG.include);
    expect(config.exclude).toEqual(DEFAULT_CONFIG.exclude);
    expect(config.outputFormat).toBe(DEFAULT_CONFIG.outputFormat);
    expect(config.concurrency).toBe(DEFAULT_CONFIG.concurrency);
    expect(config.severityThreshold).toBe(DEFAULT_CONFIG.severityThreshold);
    expect(config.maxFiles).toBe(DEFAULT_CONFIG.maxFiles);
    expect(config.maxFileSizeKb).toBe(DEFAULT_CONFIG.maxFileSizeKb);
    expect(config.analyzers).toEqual(DEFAULT_CONFIG.analyzers);
    expect(config.rootDirectory).toBe(path.resolve(tempDir));
  });

  it('should merge partial user configuration with defaults', async () => {
    const userConfig = {
      concurrency: 6,
      severityThreshold: 'high',
      maxFiles: 50
    };
    await fs.writeFile(
      path.join(tempDir, CONFIG_FILE_NAME),
      JSON.stringify(userConfig, null, 2)
    );

    const config = await loadConfig({ rootDirectory: tempDir });

    expect(config.concurrency).toBe(6);
    expect(config.severityThreshold).toBe('high');
    expect(config.maxFiles).toBe(50);
    // Defaults preserved for unspecified keys
    expect(config.outputFormat).toBe('terminal');
    expect(config.maxFileSizeKb).toBe(150);
    expect(config.include).toEqual(DEFAULT_CONFIG.include);
    expect(config.exclude).toEqual(DEFAULT_CONFIG.exclude);
    expect(config.analyzers.complexity).toEqual(DEFAULT_CONFIG.analyzers.complexity);
    expect(config.analyzers.react).toEqual(DEFAULT_CONFIG.analyzers.react);
  });

  it('should merge partial nested complexity and react configuration independently', async () => {
    const userConfig = {
      analyzers: {
        complexity: {
          maxCyclomaticComplexity: 15
        },
        react: {
          maxComponentLines: 300,
          hooks: false
        }
      }
    };
    await fs.writeFile(
      path.join(tempDir, CONFIG_FILE_NAME),
      JSON.stringify(userConfig, null, 2)
    );

    const config = await loadConfig({ rootDirectory: tempDir });

    expect(config.analyzers.complexity.maxCyclomaticComplexity).toBe(15);
    expect(config.analyzers.complexity.enabled).toBe(true);
    expect(config.analyzers.complexity.maxFunctionLines).toBe(80);

    expect(config.analyzers.react.maxComponentLines).toBe(300);
    expect(config.analyzers.react.hooks).toBe(false);
    expect(config.analyzers.react.enabled).toBe(true);
    expect(config.analyzers.react.maxEffectLines).toBe(50);
    expect(config.analyzers.react.detectDirectStateMutation).toBe(true);
  });

  it('should apply precedence: DEFAULT_CONFIG < config file < CLI overrides', async () => {
    const userConfig = {
      outputFormat: 'json',
      concurrency: 4,
      maxFiles: 30,
      analyzers: {
        complexity: {
          maxParameters: 8
        }
      }
    };
    await fs.writeFile(
      path.join(tempDir, CONFIG_FILE_NAME),
      JSON.stringify(userConfig, null, 2)
    );

    const cliOverrides = {
      concurrency: 8,
      maxFiles: 10
    };

    const config = await loadConfig({
      rootDirectory: tempDir,
      cliOverrides
    });

    // Overridden by CLI
    expect(config.concurrency).toBe(8);
    expect(config.maxFiles).toBe(10);
    // Set by file
    expect(config.outputFormat).toBe('json');
    expect(config.analyzers.complexity.maxParameters).toBe(8);
    // Set by default
    expect(config.severityThreshold).toBe('medium');
    expect(config.analyzers.complexity.maxFunctionLines).toBe(80);
    expect(config.analyzers.react.maxComponentLines).toBe(200);
  });

  it('should not let undefined CLI override values overwrite file or default settings', async () => {
    const userConfig = {
      concurrency: 4,
      outputFormat: 'json'
    };
    await fs.writeFile(
      path.join(tempDir, CONFIG_FILE_NAME),
      JSON.stringify(userConfig, null, 2)
    );

    const cliOverrides = {
      outputFormat: undefined,
      concurrency: undefined,
      maxFiles: undefined
    };

    const config = await loadConfig({
      rootDirectory: tempDir,
      cliOverrides
    });

    expect(config.outputFormat).toBe('json');
    expect(config.concurrency).toBe(4);
    expect(config.maxFiles).toBe(100);
  });

  it('should throw ConfigurationError with config file path when JSON is invalid', async () => {
    const configPath = path.join(tempDir, CONFIG_FILE_NAME);
    await fs.writeFile(configPath, '{ invalid json content: true, }');

    await expect(loadConfig({ rootDirectory: tempDir })).rejects.toThrow(ConfigurationError);
    await expect(loadConfig({ rootDirectory: tempDir })).rejects.toThrow(configPath);
  });

  it('should throw ConfigurationError when configuration values fail validation', async () => {
    const testCases = [
      { concurrency: 25 }, // exceeds max 10
      { concurrency: 0 }, // min 1
      { outputFormat: 'yaml' }, // invalid enum
      { severityThreshold: 'urgent' }, // invalid enum
      { include: [] }, // empty array
      { include: [''] }, // empty pattern string
      { maxFiles: -1 }, // negative
      { maxFileSizeKb: 0 }, // non-positive
      { analyzers: { complexity: { maxFunctionLines: 5 } } }, // below min 10
      { analyzers: { complexity: { maxFunctionLines: 2000 } } }, // above max 1000
      { analyzers: { complexity: { maxParameters: 0 } } }, // below min 1
      { analyzers: { complexity: { maxCyclomaticComplexity: 0 } } }, // below min 1
      { analyzers: { complexity: { maxNestingDepth: 25 } } }, // above max 20
      { analyzers: { react: { maxComponentLines: 10 } } }, // below min 20
      { analyzers: { react: { maxComponentLines: 3000 } } }, // above max 2000
      { analyzers: { react: { maxEffectLines: 2 } } }, // below min 5
      { analyzers: { react: { maxEffectLines: 800 } } } // above max 500
    ];

    for (const testCase of testCases) {
      await fs.writeFile(
        path.join(tempDir, CONFIG_FILE_NAME),
        JSON.stringify(testCase, null, 2)
      );

      await expect(loadConfig({ rootDirectory: tempDir })).rejects.toThrow(ConfigurationError);
    }
  });

  it('should reject unknown configuration fields including nested complexity and react fields', async () => {
    const invalidConfig = {
      concurrency: 3,
      unknownProperty: 'not-allowed'
    };
    await fs.writeFile(
      path.join(tempDir, CONFIG_FILE_NAME),
      JSON.stringify(invalidConfig, null, 2)
    );

    await expect(loadConfig({ rootDirectory: tempDir })).rejects.toThrow(ConfigurationError);

    const invalidNestedConfig = {
      analyzers: {
        react: {
          unknownReactOption: true
        }
      }
    };
    await fs.writeFile(
      path.join(tempDir, CONFIG_FILE_NAME),
      JSON.stringify(invalidNestedConfig, null, 2)
    );

    await expect(loadConfig({ rootDirectory: tempDir })).rejects.toThrow(ConfigurationError);
  });

  it('should return newly created arrays and objects that do not mutate DEFAULT_CONFIG', async () => {
    const config = await loadConfig({ rootDirectory: tempDir });

    expect(config.include).not.toBe(DEFAULT_CONFIG.include);
    expect(config.exclude).not.toBe(DEFAULT_CONFIG.exclude);
    expect(config.analyzers).not.toBe(DEFAULT_CONFIG.analyzers);
    expect(config.analyzers.complexity).not.toBe(DEFAULT_CONFIG.analyzers.complexity);
    expect(config.analyzers.react).not.toBe(DEFAULT_CONFIG.analyzers.react);

    // Mutating returned config must not affect DEFAULT_CONFIG
    config.include.push('**/*.custom');
    config.exclude.push('custom/**');

    expect(DEFAULT_CONFIG.include).not.toContain('**/*.custom');
    expect(DEFAULT_CONFIG.exclude).not.toContain('custom/**');
  });

  describe('AI configuration loading', () => {
    it('should merge partial AI configuration while preserving defaults', async () => {
      const userConfig = {
        ai: {
          enabled: true,
          model: 'gpt-5.6-luna',
          maxEstimatedCostUsd: 0.50
        }
      };
      await fs.writeFile(
        path.join(tempDir, CONFIG_FILE_NAME),
        JSON.stringify(userConfig, null, 2)
      );

      const config = await loadConfig({ rootDirectory: tempDir });

      expect(config.ai.enabled).toBe(true);
      expect(config.ai.model).toBe('gpt-5.6-luna');
      expect(config.ai.maxEstimatedCostUsd).toBe(0.50);
      expect(config.ai.provider).toBe('openai');
      expect(config.ai.reasoningEffort).toBe('low');
      expect(config.ai.maxOutputTokens).toBe(2000);
      expect(config.ai.maxRequests).toBe(20);
      expect(config.ai.maxInputTokensPerChunk).toBe(12000);
      expect(config.ai.timeoutMs).toBe(30000);
      expect(config.ai.retries).toBe(2);
    });

    it('should reject invalid AI configuration values', async () => {
      const invalidAiCases = [
        { ai: { provider: 'anthropic' } }, // only openai allowed
        { ai: { model: '' } }, // empty string
        { ai: { reasoningEffort: 'extreme' } }, // invalid enum
        { ai: { maxOutputTokens: 50 } }, // below 100
        { ai: { maxOutputTokens: 30000 } }, // above 20000
        { ai: { maxRequests: 0 } }, // below 1
        { ai: { maxRequests: 200 } }, // above 100
        { ai: { maxInputTokensPerChunk: 100 } }, // below 500
        { ai: { maxEstimatedCostUsd: 0 } }, // must be > 0
        { ai: { maxEstimatedCostUsd: 150 } }, // must be <= 100
        { ai: { timeoutMs: 500 } }, // below 1000
        { ai: { retries: 10 } }, // above 5
        { ai: { unknownKey: true } } // unknown field
      ];

      for (const invalidCase of invalidAiCases) {
        await fs.writeFile(
          path.join(tempDir, CONFIG_FILE_NAME),
          JSON.stringify(invalidCase, null, 2)
        );

        await expect(loadConfig({ rootDirectory: tempDir })).rejects.toThrow(ConfigurationError);
      }
    });
  });
});
