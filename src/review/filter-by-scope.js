/**
 * Review finding scope filtering module.
 * Evaluates whether findings intersect with Git-changed line ranges and filters
 * findings according to the active review scope.
 */

/**
 * Checks if a finding's line span intersects with any of the provided changed line ranges.
 *
 * @param {Object} finding - Review finding object.
 * @param {number} [finding.lineStart] - Finding starting line number.
 * @param {number} [finding.lineEnd] - Finding ending line number.
 * @param {Array<{ start: number, end: number }>} changedLines - 1-based inclusive changed line ranges.
 * @returns {boolean} True if the finding overlaps at least one changed line range or is file-level.
 */
export function findingIntersectsChangedLines(finding, changedLines) {
  if (!finding || typeof finding !== 'object') {
    return false;
  }

  // File-level findings (no specific line number) always intersect
  if (typeof finding.lineStart !== 'number') {
    return true;
  }

  if (!Array.isArray(changedLines) || changedLines.length === 0) {
    return false;
  }

  const findingStart = finding.lineStart;
  const findingEnd = typeof finding.lineEnd === 'number' ? finding.lineEnd : findingStart;

  for (const range of changedLines) {
    if (!range || typeof range.start !== 'number' || typeof range.end !== 'number') {
      continue;
    }

    // Inclusive range intersection check
    if (findingStart <= range.end && findingEnd >= range.start) {
      return true;
    }
  }

  return false;
}

/**
 * Filters an array of findings according to the active review scope.
 * Pure function: does not mutate input findings.
 *
 * @param {Object} options
 * @param {Array<Object>} options.findings - Array of findings to filter.
 * @param {Object} [options.reviewScope] - Active review scope model.
 * @param {'full' | 'changed'} [options.reviewScope.mode='full'] - Review scope mode.
 * @param {Record<string, { status: string, changedLines: Array<{ start: number, end: number }> }> | null} [options.reviewScope.files] - Map of relative file paths to changed line ranges.
 * @returns {Array<Object>} Filtered array of findings.
 */
export function filterFindingsByScope({ findings = [], reviewScope }) {
  if (!Array.isArray(findings) || findings.length === 0) {
    return [];
  }

  if (!reviewScope || reviewScope.mode === 'full' || !reviewScope.files) {
    return [...findings];
  }

  const filesMap = reviewScope.files;

  return findings.filter((finding) => {
    if (!finding || typeof finding !== 'object') {
      return false;
    }

    // Keep global/file-level failures that do not belong to a specific file
    if (!finding.relativePath) {
      return true;
    }

    const fileScope = filesMap[finding.relativePath];
    if (!fileScope) {
      // File is not part of the changed files set
      return false;
    }

    return findingIntersectsChangedLines(finding, fileScope.changedLines);
  });
}
