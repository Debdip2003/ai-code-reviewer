import { describe, it, expect, vi } from 'vitest';
import { reviewWithAI } from '../../src/ai/review-with-ai.js';
import { parseJavaScript } from '../../src/parser/parse-javascript.js';
import { AIBudgetManager } from '../../src/ai/budget.js';

describe('reviewWithAI service', () => {
  const source = `export function processOrder(order) {
  if (!order) return null;
  return order.total * 1.1;
}

export function cancelOrder(orderId) {
  return api.cancel(orderId);
}
`;
  const ast = parseJavaScript({ source, filePath: 'src/orders.js' });
  const parsedFile = {
    source,
    ast,
    relativePath: 'src/orders.js',
    absolutePath: '/mock/src/orders.js'
  };

  it('should return disabled response without calling provider when config.ai.enabled is false', async () => {
    const mockProvider = {
      reviewChunk: vi.fn()
    };
    const budget = new AIBudgetManager();

    const result = await reviewWithAI({
      parsedFile,
      config: { ai: { enabled: false } },
      provider: mockProvider,
      budget
    });

    expect(result.enabled).toBe(false);
    expect(result.findings).toEqual([]);
    expect(mockProvider.reviewChunk).not.toHaveBeenCalled();
  });

  it('should review chunks, normalize valid findings, and drop low confidence findings', async () => {
    const mockProvider = {
      reviewChunk: vi.fn().mockImplementation(async ({ chunk }) => {
        if (chunk.symbolName === 'processOrder') {
          return {
            findings: [
              {
                ruleId: 'ai/floating-point-math',
                severity: 'medium',
                category: 'correctness',
                title: 'Floating Point Precision Issue',
                message: 'Direct multiplication by 1.1 may produce precision issues in monetary calculations.',
                lineStart: 3,
                lineEnd: 3,
                suggestion: 'Use integer cents or a decimal library.',
                confidence: 0.9
              },
              {
                ruleId: 'ai/low-confidence-issue',
                severity: 'low',
                category: 'maintainability',
                title: 'Unsure finding',
                message: 'Might be bad',
                lineStart: 2,
                lineEnd: 2,
                suggestion: 'Check it',
                confidence: 0.5 // Should be dropped (< 0.65)
              }
            ],
            usage: { inputTokens: 120, outputTokens: 40 }
          };
        }
        return {
          findings: [],
          usage: { inputTokens: 100, outputTokens: 10 }
        };
      })
    };

    const budget = new AIBudgetManager({ model: 'gpt-5.6-luna' });
    const config = {
      ai: {
        enabled: true,
        model: 'gpt-5.6-luna',
        maxInputTokensPerChunk: 12000
      }
    };

    const result = await reviewWithAI({
      parsedFile,
      config,
      provider: mockProvider,
      budget
    });

    expect(result.enabled).toBe(true);
    expect(result.chunks.reviewed).toBe(2);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].ruleId).toBe('ai/floating-point-math');
    expect(result.findings[0].source).toBe('ai');
    expect(result.findings[0].confidence).toBe(0.9);
  });

  it('should isolate chunk failures so one failing chunk does not drop findings from other chunks', async () => {
    const mockProvider = {
      reviewChunk: vi.fn().mockImplementation(async ({ chunk }) => {
        if (chunk.symbolName === 'processOrder') {
          throw new Error('OpenAI timeout on chunk');
        }
        return {
          findings: [
            {
              ruleId: 'ai/missing-error-handling',
              severity: 'high',
              category: 'correctness',
              title: 'Missing catch handler',
              message: 'api.cancel() promise rejection is unhandled',
              lineStart: 7,
              lineEnd: 7,
              suggestion: 'Add error handling',
              confidence: 0.85
            }
          ],
          usage: { inputTokens: 90, outputTokens: 30 }
        };
      })
    };

    const budget = new AIBudgetManager();
    const config = { ai: { enabled: true } };

    const result = await reviewWithAI({
      parsedFile,
      config,
      provider: mockProvider,
      budget
    });

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].stage).toBe('ai');
    expect(result.failures[0].reason).toContain('OpenAI timeout on chunk');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].ruleId).toBe('ai/missing-error-handling');
  });
});
