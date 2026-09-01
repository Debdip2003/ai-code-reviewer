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

/**
 * Formats review parse results into a standardized JSON string.
 *
 * @param {Object} options
 * @param {string} options.rootDirectory - Root directory scanned.
 * @param {Array<Object>} options.files - Successfully parsed file summaries.
 * @param {Array<Object>} options.failures - Parse failures list.
 * @param {Object} options.summary - Aggregate count summary.
 * @returns {string} Formatted JSON string.
 */
export function formatParseReviewJson({ rootDirectory, files, failures, summary }) {
  return formatJsonOutput({
    status: 'parse-complete',
    rootDirectory,
    files,
    failures,
    summary
  });
}
