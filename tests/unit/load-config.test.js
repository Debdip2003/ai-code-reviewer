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
  });

  it('should apply precedence: DEFAULT_CONFIG < config file < CLI overrides', async () => {
    const userConfig = {
      outputFormat: 'json',
      concurrency: 4,
      maxFiles: 30
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
    // Set by default
    expect(config.severityThreshold).toBe('medium');
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
      { maxFileSizeKb: 0 } // non-positive
    ];

    for (const testCase of testCases) {
      await fs.writeFile(
        path.join(tempDir, CONFIG_FILE_NAME),
        JSON.stringify(testCase, null, 2)
      );

      await expect(loadConfig({ rootDirectory: tempDir })).rejects.toThrow(ConfigurationError);
    }
  });

  it('should reject unknown configuration fields', async () => {
    const invalidConfig = {
      concurrency: 3,
      unknownProperty: 'not-allowed'
    };
    await fs.writeFile(
      path.join(tempDir, CONFIG_FILE_NAME),
      JSON.stringify(invalidConfig, null, 2)
    );

    await expect(loadConfig({ rootDirectory: tempDir })).rejects.toThrow(ConfigurationError);
    await expect(loadConfig({ rootDirectory: tempDir })).rejects.toThrow(/unknownProperty|Unrecognized/);
  });

  it('should return newly created arrays that do not mutate DEFAULT_CONFIG', async () => {
    const config = await loadConfig({ rootDirectory: tempDir });

    expect(config.include).not.toBe(DEFAULT_CONFIG.include);
    expect(config.exclude).not.toBe(DEFAULT_CONFIG.exclude);

    // Mutating returned config must not affect DEFAULT_CONFIG
    config.include.push('**/*.custom');
    config.exclude.push('custom/**');

    expect(DEFAULT_CONFIG.include).not.toContain('**/*.custom');
    expect(DEFAULT_CONFIG.exclude).not.toContain('custom/**');
  });
});
