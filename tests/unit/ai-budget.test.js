import { describe, it, expect } from 'vitest';
import { AIBudgetManager, getModelPricing } from '../../src/ai/budget.js';

describe('AI Budget Manager', () => {
  it('should return pricing for known default model gpt-5.6-luna', () => {
    const pricing = getModelPricing('gpt-5.6-luna');
    expect(pricing).toBeDefined();
    expect(pricing.inputPerMillion).toBe(0.20);
    expect(pricing.outputPerMillion).toBe(1.20);
    expect(pricing.pricingAsOf).toBe('2026-09-05');
  });

  it('should return null pricing for unknown models without guessing', () => {
    expect(getModelPricing('custom-model-999')).toBeNull();
  });

  it('should enforce maxRequests limit', () => {
    const budget = new AIBudgetManager({
      model: 'gpt-5.6-luna',
      maxRequests: 2
    });

    expect(budget.canAttemptRequest({ estimatedInputTokens: 500 }).allowed).toBe(true);
    budget.recordAttempt(500);
    budget.recordCompleted({ inputTokens: 500, outputTokens: 200 });

    expect(budget.canAttemptRequest({ estimatedInputTokens: 500 }).allowed).toBe(true);
    budget.recordAttempt(500);
    budget.recordCompleted({ inputTokens: 500, outputTokens: 200 });

    // 3rd attempt should be blocked
    const check = budget.canAttemptRequest({ estimatedInputTokens: 500 });
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe('max-requests-reached');
    expect(budget.stoppedByBudget).toBe(true);
  });

  it('should reject chunks exceeding maxInputTokensPerChunk', () => {
    const budget = new AIBudgetManager({
      maxInputTokensPerChunk: 1000
    });

    expect(budget.canAttemptRequest({ estimatedInputTokens: 500 }).allowed).toBe(true);
    const oversized = budget.canAttemptRequest({ estimatedInputTokens: 1500 });
    expect(oversized.allowed).toBe(false);
    expect(oversized.reason).toBe('chunk-exceeds-max-tokens');
  });

  it('should stop requests before exceeding maxEstimatedCostUsd for known models', () => {
    const budget = new AIBudgetManager({
      model: 'gpt-5.6-luna',
      maxEstimatedCostUsd: 0.001, // Very low budget
      maxOutputTokens: 2000
    });

    // Each request with 2000 output tokens costs ~0.0024 USD which exceeds 0.001
    const check = budget.canAttemptRequest({ estimatedInputTokens: 1000 });
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe('max-cost-exceeded');
    expect(budget.stoppedByBudget).toBe(true);
  });

  it('should report cost as null for unknown configured models while still tracking tokens', () => {
    const budget = new AIBudgetManager({
      model: 'some-custom-model',
      maxRequests: 5
    });

    budget.recordAttempt(500);
    budget.recordCompleted({ inputTokens: 450, outputTokens: 120 });

    const summary = budget.getSummary();
    expect(summary.pricingAvailable).toBe(false);
    expect(summary.estimatedCostUsd).toBeNull();
    expect(summary.actualInputTokens).toBe(450);
    expect(summary.actualOutputTokens).toBe(120);
    expect(summary.requestsCompleted).toBe(1);
  });

  it('should accumulate actual usage and accurately calculate cost for known models', () => {
    const budget = new AIBudgetManager({
      model: 'gpt-5.6-luna',
      maxEstimatedCostUsd: 1.0
    });

    budget.recordAttempt(1_000_000);
    budget.recordCompleted({ inputTokens: 1_000_000, outputTokens: 1_000_000 });

    const summary = budget.getSummary();
    // 1M input ($0.20) + 1M output ($1.20) = $1.40
    expect(summary.estimatedCostUsd).toBeCloseTo(1.40, 2);
    expect(summary.actualInputTokens).toBe(1_000_000);
    expect(summary.actualOutputTokens).toBe(1_000_000);
  });
});
