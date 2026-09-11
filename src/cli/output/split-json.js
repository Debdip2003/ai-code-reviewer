/**
 * Split JSON Output Formatter for ACR Code Splitter.
 * Formats split candidate listings and transformation plans into structured JSON.
 */

import { formatJsonOutput } from './json.js';

/**
 * Formats a transformation plan or candidate list as structured JSON.
 *
 * @param {Object} data
 * @returns {string} Formatted JSON string.
 */
export function formatSplitJson(data) {
  return formatJsonOutput(data);
}
