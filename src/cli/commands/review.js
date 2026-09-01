/**
 * Review command handler.
 * CLI command responsible for initiating file discovery, AST parsing, and review reporting.
 */

import { loadConfig } from '../../config/load-config.js';
import { discoverFiles } from '../../scanner/discover-files.js';
import { parseFile } from '../../parser/parse-file.js';
import { summarizeAst } from '../../parser/summarize-ast.js';
import { printReviewResults, printError } from '../output/terminal.js';
import { formatParseReviewJson } from '../output/json.js';

/**
 * Maps items asynchronously with bounded concurrency while preserving input order.
 *
 * @template T, R
 * @param {T[]} items - Items to process.
 * @param {number} concurrency - Max concurrent async tasks.
 * @param {(item: T, index: number) => Promise<R>} fn - Async mapping function.
 * @returns {Promise<R[]>} Processed results in original order.
 */
export async function mapConcurrent(items, concurrency, fn) {
  if (items.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(concurrency || 2, 10));
  const results = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await fn(items[index], index);
    }
  }

  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return results;
}

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
    process.exitCode = 2;
    return;
  }

  // Validate format option if provided on CLI
  if (options.format !== undefined && !['terminal', 'json'].includes(options.format)) {
    printError(`Invalid format "${options.format}". Allowed formats are: terminal, json.`);
    process.exitCode = 2;
    return;
  }

  // Validate maxFiles option if provided on CLI
  let parsedMaxFiles;
  if (options.maxFiles !== undefined) {
    parsedMaxFiles = Number(options.maxFiles);
    if (!Number.isInteger(parsedMaxFiles) || parsedMaxFiles <= 0) {
      printError('Option --max-files must be a positive integer.');
      process.exitCode = 2;
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

    // Parse discovered files with bounded concurrency
    const parseResults = await mapConcurrent(
      discoveryResult.files,
      config.concurrency,
      async (file) => {
        try {
          const { ast } = await parseFile({
            absolutePath: file.absolutePath,
            relativePath: file.relativePath
          });
          const summary = summarizeAst({
            ast,
            relativePath: file.relativePath
          });
          return { ok: true, summary };
        } catch (error) {
          const line = typeof error.line === 'number' ? error.line : 1;
          const column = typeof error.column === 'number' ? error.column : 0;
          const reason = error.reason || error.message || 'Syntax error';
          return {
            ok: false,
            failure: {
              relativePath: file.relativePath,
              line,
              column,
              reason
            }
          };
        }
      }
    );

    const parsedFiles = [];
    const failures = [];

    for (const res of parseResults) {
      if (res.ok) {
        parsedFiles.push(res.summary);
      } else {
        failures.push(res.failure);
      }
    }

    const summary = {
      discovered: discoveryResult.files.length,
      parsed: parsedFiles.length,
      failed: failures.length,
      ignored: discoveryResult.skipped.ignored,
      tooLarge: discoveryResult.skipped.tooLarge,
      limited: discoveryResult.skipped.limited
    };

    if (config.outputFormat === 'json') {
      const jsonOutput = formatParseReviewJson({
        rootDirectory: discoveryResult.rootDirectory,
        files: parsedFiles,
        failures,
        summary
      });
      console.log(jsonOutput);
    } else {
      printReviewResults({
        rootDirectory: discoveryResult.rootDirectory,
        discoveredCount: discoveryResult.files.length,
        parsedFiles,
        failures,
        skipped: discoveryResult.skipped
      });
    }

    if (failures.length > 0) {
      process.exitCode = 2;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    printError(errorMessage);
    process.exitCode = 2;
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
