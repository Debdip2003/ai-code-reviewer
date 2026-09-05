/**
 * Centralized logging module for ACR.
 * Supports configurable log levels with strict secret redaction and stderr routing for debug logs.
 */

import chalk from 'chalk';

export const LOG_LEVELS = Object.freeze({
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
});

const API_KEY_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /gsk_[a-zA-Z0-9_-]{20,}/g,
  /bearer\s+[a-zA-Z0-9_\-.]+/gi,
  /key=[a-zA-Z0-9_\-.]+/gi
];

/**
 * Redacts known secret and API key patterns from text.
 * @param {string} text
 * @returns {string}
 */
export function redactSecrets(text) {
  if (typeof text !== 'string') {
    return text;
  }
  let sanitized = text;
  for (const pattern of API_KEY_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED_API_KEY]');
  }
  return sanitized;
}

/**
 * Central Logger class.
 */
export class Logger {
  /**
   * @param {Object} [options={}]
   * @param {'silent' | 'error' | 'warn' | 'info' | 'debug'} [options.level='info'] - Active log level.
   * @param {boolean} [options.debug=false] - Shorthand to enable debug logging.
   */
  constructor(options = {}) {
    const levelName = options.debug ? 'debug' : options.level || 'info';
    this.level = LOG_LEVELS[levelName] ?? LOG_LEVELS.info;
  }

  /**
   * Sets active log level.
   * @param {'silent' | 'error' | 'warn' | 'info' | 'debug'} levelName
   */
  setLevel(levelName) {
    if (levelName in LOG_LEVELS) {
      this.level = LOG_LEVELS[levelName];
    }
  }

  /**
   * Logs an error message to stderr.
   * @param {string} message
   * @param {unknown} [meta]
   */
  error(message, meta) {
    if (this.level >= LOG_LEVELS.error) {
      const sanitized = redactSecrets(String(message));
      console.error(`${chalk.red('✖')} ${chalk.red(sanitized)}`);
      if (meta && this.level >= LOG_LEVELS.debug) {
        console.error(chalk.dim(redactSecrets(JSON.stringify(meta, null, 2))));
      }
    }
  }

  /**
   * Logs a warning message to stderr.
   * @param {string} message
   */
  warn(message) {
    if (this.level >= LOG_LEVELS.warn) {
      const sanitized = redactSecrets(String(message));
      console.error(`${chalk.yellow('⚠')} ${chalk.yellow(sanitized)}`);
    }
  }

  /**
   * Logs an informational message to stdout.
   * @param {string} message
   */
  info(message) {
    if (this.level >= LOG_LEVELS.info) {
      const sanitized = redactSecrets(String(message));
      console.log(`${chalk.cyan('ℹ')} ${chalk.cyan(sanitized)}`);
    }
  }

  /**
   * Logs debug information to stderr without polluting stdout.
   * @param {string} message
   * @param {unknown} [meta]
   */
  debug(message, meta) {
    if (this.level >= LOG_LEVELS.debug) {
      const sanitized = redactSecrets(String(message));
      const prefix = chalk.magenta('[DEBUG]');
      if (meta !== undefined) {
        const metaStr = typeof meta === 'string' ? meta : JSON.stringify(meta);
        console.error(`${prefix} ${sanitized} ${chalk.dim(redactSecrets(metaStr))}`);
      } else {
        console.error(`${prefix} ${sanitized}`);
      }
    }
  }
}

/** Default singleton logger instance */
export const logger = new Logger();
