/**
 * Core review engine orchestrator.
 * Coordinates repository file discovery, Babel AST parsing, ESLint static analysis,
 * custom AST complexity analysis, finding deduplication, and severity tallying.
 */

import { discoverFiles } from '../scanner/discover-files.js';
import { parseFile } from '../parser/parse-file.js';
import { summarizeAst } from '../parser/summarize-ast.js';
import { analyzeWithEslint } from '../analyzers/eslint-analyzer.js';
import { analyzeComplexity } from '../analyzers/complexity-analyzer.js';
import { deduplicateFindings } from './deduplicate.js';
import { sortFindings, countFindingsBySeverity } from './severity.js';

/**
 * Maps items asynchronously with bounded concurrency while preserving input order.
 *
 * @template T, R
 * @param {T[]} items - Items to process.
 * @param {number} concurrency - Max concurrent async tasks.
 * @param {(item: T, index: number) => Promise<R>} fn - Async mapping function.
 * @returns {Promise<R[]>} Processed results in original order.
 */
export async function mapConcurrent(items, concurrency, fn) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(concurrency || 2, 10));
  const results = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await fn(items[index], index);
    }
  }

  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Orchestrates a comprehensive static review for a target repository.
 *
 * @param {Object} options
 * @param {string} [options.rootDirectory] - Repository root directory to review.
 * @param {import('../config/defaults.js').ReviewerConfig & { rootDirectory?: string }} [options.config] - Resolved reviewer configuration.
 * @returns {Promise<{
 *   rootDirectory: string,
 *   files: Array<{ relativePath: string, astSummary: Object, metrics: { functions: Array<Object> }, findings: Array<Object> }>,
 *   failures: Array<{ relativePath: string, stage: 'read' | 'parse' | 'eslint' | 'complexity', line: number, column: number, reason: string }>,
 *   findings: Array<Object>,
 *   summary: {
 *     discovered: number,
 *     parsed: number,
 *     analyzed: number,
 *     failed: number,
 *     findings: number,
 *     functionsAnalyzed: number,
 *     findingsBySource: { eslint: number, complexity: number },
 *     severity: { critical: number, high: number, medium: number, low: number },
 *     ignored: number,
 *     tooLarge: number,
 *     limited: number
 *   }
 * }>}
 */
export async function reviewRepository({ rootDirectory, config = {} }) {
  const targetRoot = rootDirectory || config.rootDirectory || process.cwd();

  // 1. Discover eligible files
  const discoveryResult = await discoverFiles({
    rootDirectory: targetRoot,
    includePatterns: config.include,
    excludePatterns: config.exclude,
    maxFiles: config.maxFiles,
    maxFileSizeKb: config.maxFileSizeKb
  });

  const concurrency = config.concurrency || 2;

  // 2. Read, parse, and analyze each file with bounded concurrency
  const processedResults = await mapConcurrent(
    discoveryResult.files,
    concurrency,
    async (file) => {
      let fileParseResult;
      try {
        fileParseResult = await parseFile({
          absolutePath: file.absolutePath,
          relativePath: file.relativePath
        });
      } catch (error) {
        const isReadError = error.message && error.message.includes('Failed to read file');
        const line = typeof error.line === 'number' ? error.line : 1;
        const column = typeof error.column === 'number' ? error.column : 0;
        const reason = error.reason || error.message || 'Parse error';

        return {
          ok: false,
          failure: {
            relativePath: file.relativePath,
            stage: isReadError ? 'read' : 'parse',
            line,
            column,
            reason
          }
        };
      }

      const astSummary = summarizeAst({
        ast: fileParseResult.ast,
        relativePath: file.relativePath
      });

      const fileFindings = [];
      let hadEslintFailure = false;
      let eslintFailure = null;

      try {
        const eslintResult = await analyzeWithEslint({
          source: fileParseResult.source,
          relativePath: file.relativePath
        });
        fileFindings.push(...eslintResult.findings);
      } catch (error) {
        hadEslintFailure = true;
        eslintFailure = {
          relativePath: file.relativePath,
          stage: 'eslint',
          line: 1,
          column: 1,
          reason: error.message || 'ESLint analysis error'
        };
      }

      let complexityResult = { functions: [], findings: [] };
      let hadComplexityFailure = false;
      let complexityFailure = null;

      try {
        complexityResult = analyzeComplexity({
          ast: fileParseResult.ast,
          relativePath: file.relativePath,
          options: config.analyzers?.complexity
        });
        fileFindings.push(...complexityResult.findings);
      } catch (error) {
        hadComplexityFailure = true;
        complexityFailure = {
          relativePath: file.relativePath,
          stage: 'complexity',
          line: 1,
          column: 1,
          reason: error.message || 'Complexity analysis error'
        };
      }

      const failures = [];
      if (hadEslintFailure) failures.push(eslintFailure);
      if (hadComplexityFailure) failures.push(complexityFailure);

      return {
        ok: failures.length === 0,
        relativePath: file.relativePath,
        astSummary,
        metrics: {
          functions: complexityResult.functions
        },
        findings: fileFindings,
        failures
      };
    }
  );

  const files = [];
  const failures = [];
  const allRawFindings = [];
  let parsedCount = 0;
  let analyzedCount = 0;
  let totalFunctionsAnalyzed = 0;

  for (const item of processedResults) {
    if (item.astSummary) {
      parsedCount++;
    }

    if (item.metrics) {
      totalFunctionsAnalyzed += item.metrics.functions.length;
    }

    if (item.ok) {
      analyzedCount++;
      files.push({
        relativePath: item.relativePath,
        astSummary: item.astSummary,
        metrics: item.metrics,
        findings: item.findings
      });
      allRawFindings.push(...item.findings);
    } else {
      if (item.failures && item.failures.length > 0) {
        failures.push(...item.failures);
      } else if (item.failure) {
        failures.push(item.failure);
      }
      if (item.findings && item.findings.length > 0) {
        allRawFindings.push(...item.findings);
      }
    }
  }

  // 3. Deduplicate and sort findings
  const deduplicatedFindings = deduplicateFindings(allRawFindings);
  const sortedFindings = sortFindings(deduplicatedFindings);
  const severityCounts = countFindingsBySeverity(sortedFindings);

  const findingsBySource = {
    eslint: 0,
    complexity: 0
  };
  for (const finding of sortedFindings) {
    if (finding.source === 'eslint') {
      findingsBySource.eslint++;
    } else if (finding.source === 'complexity') {
      findingsBySource.complexity++;
    }
  }

  const summary = {
    discovered: discoveryResult.files.length,
    parsed: parsedCount,
    analyzed: analyzedCount,
    failed: failures.length,
    findings: sortedFindings.length,
    functionsAnalyzed: totalFunctionsAnalyzed,
    findingsBySource,
    severity: severityCounts,
    ignored: discoveryResult.skipped.ignored,
    tooLarge: discoveryResult.skipped.tooLarge,
    limited: discoveryResult.skipped.limited
  };

  return {
    rootDirectory: discoveryResult.rootDirectory,
    files,
    failures,
    findings: sortedFindings,
    summary
  };
}
