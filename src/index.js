/**
 * Main public API entry point for the ai-code-reviewer package.
 */

// Configuration
export { DEFAULT_CONFIG, CONFIG_FILE_NAME, IGNORE_FILE_NAME } from './config/defaults.js';
export { loadConfig, ConfigurationError } from './config/load-config.js';

// Scanner
export { discoverFiles } from './scanner/discover-files.js';
export { createIgnoreMatcher } from './scanner/ignore-files.js';

// Output Formatter
export { formatJsonOutput } from './cli/output/json.js';
