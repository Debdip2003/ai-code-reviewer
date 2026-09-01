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
 * Formats and prints file discovery results to the terminal.
 * @param {Object} result
 * @param {string} result.rootDirectory - Discovered root directory.
 * @param {Array<{ relativePath: string }>} result.files - Discovered files list.
 * @param {{ ignored: number, tooLarge: number, limited: number }} [result.skipped] - Skipped count.
 */
export function printDiscoveryResults({ rootDirectory, files, skipped = { ignored: 0, tooLarge: 0, limited: 0 } }) {
  console.log(`Project root: ${rootDirectory}`);

  if (files.length === 0) {
    printWarning('No supported files found to review.');
  } else {
    console.log(`Discovered ${files.length} supported file${files.length === 1 ? '' : 's'}\n`);
    for (const file of files) {
      console.log(file.relativePath);
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
    console.log(`\nSkipped: ${skipItems.join(', ')}`);
  }
}
