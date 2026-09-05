/**
 * Review command handler.
 * CLI command responsible for initiating repository file review, static analysis, and reporting.
 */

import { loadConfig } from '../../config/load-config.js';
import { reviewRepository } from '../../review/review-engine.js';
import { isAtOrAboveSeverity, SEVERITY_ORDER } from '../../review/severity.js';
import { getChangedFiles, getChangedLineRanges, GitDiffError } from '../../scanner/git-diff.js';
import { EXIT_CODES } from '../../review/exit-codes.js';
import { logger } from '../../utils/logger.js';
import { printReviewTerminalReport, printError } from '../output/terminal.js';
import { formatReviewReportJson } from '../output/json.js';

/**
 * Executes the review command action.
 *
 * @param {string} [targetPath='.'] - Target directory or repository path to review.
 * @param {Object} [options={}] - Command options.
 * @param {'terminal' | 'json'} [options.format] - Output format override.
 * @param {string | number} [options.maxFiles] - Maximum files override.
 * @param {'low' | 'medium' | 'high' | 'critical'} [options.severity] - Minimum severity threshold override.
 * @param {boolean} [options.ai] - AI review flag.
 * @param {string} [options.model] - AI model override.
 * @param {string | number} [options.maxAiCost] - Max estimated AI cost override.
 * @param {boolean} [options.changed=false] - Whether to review only changed files.
 * @param {string} [options.base] - Base Git reference for comparative review.
 * @param {boolean} [options.cache] - Whether cache is enabled.
 * @param {boolean} [options.debug] - Whether debug logging is enabled.
 * @param {AbortSignal} [options.signal] - Abort signal.
 * @returns {Promise<void>}
 */
export async function reviewAction(targetPath = '.', options = {}) {
  if (options.debug) {
    logger.setLevel('debug');
    logger.debug('Debug logging enabled for review command');
  }

  // Validate --base requires --changed
  if (options.base && !options.changed) {
    printError('Option --base requires --changed to be specified.');
    process.exitCode = EXIT_CODES.EXECUTION_ERROR;
    return;
  }

  // Validate format option if provided on CLI
  if (options.format !== undefined && !['terminal', 'json'].includes(options.format)) {
    printError(`Invalid format "${options.format}". Allowed formats are: terminal, json.`);
    process.exitCode = EXIT_CODES.EXECUTION_ERROR;
    return;
  }

  // Validate severity option if provided on CLI
  if (options.severity !== undefined && !Object.keys(SEVERITY_ORDER).includes(options.severity)) {
    printError(`Invalid severity "${options.severity}". Allowed levels are: low, medium, high, critical.`);
    process.exitCode = EXIT_CODES.EXECUTION_ERROR;
    return;
  }

  // Validate maxFiles option if provided on CLI
  let parsedMaxFiles;
  if (options.maxFiles !== undefined) {
    parsedMaxFiles = Number(options.maxFiles);
    if (!Number.isInteger(parsedMaxFiles) || parsedMaxFiles <= 0) {
      printError('Option --max-files must be a positive integer.');
      process.exitCode = EXIT_CODES.EXECUTION_ERROR;
      return;
    }
  }

  // Validate maxAiCost option if provided on CLI
  let parsedMaxAiCost;
  if (options.maxAiCost !== undefined) {
    parsedMaxAiCost = Number(options.maxAiCost);
    if (isNaN(parsedMaxAiCost) || parsedMaxAiCost <= 0 || parsedMaxAiCost > 100) {
      printError('Option --max-ai-cost must be a positive number up to 100.');
      process.exitCode = EXIT_CODES.EXECUTION_ERROR;
      return;
    }
  }

  // Validate model option if provided on CLI
  if (options.model !== undefined) {
    if (typeof options.model !== 'string' || options.model.trim().length === 0) {
      printError('Option --model must be a non-empty string.');
      process.exitCode = EXIT_CODES.EXECUTION_ERROR;
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
  if (options.severity !== undefined) {
    cliOverrides.severityThreshold = options.severity;
  }
  if (options.ai !== undefined) {
    cliOverrides.ai = cliOverrides.ai || {};
    cliOverrides.ai.enabled = Boolean(options.ai);
  }
  if (options.model !== undefined) {
    cliOverrides.ai = cliOverrides.ai || {};
    cliOverrides.ai.model = options.model.trim();
  }
  if (parsedMaxAiCost !== undefined) {
    cliOverrides.ai = cliOverrides.ai || {};
    cliOverrides.ai.maxEstimatedCostUsd = parsedMaxAiCost;
  }
  if (options.cache !== undefined) {
    cliOverrides.cache = cliOverrides.cache || {};
    cliOverrides.cache.enabled = Boolean(options.cache);
  }

  try {
    const config = await loadConfig({
      rootDirectory: targetPath,
      cliOverrides
    });

    if (config.ai?.enabled) {
      const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        printError('AI review is enabled but OPENAI_API_KEY environment variable is missing (or GROQ_API_KEY).');
        process.exitCode = EXIT_CODES.EXECUTION_ERROR;
        return;
      }
    }

    let reviewScope = null;
    if (options.changed) {
      try {
        const changedInfo = await getChangedFiles({
          rootDirectory: targetPath,
          baseRef: options.base,
          signal: options.signal
        });

        const filesMap = {};
        let deletedFiles = 0;

        for (const f of changedInfo.files) {
          if (options.signal?.aborted) {
            process.exitCode = EXIT_CODES.INTERRUPTED;
            return;
          }

          if (f.status === 'deleted') {
            deletedFiles++;
            continue;
          }

          const changedLines = await getChangedLineRanges({
            rootDirectory: targetPath,
            relativePath: f.relativePath,
            baseRef: options.base,
            status: f.status,
            signal: options.signal
          });

          filesMap[f.relativePath] = {
            status: f.status,
            changedLines
          };
        }

        reviewScope = {
          mode: 'changed',
          gitMode: changedInfo.mode,
          baseRef: changedInfo.baseRef,
          changedFiles: changedInfo.files.length - deletedFiles,
          deletedFiles,
          files: filesMap
        };
      } catch (gitErr) {
        if (gitErr && (gitErr.name === 'AbortError' || options.signal?.aborted)) {
          process.exitCode = EXIT_CODES.INTERRUPTED;
          return;
        }
        const gitMsg = gitErr instanceof GitDiffError ? gitErr.message : `Git error: ${gitErr.message}`;
        printError(gitMsg);
        process.exitCode = EXIT_CODES.EXECUTION_ERROR;
        return;
      }
    }

    if (options.signal?.aborted) {
      process.exitCode = EXIT_CODES.INTERRUPTED;
      return;
    }

    const reviewResult = await reviewRepository({
      rootDirectory: targetPath,
      config,
      reviewScope,
      signal: options.signal
    });

    if (options.signal?.aborted) {
      process.exitCode = EXIT_CODES.INTERRUPTED;
      return;
    }

    const threshold = config.severityThreshold || 'medium';
    const failedThreshold = reviewResult.findings.some((finding) =>
      isAtOrAboveSeverity(finding.severity, threshold)
    );

    if (config.outputFormat === 'json') {
      const jsonOutput = formatReviewReportJson({
        rootDirectory: reviewResult.rootDirectory,
        findings: reviewResult.findings,
        failures: reviewResult.failures,
        summary: reviewResult.summary
      });
      console.log(jsonOutput);
    } else {
      printReviewTerminalReport({
        rootDirectory: reviewResult.rootDirectory,
        discoveredCount: reviewResult.summary.discovered,
        analyzedCount: reviewResult.summary.analyzed,
        failures: reviewResult.failures,
        findings: reviewResult.findings,
        summary: reviewResult.summary,
        threshold,
        failedThreshold,
        skipped: {
          ignored: reviewResult.summary.ignored,
          tooLarge: reviewResult.summary.tooLarge,
          limited: reviewResult.summary.limited
        }
      });
    }

    // Exit code determination
    if (reviewResult.failures.length > 0 || reviewResult.summary.ai?.stoppedByBudget) {
      process.exitCode = EXIT_CODES.EXECUTION_ERROR;
    } else if (failedThreshold) {
      process.exitCode = EXIT_CODES.FINDINGS;
    } else {
      process.exitCode = EXIT_CODES.SUCCESS;
    }
  } catch (error) {
    if (error && (error.name === 'AbortError' || options.signal?.aborted)) {
      process.exitCode = EXIT_CODES.INTERRUPTED;
      return;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    printError(errorMessage);
    process.exitCode = EXIT_CODES.EXECUTION_ERROR;
  }
}

/**
 * Registers the 'review' command on a Commander program instance.
 * @param {import('commander').Command} program - Commander program instance.
 * @param {AbortSignal} [signal] - Optional root cancellation signal.
 */
export function registerReviewCommand(program, signal) {
  program
    .command('review', { isDefault: true })
    .description('Review JavaScript and React files in a directory or repository')
    .argument('[path]', 'Path to the directory or file to review', '.')
    .option('-f, --format <format>', 'Output format (terminal or json)')
    .option('-m, --max-files <number>', 'Maximum number of files to discover/review')
    .option('-s, --severity <level>', 'Minimum finding severity threshold (low, medium, high, critical)')
    .option('--ai', 'Enable AI code review')
    .option('--no-ai', 'Disable AI code review')
    .option('--model <model>', 'AI model identifier (e.g. gpt-5.6-luna)')
    .option('--max-ai-cost <usd>', 'Maximum allowable estimated AI cost in USD')
    .option('--changed', 'Review only git-changed files', false)
    .option('--base <ref>', 'Base git reference for diff comparison (requires --changed)')
    .option('--cache', 'Enable local caching')
    .option('--no-cache', 'Disable local caching')
    .option('--debug', 'Enable verbose debug logging')
    .action(async (targetPath, options) => {
      await reviewAction(targetPath, { ...options, signal });
    });
}
