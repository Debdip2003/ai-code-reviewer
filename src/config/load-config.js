/**
 * Configuration loader module.
 * Responsible for discovering, loading, and validating user configuration files
 * (e.g. .aicodereviewerrc.json, ai-code-reviewer.config.js) merged with default settings.
 */

import { DEFAULT_CONFIG } from './defaults.js';

/**
 * Loads project configuration from disk or returns default configuration.
 * @param {string} [_configPath] - Optional custom path to a configuration file.
 * @returns {Promise<import('./defaults.js').ReviewerConfig>} Resolved configuration object.
 */
export async function loadConfig(_configPath) {
  // Placeholder: Configuration discovery and file parsing will be implemented in a subsequent phase.
  return { ...DEFAULT_CONFIG };
}
