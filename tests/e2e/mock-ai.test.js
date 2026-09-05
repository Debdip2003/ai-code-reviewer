import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewRepository } from '../../src/review/review-engine.js';
import { loadConfig } from '../../src/config/load-config.js';
import * as providerModule from '../../src/ai/provider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesRoot = path.resolve(__dirname, '../fixtures');

describe('E2E Mock AI Review Suite', () => {
  it('integrates AI findings from structured provider responses', async () => {
    const cleanDir = path.join(fixturesRoot, 'clean');
    const config = await loadConfig({
      rootDirectory: cleanDir,
      cliOverrides: {
        ai: {
          enabled: true,
          model: 'gpt-5.6-luna',
          maxEstimatedCostUsd: 1.0
        },
        cache: { enabled: false }
      }
    });

    const mockProvider = {
      name: 'openai',
      model: 'gpt-5.6-luna',
      reviewChunk: vi.fn().mockResolvedValue({
        findings: [
          {
            ruleId: 'ai/missing-input-validation',
            severity: 'high',
            category: 'correctness',
            title: 'Missing Type Validation',
            message: 'Function add lacks input type validation for arguments.',
            lineStart: 5,
            columnStart: 1,
            lineEnd: 7,
            columnEnd: 2,
            suggestion: 'Validate that a and b are numbers.',
            confidence: 0.92
          }
        ],
        usage: {
          inputTokens: 150,
          outputTokens: 80
        }
      })
    };

    const spy = vi.spyOn(providerModule, 'createAIProvider').mockReturnValue(mockProvider);

    try {
      const result = await reviewRepository({ rootDirectory: cleanDir, config });

      expect(result.summary.discovered).toBe(1);
      expect(result.summary.ai.enabled).toBe(true);
      expect(result.summary.ai.chunksReviewed).toBeGreaterThan(0);
      expect(result.findings.some((f) => f.source === 'ai' && f.ruleId === 'ai/missing-input-validation')).toBe(true);
      expect(result.summary.findingsBySource.ai).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('filters out AI findings with confidence lower than 0.65', async () => {
    const cleanDir = path.join(fixturesRoot, 'clean');
    const config = await loadConfig({
      rootDirectory: cleanDir,
      cliOverrides: {
        ai: {
          enabled: true,
          model: 'gpt-5.6-luna',
          maxEstimatedCostUsd: 1.0
        },
        cache: { enabled: false }
      }
    });

    const mockProvider = {
      name: 'openai',
      model: 'gpt-5.6-luna',
      reviewChunk: vi.fn().mockResolvedValue({
        findings: [
          {
            ruleId: 'ai/low-confidence-finding',
            severity: 'low',
            category: 'maintainability',
            title: 'Possible Nitpick',
            message: 'Uncertain style suggestion.',
            lineStart: 5,
            columnStart: 1,
            lineEnd: 7,
            columnEnd: 2,
            suggestion: 'Consider renaming.',
            confidence: 0.40 // below 0.65
          }
        ],
        usage: {
          inputTokens: 100,
          outputTokens: 50
        }
      })
    };

    const spy = vi.spyOn(providerModule, 'createAIProvider').mockReturnValue(mockProvider);

    try {
      const result = await reviewRepository({ rootDirectory: cleanDir, config });

      expect(result.findings.some((f) => f.ruleId === 'ai/low-confidence-finding')).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
