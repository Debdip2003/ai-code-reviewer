/**
 * Finding deduplication module.
 * Eliminates exact duplicate findings using deterministic content fingerprints.
 */

/**
 * Normalizes a finding message by trimming and collapsing repeated whitespace.
 * @param {string} message - Raw message string.
 * @returns {string} Normalized message string.
 */
function normalizeMessage(message) {
  if (typeof message !== 'string') {
    return '';
  }
  return message.trim().replace(/\s+/g, ' ');
}

/**
 * Deduplicates an array of review findings based on deterministic signature fingerprints.
 * Preserves the first encountered finding for any duplicates.
 *
 * @template {{ source: string, ruleId: string, relativePath: string, lineStart: number, columnStart: number, message: string }} T
 * @param {T[]} [findings=[]] - Array of findings.
 * @returns {T[]} New array containing deduplicated findings.
 */
export function deduplicateFindings(findings = []) {
  if (!Array.isArray(findings) || findings.length === 0) {
    return [];
  }

  const seen = new Set();
  const deduplicated = [];

  for (const finding of findings) {
    if (!finding) continue;

    const normMsg = normalizeMessage(finding.message);
    const fingerprint = `${finding.source}:${finding.ruleId}:${finding.relativePath}:${finding.lineStart}:${finding.columnStart}:${normMsg}`;

    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      deduplicated.push(finding);
    }
  }

  return deduplicated;
}
