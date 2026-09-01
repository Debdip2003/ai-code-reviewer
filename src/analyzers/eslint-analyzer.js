/**
 * ESLint static analyzer module.
 * Runs programmatic ESLint rule evaluations on JavaScript and JSX source code
 * using a controlled, deterministic internal flat configuration.
 */

import { ESLint } from 'eslint';
import globals from 'globals';
import { validateFinding } from '../review/finding.js';
import { sortFindings } from '../review/severity.js';

/**
 * Custom error class for ESLint execution and analysis failures.
 */
export class EslintAnalysisError extends Error {
  /**
   * @param {string} message - Error description.
   * @param {unknown} [cause] - Underlying error cause.
   */
  constructor(message, cause) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'EslintAnalysisError';
  }
}

/**
 * Metadata dictionary mapping ESLint rule identifiers to internal severity, category, and descriptive title.
 * @type {Record<string, { severity: 'low' | 'medium' | 'high', category: 'correctness' | 'security' | 'performance' | 'maintainability', title: string }>}
 */
export const RULE_METADATA = Object.freeze({
  'no-undef': {
    severity: 'high',
    category: 'correctness',
    title: 'Undefined identifier'
  },
  'no-unreachable': {
    severity: 'high',
    category: 'correctness',
    title: 'Unreachable code'
  },
  'no-dupe-keys': {
    severity: 'high',
    category: 'correctness',
    title: 'Duplicate object key'
  },
  'no-dupe-args': {
    severity: 'high',
    category: 'correctness',
    title: 'Duplicate function argument'
  },
  'no-dupe-else-if': {
    severity: 'high',
    category: 'correctness',
    title: 'Duplicate condition in if-else'
  },
  'no-duplicate-case': {
    severity: 'high',
    category: 'correctness',
    title: 'Duplicate case label'
  },
  'no-self-assign': {
    severity: 'high',
    category: 'correctness',
    title: 'Self-assignment'
  },
  'no-self-compare': {
    severity: 'high',
    category: 'correctness',
    title: 'Self-comparison'
  },
  'no-constant-condition': {
    severity: 'medium',
    category: 'correctness',
    title: 'Constant condition'
  },
  'valid-typeof': {
    severity: 'high',
    category: 'correctness',
    title: 'Invalid typeof comparison'
  },
  'use-isnan': {
    severity: 'high',
    category: 'correctness',
    title: 'Incorrect NaN comparison'
  },
  'no-unsafe-finally': {
    severity: 'high',
    category: 'correctness',
    title: 'Unsafe finally block'
  },
  'no-fallthrough': {
    severity: 'medium',
    category: 'correctness',
    title: 'Switch case fallthrough'
  },
  'no-sparse-arrays': {
    severity: 'medium',
    category: 'correctness',
    title: 'Sparse array'
  },
  'no-cond-assign': {
    severity: 'high',
    category: 'correctness',
    title: 'Assignment in condition'
  },
  'eqeqeq': {
    severity: 'medium',
    category: 'correctness',
    title: 'Suspicious equality'
  },
  'no-unused-vars': {
    severity: 'medium',
    category: 'maintainability',
    title: 'Unused variable'
  },
  'no-empty-pattern': {
    severity: 'medium',
    category: 'correctness',
    title: 'Empty destructuring pattern'
  },
  'no-invalid-regexp': {
    severity: 'high',
    category: 'correctness',
    title: 'Invalid regular expression'
  },
  'no-control-regex': {
    severity: 'medium',
    category: 'correctness',
    title: 'Control character in regular expression'
  },
  'no-unexpected-multiline': {
    severity: 'high',
    category: 'correctness',
    title: 'Unexpected multiline expression'
  },
  'no-constant-binary-expression': {
    severity: 'medium',
    category: 'correctness',
    title: 'Constant binary expression'
  },
  'no-func-assign': {
    severity: 'high',
    category: 'correctness',
    title: 'Reassignment of function declaration'
  },
  'no-import-assign': {
    severity: 'high',
    category: 'correctness',
    title: 'Assignment to imported binding'
  },
  'no-setter-return': {
    severity: 'high',
    category: 'correctness',
    title: 'Return from setter'
  },
  'no-loss-of-precision': {
    severity: 'medium',
    category: 'correctness',
    title: 'Loss of precision'
  },
  'no-unmodified-loop-condition': {
    severity: 'medium',
    category: 'correctness',
    title: 'Unmodified loop condition'
  },
  'no-constructor-return': {
    severity: 'high',
    category: 'correctness',
    title: 'Return in constructor'
  }
});

/**
 * Builds the rules map for ESLint configuration from RULE_METADATA.
 * @returns {Record<string, 'error'>}
 */
function buildEslintRulesConfig() {
  const rules = {};
  for (const ruleId of Object.keys(RULE_METADATA)) {
    if (ruleId === 'eqeqeq') {
      rules[ruleId] = ['error', 'always'];
    } else if (ruleId === 'no-unused-vars') {
      rules[ruleId] = ['error', { vars: 'all', args: 'after-used', ignoreRestSiblings: false }];
    } else {
      rules[ruleId] = 'error';
    }
  }
  return rules;
}

let cachedEslintInstance = null;

/**
 * Returns a singleton programmatic ESLint instance configured with internal deterministic rules.
 * @returns {ESLint}
 */
function getEslintInstance() {
  if (!cachedEslintInstance) {
    cachedEslintInstance = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
          languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: {
              ecmaFeatures: {
                jsx: true
              }
            },
            globals: {
              ...globals.browser,
              ...globals.node,
              ...globals.builtin
            }
          },
          rules: buildEslintRulesConfig()
        }
      ],
      fix: false
    });
  }
  return cachedEslintInstance;
}

/**
 * Analyzes JavaScript or JSX source code using programmatic ESLint with internal rules.
 *
 * @param {Object} params
 * @param {string} params.source - Raw JavaScript or JSX source code.
 * @param {string} params.relativePath - Relative file path for diagnostics and JSX detection.
 * @returns {Promise<{
 *   relativePath: string,
 *   findings: Array<import('../review/finding.js').FindingSchema>,
 *   statistics: { errors: number, warnings: number, fixable: number }
 * }>}
 * @throws {EslintAnalysisError} When ESLint encounters a fatal analysis error.
 */
export async function analyzeWithEslint({ source, relativePath }) {
  if (typeof source !== 'string') {
    throw new TypeError('Source code must be a string.');
  }

  if (typeof relativePath !== 'string' || relativePath.trim().length === 0) {
    throw new TypeError('Relative path must be a non-empty string.');
  }

  const eslint = getEslintInstance();

  let results;
  try {
    results = await eslint.lintText(source, {
      filePath: relativePath
    });
  } catch (error) {
    throw new EslintAnalysisError(
      `Failed to analyze file "${relativePath}" with ESLint: ${error.message}`,
      error
    );
  }

  const findings = [];
  let fixableCount = 0;

  if (Array.isArray(results) && results.length > 0) {
    const fileResult = results[0];

    for (const msg of fileResult.messages) {
      if (msg.severity === 0) {
        continue;
      }

      if (!msg.ruleId) {
        // Fatal syntax or configuration error encountered by ESLint
        throw new EslintAnalysisError(
          `ESLint syntax/analyzer failure in "${relativePath}" at ${msg.line || 1}:${msg.column || 1}: ${msg.message}`
        );
      }

      const meta = RULE_METADATA[msg.ruleId] || {
        severity: 'medium',
        category: 'correctness',
        title: msg.ruleId
      };

      const lineStart = msg.line && msg.line > 0 ? msg.line : 1;
      const columnStart = msg.column && msg.column > 0 ? msg.column : 1;
      let lineEnd = msg.endLine && msg.endLine >= lineStart ? msg.endLine : lineStart;
      let columnEnd = msg.endColumn && msg.endColumn > 0 ? msg.endColumn : columnStart;

      if (lineEnd === lineStart && columnEnd < columnStart) {
        columnEnd = columnStart;
      }

      let suggestion = null;
      if (Array.isArray(msg.suggestions) && msg.suggestions.length > 0 && typeof msg.suggestions[0].desc === 'string') {
        suggestion = msg.suggestions[0].desc;
      }

      const isFixable = Boolean(msg.fix);
      if (isFixable) {
        fixableCount++;
      }

      const rawFinding = {
        source: 'eslint',
        ruleId: msg.ruleId,
        severity: meta.severity,
        category: meta.category,
        title: meta.title,
        message: msg.message,
        relativePath,
        lineStart,
        columnStart,
        lineEnd,
        columnEnd,
        suggestion,
        fixable: isFixable
      };

      findings.push(validateFinding(rawFinding));
    }
  }

  const sortedFindings = sortFindings(findings);

  let errorFindingsCount = 0;
  let warningFindingsCount = 0;

  for (const f of sortedFindings) {
    if (f.severity === 'high' || f.severity === 'critical') {
      errorFindingsCount++;
    } else {
      warningFindingsCount++;
    }
  }

  return {
    relativePath,
    findings: sortedFindings,
    statistics: {
      errors: errorFindingsCount,
      warnings: warningFindingsCount,
      fixable: fixableCount
    }
  };
}
