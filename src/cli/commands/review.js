/**
 * Review command handler.
 * CLI command responsible for initiating file discovery and static/AI code reviews.
 */

import { loadConfig } from '../../config/load-config.js';
import { discoverFiles } from '../../scanner/discover-files.js';
import { printDiscoveryResults, printError } from '../output/terminal.js';
import { formatDiscoveryJson } from '../output/json.js';

/**
 * Executes the review command action.
 *
 * @param {string} [targetPath='.'] - Target directory or repository path to review.
 * @param {Object} [options={}] - Command options.
 * @param {'terminal' | 'json'} [options.format] - Output format override.
 * @param {string | number} [options.maxFiles] - Maximum files override.
 * @param {boolean} [options.changed=false] - Whether to review only changed files.
 * @returns {Promise<void>}
 */
export async function reviewAction(targetPath = '.', options = {}) {
  // Check for unsupported changed-only review mode
  if (options.changed) {
    printError('Git diff review (--changed) is not implemented yet in this version.');
    process.exitCode = 1;
    return;
  }

  // Validate format option if provided on CLI
  if (options.format !== undefined && !['terminal', 'json'].includes(options.format)) {
    printError(`Invalid format "${options.format}". Allowed formats are: terminal, json.`);
    process.exitCode = 1;
    return;
  }

  // Validate maxFiles option if provided on CLI
  let parsedMaxFiles;
  if (options.maxFiles !== undefined) {
    parsedMaxFiles = Number(options.maxFiles);
    if (!Number.isInteger(parsedMaxFiles) || parsedMaxFiles <= 0) {
      printError('Option --max-files must be a positive integer.');
      process.exitCode = 1;
      return;
    }
  }

  const cliOverrides = {};
  if (options.format !== undefined) {
    cliOverrides.outputFormat = options.format;
  }
  if (parsedMaxFiles !== undefined) {
    cliOverrides.maxFiles = parsedMaxFiles;
  }

  try {
    const config = await loadConfig({
      rootDirectory: targetPath,
      cliOverrides
    });

    const discoveryResult = await discoverFiles({
      rootDirectory: config.rootDirectory,
      includePatterns: config.include,
      excludePatterns: config.exclude,
      maxFiles: config.maxFiles,
      maxFileSizeKb: config.maxFileSizeKb
    });

    if (config.outputFormat === 'json') {
      const jsonOutput = formatDiscoveryJson({
        rootDirectory: discoveryResult.rootDirectory,
        files: discoveryResult.files,
        skipped: discoveryResult.skipped
      });
      console.log(jsonOutput);
    } else {
      printDiscoveryResults({
        rootDirectory: discoveryResult.rootDirectory,
        files: discoveryResult.files,
        skipped: discoveryResult.skipped
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    printError(errorMessage);
    process.exitCode = 1;
  }
}

/**
 * Registers the 'review' command on a Commander program instance.
 * @param {import('commander').Command} program - Commander program instance.
 */
export function registerReviewCommand(program) {
  program
    .command('review')
    .description('Review JavaScript and React files in a directory or repository')
    .argument('[path]', 'Path to the directory or file to review', '.')
    .option('-f, --format <format>', 'Output format (terminal or json)')
    .option('-m, --max-files <number>', 'Maximum number of files to discover/review')
    .option('--changed', 'Review only git-changed files', false)
    .action(async (targetPath, options) => {
      await reviewAction(targetPath, options);
    });
}
