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
 * Formats and prints review & parse results to the terminal.
 *
 * @param {Object} params
 * @param {string} params.rootDirectory - Root directory scanned.
 * @param {number} params.discoveredCount - Total discovered files count.
 * @param {Array<Object>} params.parsedFiles - Successfully parsed file summaries.
 * @param {Array<Object>} params.failures - Parse failures.
 * @param {{ ignored: number, tooLarge: number, limited: number }} [params.skipped] - Skipped files count.
 */
export function printReviewResults({
  rootDirectory,
  discoveredCount,
  parsedFiles,
  failures,
  skipped = { ignored: 0, tooLarge: 0, limited: 0 }
}) {
  console.log(`Project root: ${rootDirectory}`);

  if (discoveredCount === 0) {
    printWarning('No supported files found to review.');
  } else {
    console.log(`Discovered ${discoveredCount} supported file${discoveredCount === 1 ? '' : 's'}`);
    console.log(`Parsed successfully: ${parsedFiles.length}`);
    console.log(`Parse failures: ${failures.length}\n`);

    for (const file of parsedFiles) {
      console.log(file.relativePath);
      console.log(`  Source type: ${file.sourceType}`);
      console.log(`  Statements: ${file.statementCount}`);
      console.log(`  Imports: ${file.imports.length}`);
      console.log(`  Functions: ${file.functions.length}`);
      console.log(`  Component candidates: ${file.reactComponentCandidates.length}\n`);
    }

    if (failures.length > 0) {
      console.log('Parse failures:\n');
      for (const failure of failures) {
        console.log(`${failure.relativePath}:${failure.line}:${failure.column}`);
        console.log(`  ${failure.reason}\n`);
      }
    }
  }

  const skipItems = [];
  if (skipped.ignored > 0) {
    skipItems.push(`${skipped.ignored} ignored`);
  }
  if (skipped.tooLarge > 0) {
    skipItems.push(`${skipped.tooLarge} too large`);
  }
  if (skipped.limited > 0) {
    skipItems.push(`${skipped.limited} limited`);
  }

  if (skipItems.length > 0) {
    console.log(`Skipped: ${skipItems.join(', ')}`);
  }
}
