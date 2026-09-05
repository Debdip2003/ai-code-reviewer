/**
 * Review command handler.
 * CLI command responsible for initiating repository file review, static analysis, and reporting.
 */

import { loadConfig } from '../../config/load-config.js';
import { reviewRepository } from '../../review/review-engine.js';
import { isAtOrAboveSeverity, SEVERITY_ORDER } from '../../review/severity.js';
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

  // Validate severity option if provided on CLI
  if (options.severity !== undefined && !Object.keys(SEVERITY_ORDER).includes(options.severity)) {
    printError(`Invalid severity "${options.severity}". Allowed levels are: low, medium, high, critical.`);
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

  // Validate maxAiCost option if provided on CLI
  let parsedMaxAiCost;
  if (options.maxAiCost !== undefined) {
    parsedMaxAiCost = Number(options.maxAiCost);
    if (isNaN(parsedMaxAiCost) || parsedMaxAiCost <= 0 || parsedMaxAiCost > 100) {
      printError('Option --max-ai-cost must be a positive number up to 100.');
      process.exitCode = 2;
      return;
    }
  }

  // Validate model option if provided on CLI
  if (options.model !== undefined) {
    if (typeof options.model !== 'string' || options.model.trim().length === 0) {
      printError('Option --model must be a non-empty string.');
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

  try {
    const config = await loadConfig({
      rootDirectory: targetPath,
      cliOverrides
    });

    if (config.ai?.enabled) {
      const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        printError('AI review is enabled but OPENAI_API_KEY environment variable is missing (or GROQ_API_KEY).');
        process.exitCode = 2;
        return;
      }
    }

    const reviewResult = await reviewRepository({
      rootDirectory: targetPath,
      config
    });

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

    // Exit code determination:
    // 2: execution/parse/analyzer failure or AI budget limit reached (takes precedence)
    // 1: review threshold triggered
    // 0: all passed cleanly
    if (reviewResult.failures.length > 0 || reviewResult.summary.ai?.stoppedByBudget) {
      process.exitCode = 2;
    } else if (failedThreshold) {
      process.exitCode = 1;
    } else {
      process.exitCode = 0;
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
    .action(async (targetPath, options) => {
      await reviewAction(targetPath, options);
    });
}
