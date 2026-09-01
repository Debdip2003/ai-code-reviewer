/**
 * JSON output formatting utility.
 * Formats review results and metadata into serialized JSON without side effects.
 */

/**
 * Formats raw structured data into a pretty-printed JSON string.
 * @param {unknown} data - The data payload to serialize.
 * @returns {string} Formatted JSON string.
 */
export function formatJsonOutput(data) {
  return JSON.stringify(data, null, 2);
}
