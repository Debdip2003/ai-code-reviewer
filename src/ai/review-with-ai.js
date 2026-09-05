/**
 * AI Review Service orchestrator.
 * Coordinates semantic chunking, budget checks, concurrency-bounded provider execution,
 * finding normalization, and error containment for individual files.
 */

import { createSemanticChunks } from './chunker.js';
import { normalizeAIFindings } from './response-schema.js';
import { deduplicateFindings } from '../review/deduplicate.js';
import { sortFindings } from '../review/severity.js';
import { findingIntersectsChangedLines } from '../review/filter-by-scope.js';

/**
 * Concurrently processes an array of items with bounded concurrency.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapConcurrent(items, concurrency, fn) {
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
 * Reviews a single parsed file using AI assistance.
 *
 * @param {Object} params
 * @param {Object} params.parsedFile - Parsed file containing { source, ast, relativePath, absolutePath }.
 * @param {Object} [params.astSummary] - Structural AST summary.
 * @param {Array<Object>} [params.staticFindings=[]] - Deterministic findings for the file.
 * @param {Object} params.config - Resolved reviewer configuration.
 * @param {import('./provider.js').AIProvider} params.provider - AI provider instance.
 * @param {import('./budget.js').AIBudgetManager} params.budget - Budget manager instance.
 * @param {Array<{ start: number, end: number }>} [params.changedLines] - Optional changed line ranges for scope filtering.
 * @returns {Promise<{
 *   enabled: boolean,
 *   findings: Array<Object>,
 *   chunks: { created: number, reviewed: number, skipped: number },
 *   usage: { requests: number, inputTokens: number | null, outputTokens: number | null, estimatedCostUsd: number | null },
 *   failures: Array<{ relativePath: string, stage: string, line: number, column: number, reason: string }>
 * }>}
 */
export async function reviewWithAI({
  parsedFile,
  astSummary,
  staticFindings = [],
  config = {},
  provider,
  budget,
  changedLines,
  signal
}) {
  const aiConfig = config.ai || {};

  // 1. If AI is disabled or aborted, return immediately
  if (!aiConfig.enabled || signal?.aborted) {
    return {
      enabled: false,
      findings: [],
      chunks: {
        created: 0,
        reviewed: 0,
        skipped: 0
      },
      usage: {
        requests: 0,
        inputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null
      },
      failures: []
    };
  }

  if (!parsedFile || !parsedFile.ast || typeof parsedFile.source !== 'string') {
    return {
      enabled: true,
      findings: [],
      chunks: { created: 0, reviewed: 0, skipped: 0 },
      usage: { requests: 0, inputTokens: null, outputTokens: null, estimatedCostUsd: null },
      failures: []
    };
  }

  // 2. Partition file into semantic chunks
  const { chunks, skipped } = createSemanticChunks({
    source: parsedFile.source,
    ast: parsedFile.ast,
    relativePath: parsedFile.relativePath,
    astSummary,
    maxInputTokens: aiConfig.maxInputTokensPerChunk || 12000
  });

  const hasScopeFilter = Array.isArray(changedLines) && changedLines.length > 0;
  const eligibleChunks = hasScopeFilter
    ? chunks.filter((chunk) =>
        changedLines.some(
          (range) => chunk.lineStart <= range.end && chunk.lineEnd >= range.start
        )
      )
    : chunks;

  const totalCreated = chunks.length + skipped.length;
  let reviewedCount = 0;
  let skippedCount = skipped.length + (chunks.length - eligibleChunks.length);

  const rawAIFindings = [];
  const chunkFailures = [];

  const concurrency = Math.min(config.concurrency || 2, 5);

  // 3. Process each eligible chunk concurrently with bounded concurrency
  await mapConcurrent(eligibleChunks, concurrency, async (chunk) => {
    if (signal?.aborted) {
      skippedCount++;
      return;
    }

    // Check budget before calling provider
    const budgetCheck = budget
      ? budget.canAttemptRequest({
          estimatedInputTokens: chunk.estimatedInputTokens,
          maxOutputTokens: aiConfig.maxOutputTokens
        })
      : { allowed: true };

    if (!budgetCheck.allowed) {
      skippedCount++;
      return;
    }

    if (budget) {
      budget.recordAttempt(chunk.estimatedInputTokens);
    }

    try {
      const response = await provider.reviewChunk({
        chunk: {
          ...chunk,
          staticFindings
        },
        model: aiConfig.model,
        reasoningEffort: aiConfig.reasoningEffort,
        maxOutputTokens: aiConfig.maxOutputTokens,
        retries: aiConfig.retries,
        changedLines,
        signal
      });

      if (budget) {
        budget.recordCompleted(response.usage, chunk.estimatedInputTokens);
      }

      reviewedCount++;

      if (Array.isArray(response.findings) && response.findings.length > 0) {
        const normalized = normalizeAIFindings(response.findings, {
          relativePath: parsedFile.relativePath,
          chunkLineStart: chunk.lineStart,
          chunkLineEnd: chunk.lineEnd
        });

        // If changed scope is active, filter AI findings to intersecting lines
        const scoped = hasScopeFilter
          ? normalized.filter((f) => findingIntersectsChangedLines(f, changedLines))
          : normalized;

        rawAIFindings.push(...scoped);
      }
    } catch (err) {
      // Chunk failure does not erase findings from other chunks
      chunkFailures.push({
        relativePath: parsedFile.relativePath,
        stage: 'ai',
        line: chunk.lineStart,
        column: 1,
        reason: err instanceof Error ? err.message : String(err)
      });
    }
  });

  // 4. Deduplicate and sort accepted AI findings
  const deduplicated = deduplicateFindings(rawAIFindings);
  const sorted = sortFindings(deduplicated);

  const budgetSummary = budget ? budget.getSummary() : null;

  return {
    enabled: true,
    findings: sorted,
    chunks: {
      created: totalCreated,
      reviewed: reviewedCount,
      skipped: skippedCount
    },
    usage: {
      requests: budgetSummary ? budgetSummary.requestsCompleted : reviewedCount,
      inputTokens: budgetSummary ? budgetSummary.actualInputTokens : null,
      outputTokens: budgetSummary ? budgetSummary.actualOutputTokens : null,
      estimatedCostUsd: budgetSummary ? budgetSummary.estimatedCostUsd : null
    },
    failures: chunkFailures
  };
}
