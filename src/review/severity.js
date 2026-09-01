/**
 * Severity ranking, threshold filtering, and deterministic sorting module.
 * Provides severity constants, weight ordering, and utility functions for review findings.
 */

/**
 * Standard severity level numeric weights.
 * @type {Readonly<Record<'low' | 'medium' | 'high' | 'critical', number>>}
 */
export const SEVERITY_ORDER = Object.freeze({
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
});

/**
 * Valid severity levels list.
 * @type {readonly ['low', 'medium', 'high', 'critical']}
 */
export const SEVERITY_LEVELS = Object.freeze(['low', 'medium', 'high', 'critical']);

/**
 * Checks whether a finding's severity meets or exceeds a given threshold.
 *
 * @param {string} findingSeverity - Finding severity level to evaluate.
 * @param {string} threshold - Minimum severity threshold.
 * @returns {boolean} True if findingSeverity >= threshold.
 * @throws {Error} If findingSeverity or threshold is not a valid severity level.
 */
export function isAtOrAboveSeverity(findingSeverity, threshold) {
  const findingWeight = SEVERITY_ORDER[findingSeverity];
  if (findingWeight === undefined) {
    throw new Error(`Unknown finding severity: "${findingSeverity}"`);
  }

  const thresholdWeight = SEVERITY_ORDER[threshold];
  if (thresholdWeight === undefined) {
    throw new Error(`Unknown severity threshold: "${threshold}"`);
  }

  return findingWeight >= thresholdWeight;
}

/**
 * Filters an array of findings to only include those meeting or exceeding a minimum severity threshold.
 *
 * @template {{ severity: string }} T
 * @param {T[]} findings - Array of findings.
 * @param {string} [threshold='medium'] - Minimum severity threshold.
 * @returns {T[]} New array of filtered findings.
 */
export function filterFindingsBySeverity(findings = [], threshold = 'medium') {
  return findings.filter((finding) => isAtOrAboveSeverity(finding.severity, threshold));
}

/**
 * Counts findings grouped by severity level.
 *
 * @param {Array<{ severity: string }>} [findings=[]]
 * @returns {{ critical: number, high: number, medium: number, low: number }}
 */
export function countFindingsBySeverity(findings = []) {
  const counts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };

  for (const finding of findings) {
    if (counts[finding.severity] !== undefined) {
      counts[finding.severity]++;
    } else {
      throw new Error(`Unknown severity level in finding: "${finding.severity}"`);
    }
  }

  return counts;
}

/**
 * Deterministically sorts findings:
 * 1. Relative path alphabetically
 * 2. Starting line ascending
 * 3. Starting column ascending
 * 4. Severity descending (higher severity first)
 * 5. Rule ID alphabetically
 *
 * @template {{ relativePath: string, lineStart: number, columnStart: number, severity: string, ruleId: string }} T
 * @param {T[]} findings - Array of findings to sort.
 * @returns {T[]} New sorted array of findings.
 */
export function sortFindings(findings = []) {
  return [...findings].sort((a, b) => {
    // 1. Relative path alphabetically
    const pathComparison = a.relativePath.localeCompare(b.relativePath);
    if (pathComparison !== 0) {
      return pathComparison;
    }

    // 2. Starting line ascending
    if (a.lineStart !== b.lineStart) {
      return a.lineStart - b.lineStart;
    }

    // 3. Starting column ascending
    if (a.columnStart !== b.columnStart) {
      return a.columnStart - b.columnStart;
    }

    // 4. Severity descending
    const weightA = SEVERITY_ORDER[a.severity] ?? 0;
    const weightB = SEVERITY_ORDER[b.severity] ?? 0;
    if (weightA !== weightB) {
      return weightB - weightA;
    }

    // 5. Rule ID alphabetically
    return a.ruleId.localeCompare(b.ruleId);
  });
}
