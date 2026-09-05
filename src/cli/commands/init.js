/**
 * Init command handler.
 * CLI command responsible for bootstrapping configuration files in target repositories.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, CONFIG_FILE_NAME } from '../../config/defaults.js';
import { printSuccess, printWarning, printError } from '../output/terminal.js';

/**
 * Executes the init command action.
 * @param {Object} [options={}] - Command options.
 * @param {boolean} [options.force=false] - Whether to overwrite existing configuration file.
 * @param {string} [rootDirectory=process.cwd()] - Target root directory where configuration should be initialized.
 * @returns {Promise<boolean>} True if file was created/overwritten, false otherwise.
 */
export async function initAction(options = {}, rootDirectory = process.cwd()) {
  const force = Boolean(options.force);
  const resolvedRoot = path.resolve(rootDirectory);
  const configFilePath = path.join(resolvedRoot, CONFIG_FILE_NAME);

  const initialConfig = {
    include: [...DEFAULT_CONFIG.include],
    exclude: [...DEFAULT_CONFIG.exclude],
    outputFormat: DEFAULT_CONFIG.outputFormat,
    concurrency: DEFAULT_CONFIG.concurrency,
    severityThreshold: DEFAULT_CONFIG.severityThreshold,
    maxFiles: DEFAULT_CONFIG.maxFiles,
    maxFileSizeKb: DEFAULT_CONFIG.maxFileSizeKb,
    analyzers: {
      complexity: {
        enabled: DEFAULT_CONFIG.analyzers.complexity.enabled,
        maxFunctionLines: DEFAULT_CONFIG.analyzers.complexity.maxFunctionLines,
        maxParameters: DEFAULT_CONFIG.analyzers.complexity.maxParameters,
        maxCyclomaticComplexity: DEFAULT_CONFIG.analyzers.complexity.maxCyclomaticComplexity,
        maxNestingDepth: DEFAULT_CONFIG.analyzers.complexity.maxNestingDepth
      },
      react: {
        enabled: DEFAULT_CONFIG.analyzers.react.enabled,
        hooks: DEFAULT_CONFIG.analyzers.react.hooks,
        maxComponentLines: DEFAULT_CONFIG.analyzers.react.maxComponentLines,
        maxEffectLines: DEFAULT_CONFIG.analyzers.react.maxEffectLines,
        detectDirectStateMutation: DEFAULT_CONFIG.analyzers.react.detectDirectStateMutation,
        detectArrayIndexKeys: DEFAULT_CONFIG.analyzers.react.detectArrayIndexKeys
      }
    },
    ai: {
      enabled: DEFAULT_CONFIG.ai.enabled,
      provider: DEFAULT_CONFIG.ai.provider,
      model: DEFAULT_CONFIG.ai.model,
      reasoningEffort: DEFAULT_CONFIG.ai.reasoningEffort,
      maxOutputTokens: DEFAULT_CONFIG.ai.maxOutputTokens,
      maxRequests: DEFAULT_CONFIG.ai.maxRequests,
      maxInputTokensPerChunk: DEFAULT_CONFIG.ai.maxInputTokensPerChunk,
      maxEstimatedCostUsd: DEFAULT_CONFIG.ai.maxEstimatedCostUsd,
      timeoutMs: DEFAULT_CONFIG.ai.timeoutMs,
      retries: DEFAULT_CONFIG.ai.retries
    },
    cache: {
      enabled: DEFAULT_CONFIG.cache.enabled,
      directory: DEFAULT_CONFIG.cache.directory,
      maxEntries: DEFAULT_CONFIG.cache.maxEntries
    }
  };

  const fileContent = JSON.stringify(initialConfig, null, 2) + '\n';

  try {
    await fs.writeFile(configFilePath, fileContent, { flag: force ? 'w' : 'wx' });
    printSuccess(`Created configuration file at ${configFilePath}`);
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') {
      printWarning(
        `Configuration file already exists at "${configFilePath}". Use --force to overwrite.`
      );
      return false;
    }
    printError(`Failed to initialize configuration file: ${error.message}`);
    throw error;
  }
}

/**
 * Registers the 'init' command on a Commander program instance.
 * @param {import('commander').Command} program - Commander program instance.
 */
export function registerInitCommand(program) {
  program
    .command('init')
    .description('Initialize default ACR configuration in the current repository')
    .option('-f, --force', 'Overwrite existing configuration file if present', false)
    .action(async (options) => {
      await initAction(options);
    });
}
