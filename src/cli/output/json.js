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
 * Formats full review engine results into a standardized JSON string.
 *
 * @param {Object} options
 * @param {string} options.rootDirectory - Root directory scanned.
 * @param {Array<Object>} options.findings - Normalized review findings.
 * @param {Array<Object>} options.failures - Discovery, parse, or lint failures.
 * @param {Object} options.summary - Aggregate count summary.
 * @returns {string} Formatted JSON string.
 */
export function formatReviewReportJson({ rootDirectory, findings, failures, summary }) {
  return formatJsonOutput({
    status: 'review-complete',
    rootDirectory,
    findings,
    failures,
    summary
  });
}
