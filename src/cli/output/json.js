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
 * Formats file discovery results into a standardized JSON string.
 *
 * @param {Object} options
 * @param {string} options.rootDirectory - Root directory scanned.
 * @param {Array<{ relativePath: string, extension: string, sizeBytes: number }>} options.files - Discovered files.
 * @param {{ ignored: number, tooLarge: number, limited: number }} [options.skipped] - Skipped files summary.
 * @returns {string} Formatted JSON string.
 */
export function formatDiscoveryJson({ rootDirectory, files, skipped = { ignored: 0, tooLarge: 0, limited: 0 } }) {
  return formatJsonOutput({
    status: 'scan-complete',
    rootDirectory,
    files: files.map((file) => ({
      relativePath: file.relativePath,
      extension: file.extension,
      sizeBytes: file.sizeBytes
    })),
    summary: {
      discovered: files.length,
      ignored: skipped.ignored,
      tooLarge: skipped.tooLarge,
      limited: skipped.limited
    }
  });
}
