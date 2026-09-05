/**
 * Terminal output formatting helpers using chalk.
 * Encapsulates color styling and standardized message prefixes for CLI output.
 */

import chalk from 'chalk';

/**
 * Prints an informational message to the standard output.
 * @param {string} message - Message text to display.
 */
export function printInfo(message) {
  console.log(`${chalk.cyan('ℹ')} ${chalk.cyan(message)}`);
}

/**
 * Prints a success message to the standard output.
 * @param {string} message - Message text to display.
 */
export function printSuccess(message) {
  console.log(`${chalk.green('✔')} ${chalk.green(message)}`);
}

/**
 * Prints a warning message to the standard output or standard error.
 * @param {string} message - Message text to display.
 */
export function printWarning(message) {
  console.warn(`${chalk.yellow('⚠')} ${chalk.yellow(message)}`);
}

/**
 * Prints an error message to the standard error stream.
 * @param {string} message - Message text to display.
 */
export function printError(message) {
  console.error(`${chalk.red('✖')} ${chalk.red(message)}`);
}

/**
 * Formats severity label with color for terminal display.
 * @param {string} severity
 * @returns {string}
 */
function formatSeverityTag(severity) {
  switch (severity) {
    case 'critical':
      return chalk.bgRed.white.bold(' CRITICAL ');
    case 'high':
      return chalk.red.bold(' HIGH ');
    case 'medium':
      return chalk.yellow.bold(' MEDIUM ');
    case 'low':
      return chalk.blue.bold(' LOW ');
    default:
      return ` ${severity.toUpperCase()} `;
  }
}

/**
 * Formats and prints the complete review results report to the terminal.
 *
 * @param {Object} params
 * @param {string} params.rootDirectory - Root directory path.
 * @param {number} params.discoveredCount - Discovered files count.
 * @param {number} params.analyzedCount - Analyzed files count.
 * @param {Array<Object>} [params.failures=[]] - Failures during read/parse/lint.
 * @param {Array<Object>} [params.findings=[]] - Normalized findings list.
 * @param {Object} params.summary - Severity and status summary.
 * @param {string} [params.threshold='medium'] - Configured severity threshold.
 * @param {boolean} [params.failedThreshold=false] - Whether threshold was triggered.
 * @param {{ ignored: number, tooLarge: number, limited: number }} [params.skipped] - Skipped count.
 */
export function printReviewTerminalReport({
  rootDirectory,
  discoveredCount,
  analyzedCount,
  failures = [],
  findings = [],
  summary = {},
  threshold = 'medium',
  failedThreshold = false,
  skipped = { ignored: 0, tooLarge: 0, limited: 0 }
}) {
  console.log(`Reviewing project: ${rootDirectory}\n`);
  console.log(`Discovered: ${discoveredCount} file${discoveredCount === 1 ? '' : 's'}`);
  console.log(`Analyzed: ${analyzedCount} file${analyzedCount === 1 ? '' : 's'}`);
  console.log(`Failures: ${failures.length}\n`);

  if (findings.length > 0) {
    // Group findings by relativePath
    const findingsByFile = new Map();
    for (const finding of findings) {
      if (!findingsByFile.has(finding.relativePath)) {
        findingsByFile.set(finding.relativePath, []);
      }
      findingsByFile.get(finding.relativePath).push(finding);
    }

    for (const [relativePath, fileFindings] of findingsByFile) {
      console.log(chalk.bold.underline(relativePath));
      console.log('');

      for (const finding of fileFindings) {
        const tag = formatSeverityTag(finding.severity);
        const rule = chalk.dim(finding.ruleId);
        const loc = chalk.cyan(`Line ${finding.lineStart}:${finding.columnStart}`);

        console.log(`  ${tag} ${rule}  ${loc}`);
        console.log(`  ${finding.message}\n`);

        if (finding.suggestion) {
          console.log(`  ${chalk.dim('Suggestion:')}`);
          console.log(`  ${chalk.italic(finding.suggestion)}\n`);
        }
      }
    }
  }

  if (failures.length > 0) {
    console.log(chalk.red.bold('Failures:\n'));
    for (const failure of failures) {
      const stage = failure.stage ? ` (${failure.stage})` : '';
      console.log(`  ${failure.relativePath}${stage}: Line ${failure.line}:${failure.column}`);
      console.log(`  ${failure.reason}\n`);
    }
  }

  const sevCounts = summary.severity || { critical: 0, high: 0, medium: 0, low: 0 };
  console.log('Summary\n');
  console.log(`Critical: ${sevCounts.critical || 0}`);
  console.log(`High: ${sevCounts.high || 0}`);
  console.log(`Medium: ${sevCounts.medium || 0}`);
  console.log(`Low: ${sevCounts.low || 0}`);
  console.log(`Total: ${findings.length}\n`);

  if (summary.findingsBySource) {
    console.log(`ESLint findings: ${summary.findingsBySource.eslint || 0}`);
    console.log(`Complexity findings: ${summary.findingsBySource.complexity || 0}`);
    console.log(`React findings: ${summary.findingsBySource.react || 0}`);
    if (summary.ai?.enabled || summary.findingsBySource.ai > 0) {
      console.log(`AI findings: ${summary.findingsBySource.ai || 0}`);
    }
    console.log('');
  }

  if (summary.ai?.enabled) {
    console.log('AI Review\n');
    console.log('AI review: enabled');
    if (summary.ai.model) {
      console.log(`Model: ${summary.ai.model}`);
    }
    console.log(`AI chunks reviewed: ${summary.ai.chunksReviewed || 0}`);
    console.log(`AI chunks skipped: ${summary.ai.chunksSkipped || 0}`);
    if (summary.ai.estimatedCostUsd !== null && summary.ai.estimatedCostUsd !== undefined) {
      console.log(`Estimated AI cost: $${summary.ai.estimatedCostUsd.toFixed(2)}`);
    } else {
      console.log('Estimated AI cost: unavailable for configured model');
    }
    if (summary.ai.stoppedByBudget) {
      console.log(chalk.yellow('\n⚠ AI review was stopped early because configured budget limits were reached.'));
    }
    console.log('');
  }

  if (typeof summary.functionsAnalyzed === 'number') {
    console.log(`Functions analyzed: ${summary.functionsAnalyzed}`);
  }
  if (typeof summary.componentsAnalyzed === 'number') {
    console.log(`Components analyzed: ${summary.componentsAnalyzed}`);
  }
  if (typeof summary.effectsAnalyzed === 'number') {
    console.log(`Effects analyzed: ${summary.effectsAnalyzed}`);
  }
  if (typeof summary.stateVariablesTracked === 'number') {
    console.log(`State variables tracked: ${summary.stateVariablesTracked}\n`);
  }

  const skipItems = [];
  if (skipped.ignored > 0) skipItems.push(`${skipped.ignored} ignored`);
  if (skipped.tooLarge > 0) skipItems.push(`${skipped.tooLarge} too large`);
  if (skipped.limited > 0) skipItems.push(`${skipped.limited} limited`);

  if (skipItems.length > 0) {
    console.log(`Skipped: ${skipItems.join(', ')}\n`);
  }

  if (failedThreshold) {
    printError(`Review failed: findings reached the configured ${threshold} threshold.`);
  } else if (failures.length > 0) {
    printError(`Review completed with ${failures.length} execution/parse failure${failures.length === 1 ? '' : 's'}.`);
  } else if (discoveredCount === 0) {
    printWarning('No supported files found to review.');
  } else {
    printSuccess(`Review passed: no findings reached the configured ${threshold} threshold.`);
  }
}
