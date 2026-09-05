/**
 * Cache management command handlers.
 * Provides CLI commands for viewing and clearing review cache entries.
 */

import path from 'node:path';
import { loadConfig } from '../../config/load-config.js';
import { FileCache } from '../../cache/file-cache.js';
import { printSuccess, printError } from '../output/terminal.js';
import { formatJsonOutput } from '../output/json.js';

/**
 * Action handler for `cache clear [path]`.
 *
 * @param {string} [targetPath='.'] - Path to project directory.
 * @param {Object} [options={}] - Options.
 * @param {'terminal' | 'json'} [options.format] - Output format.
 * @returns {Promise<void>}
 */
export async function cacheClearAction(targetPath = '.', options = {}) {
  // Validate format if provided
  if (options.format !== undefined && !['terminal', 'json'].includes(options.format)) {
    printError(`Invalid format "${options.format}". Allowed formats are: terminal, json.`);
    process.exitCode = 2;
    return;
  }

  const cliOverrides = {};
  if (options.format !== undefined) {
    cliOverrides.outputFormat = options.format;
  }

  try {
    const config = await loadConfig({
      rootDirectory: targetPath,
      cliOverrides
    });

    const fileCache = new FileCache({
      rootDirectory: targetPath,
      directory: config.cache?.directory,
      maxEntries: config.cache?.maxEntries,
      enabled: config.cache?.enabled
    });

    const result = await fileCache.clear();

    if (config.outputFormat === 'json') {
      console.log(
        formatJsonOutput({
          status: 'cache-cleared',
          rootDirectory: path.resolve(targetPath),
          directory: fileCache.directoryPath,
          deletedCount: result.deletedCount
        })
      );
    } else {
      printSuccess(
        `Cache cleared: deleted ${result.deletedCount} cached item${result.deletedCount === 1 ? '' : 's'} in ${fileCache.directoryPath}`
      );
    }

    process.exitCode = 0;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    printError(errorMessage);
    process.exitCode = 2;
  }
}

/**
 * Registers cache commands on Commander program.
 * @param {import('commander').Command} program
 */
export function registerCacheCommand(program) {
  const cacheCmd = program
    .command('cache')
    .description('Manage the local review cache');

  cacheCmd
    .command('clear [path]')
    .description('Clear all cached review entries for a repository')
    .option('-f, --format <format>', 'Output format (terminal or json)')
    .action(async (targetPath = '.', options) => {
      await cacheClearAction(targetPath, options);
    });
}
