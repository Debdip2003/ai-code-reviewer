/**
 * Core review engine orchestrator.
 * Coordinates repository file discovery, Babel AST parsing, ESLint static analysis,
 * custom AST complexity analysis, custom React analysis, finding deduplication, and severity tallying.
 */

import { discoverFiles } from '../scanner/discover-files.js';
import { parseFile } from '../parser/parse-file.js';
import { summarizeAst } from '../parser/summarize-ast.js';
import { analyzeWithEslint } from '../analyzers/eslint-analyzer.js';
import { analyzeComplexity } from '../analyzers/complexity-analyzer.js';
import { analyzeReact } from '../analyzers/react-analyzer.js';
import { createAIProvider } from '../ai/provider.js';
import { AIBudgetManager } from '../ai/budget.js';
import { reviewWithAI } from '../ai/review-with-ai.js';
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
 *   files: Array<{ relativePath: string, astSummary: Object, metrics: { functions: Array<Object>, react: Object }, findings: Array<Object> }>,
 *   failures: Array<{ relativePath: string, stage: 'read' | 'parse' | 'eslint' | 'complexity' | 'react', line: number, column: number, reason: string }>,
 *   findings: Array<Object>,
 *   summary: {
 *     discovered: number,
 *     parsed: number,
 *     analyzed: number,
 *     failed: number,
 *     findings: number,
 *     functionsAnalyzed: number,
 *     componentsAnalyzed: number,
 *     effectsAnalyzed: number,
 *     stateVariablesTracked: number,
 *     findingsBySource: { eslint: number, complexity: number, react: number },
 *     severity: { critical: number, high: number, medium: number, low: number },
 *     ignored: number,
 *     tooLarge: number,
 *     limited: number
 *   }
 * }>}
 */
export async function reviewRepository({ rootDirectory, config = {}, aiProvider }) {
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
  const isAiEnabled = Boolean(config.ai?.enabled);

  let provider = null;
  let budget = null;
  if (isAiEnabled) {
    provider =
      aiProvider ||
      createAIProvider({
        provider: config.ai.provider,
        timeoutMs: config.ai.timeoutMs
      });

    const effectiveModel =
      provider?.isGroq && (!config.ai?.model || config.ai?.model === 'gpt-5.6-luna')
        ? 'openai/gpt-oss-120b'
        : config.ai?.model || 'gpt-5.6-luna';

    budget = new AIBudgetManager({
      model: effectiveModel,
      maxRequests: config.ai.maxRequests,
      maxInputTokensPerChunk: config.ai.maxInputTokensPerChunk,
      maxEstimatedCostUsd: config.ai.maxEstimatedCostUsd,
      maxOutputTokens: config.ai.maxOutputTokens
    });
  }

  let totalAiChunksCreated = 0;
  let totalAiChunksReviewed = 0;
  let totalAiChunksSkipped = 0;

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
          relativePath: file.relativePath,
          options: { react: config.analyzers?.react }
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

      let reactResult = { isReactFile: false, components: [], effects: [], stateVariables: [], findings: [] };
      let hadReactFailure = false;
      let reactFailure = null;

      try {
        reactResult = analyzeReact({
          ast: fileParseResult.ast,
          relativePath: file.relativePath,
          options: config.analyzers?.react
        });
        fileFindings.push(...reactResult.findings);
      } catch (error) {
        hadReactFailure = true;
        reactFailure = {
          relativePath: file.relativePath,
          stage: 'react',
          line: 1,
          column: 1,
          reason: error.message || 'React analysis error'
        };
      }

      const fileAiFailures = [];
      let aiChunks = { created: 0, reviewed: 0, skipped: 0 };

      if (isAiEnabled && provider) {
        try {
          const aiResult = await reviewWithAI({
            parsedFile: fileParseResult,
            astSummary,
            staticFindings: [...fileFindings],
            config,
            provider,
            budget
          });
          fileFindings.push(...aiResult.findings);
          aiChunks = aiResult.chunks;
          if (Array.isArray(aiResult.failures) && aiResult.failures.length > 0) {
            fileAiFailures.push(...aiResult.failures);
          }
        } catch (error) {
          fileAiFailures.push({
            relativePath: file.relativePath,
            stage: 'ai',
            line: 1,
            column: 1,
            reason: error.message || 'AI review error'
          });
        }
      }

      const failures = [];
      if (hadEslintFailure) failures.push(eslintFailure);
      if (hadComplexityFailure) failures.push(complexityFailure);
      if (hadReactFailure) failures.push(reactFailure);
      if (fileAiFailures.length > 0) failures.push(...fileAiFailures);

      return {
        ok: failures.length === 0,
        relativePath: file.relativePath,
        astSummary,
        metrics: {
          functions: complexityResult.functions,
          react: {
            isReactFile: reactResult.isReactFile,
            components: reactResult.components,
            effects: reactResult.effects,
            stateVariables: reactResult.stateVariables
          }
        },
        aiChunks,
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
  let totalComponentsAnalyzed = 0;
  let totalEffectsAnalyzed = 0;
  let totalStateVariablesTracked = 0;

  for (const item of processedResults) {
    if (item.astSummary) {
      parsedCount++;
    }

    if (item.aiChunks) {
      totalAiChunksCreated += item.aiChunks.created || 0;
      totalAiChunksReviewed += item.aiChunks.reviewed || 0;
      totalAiChunksSkipped += item.aiChunks.skipped || 0;
    }

    if (item.metrics) {
      if (Array.isArray(item.metrics.functions)) {
        totalFunctionsAnalyzed += item.metrics.functions.length;
      }
      if (item.metrics.react) {
        if (Array.isArray(item.metrics.react.components)) {
          totalComponentsAnalyzed += item.metrics.react.components.length;
        }
        if (Array.isArray(item.metrics.react.effects)) {
          totalEffectsAnalyzed += item.metrics.react.effects.length;
        }
        if (Array.isArray(item.metrics.react.stateVariables)) {
          totalStateVariablesTracked += item.metrics.react.stateVariables.length;
        }
      }
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
    complexity: 0,
    react: 0,
    ai: 0
  };
  for (const finding of sortedFindings) {
    if (finding.source === 'eslint') {
      findingsBySource.eslint++;
    } else if (finding.source === 'complexity') {
      findingsBySource.complexity++;
    } else if (finding.source === 'react') {
      findingsBySource.react++;
    } else if (finding.source === 'ai') {
      findingsBySource.ai++;
    }
  }

  const budgetSummary = budget ? budget.getSummary() : null;
  const aiSummary = {
    enabled: isAiEnabled,
    model: isAiEnabled
      ? (provider?.isGroq && (!config.ai?.model || config.ai?.model === 'gpt-5.6-luna')
          ? 'openai/gpt-oss-120b'
          : config.ai?.model || 'gpt-5.6-luna')
      : null,
    chunksCreated: totalAiChunksCreated,
    chunksReviewed: totalAiChunksReviewed,
    chunksSkipped: totalAiChunksSkipped,
    requests: budgetSummary ? budgetSummary.requestsCompleted : 0,
    estimatedCostUsd: budgetSummary ? budgetSummary.estimatedCostUsd : null,
    stoppedByBudget: budget ? budget.stoppedByBudget : false
  };

  const summary = {
    discovered: discoveryResult.files.length,
    parsed: parsedCount,
    analyzed: analyzedCount,
    failed: failures.length,
    findings: sortedFindings.length,
    functionsAnalyzed: totalFunctionsAnalyzed,
    componentsAnalyzed: totalComponentsAnalyzed,
    effectsAnalyzed: totalEffectsAnalyzed,
    stateVariablesTracked: totalStateVariablesTracked,
    findingsBySource,
    severity: severityCounts,
    ignored: discoveryResult.skipped.ignored,
    tooLarge: discoveryResult.skipped.tooLarge,
    limited: discoveryResult.skipped.limited,
    ai: aiSummary
  };

  return {
    rootDirectory: discoveryResult.rootDirectory,
    files,
    failures,
    findings: sortedFindings,
    summary
  };
}
