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
