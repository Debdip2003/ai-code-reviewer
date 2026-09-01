/**
 * Severity ranking and filtering module.
 * Provides severity constants, weight ordering, and filtering functions
 * for categorizing review findings.
 */

/**
 * Standard severity level numeric weights.
 * @type {Readonly<Record<'low' | 'medium' | 'high' | 'critical', number>>}
 */
export const SEVERITY_WEIGHTS = Object.freeze({
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
});

/**
 * Valid severity levels.
 * @type {readonly ['low', 'medium', 'high', 'critical']}
 */
export const SEVERITY_LEVELS = Object.freeze(['low', 'medium', 'high', 'critical']);

/**
 * Filters a list of findings to only include those meeting or exceeding a minimum severity threshold.
 * @template {{ severity: 'low' | 'medium' | 'high' | 'critical' }} T
 * @param {T[]} findings - List of findings with severity properties.
 * @param {'low' | 'medium' | 'high' | 'critical'} [threshold='medium'] - Minimum severity threshold.
 * @returns {T[]} Filtered array of findings.
 */
export function filterBySeverity(findings = [], threshold = 'medium') {
  const minWeight = SEVERITY_WEIGHTS[threshold] ?? SEVERITY_WEIGHTS.medium;
  return findings.filter((finding) => {
    const weight = SEVERITY_WEIGHTS[finding.severity] ?? 0;
    return weight >= minWeight;
  });
}
