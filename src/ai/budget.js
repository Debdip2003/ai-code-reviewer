/**
 * AI Review Budget Manager and Model Pricing Registry.
 * Tracks requests, token consumption, and cost estimates while enforcing configured limits.
 */

/**
 * Versioned pricing registry for known models.
 * Rates are expressed in USD per 1,000,000 tokens.
 */
export const MODEL_PRICING_REGISTRY = Object.freeze({
  'gpt-5.6-luna': Object.freeze({
    inputPerMillion: 0.20,
    outputPerMillion: 1.20,
    pricingAsOf: '2026-09-05'
  }),
  'openai/gpt-oss-120b': Object.freeze({
    inputPerMillion: 0.15,
    outputPerMillion: 0.60,
    pricingAsOf: '2026-09-06'
  }),
  'openai/gpt-oss-20b': Object.freeze({
    inputPerMillion: 0.075,
    outputPerMillion: 0.30,
    pricingAsOf: '2026-09-06'
  }),
  'llama-3.3-70b-versatile': Object.freeze({
    inputPerMillion: 0.59,
    outputPerMillion: 0.79,
    pricingAsOf: '2026-09-06'
  })
});

/**
 * Retrieves pricing metadata for a specified model.
 * @param {string} modelName
 * @returns {{ inputPerMillion: number, outputPerMillion: number, pricingAsOf: string } | null}
 */
export function getModelPricing(modelName) {
  if (typeof modelName !== 'string') return null;
  return MODEL_PRICING_REGISTRY[modelName] || null;
}

/**
 * Manages and enforces AI review budget constraints.
 */
export class AIBudgetManager {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.model='gpt-5.6-luna'] - Model name.
   * @param {number} [options.maxRequests=20] - Maximum requests allowed.
   * @param {number} [options.maxInputTokensPerChunk=12000] - Max tokens per chunk.
   * @param {number} [options.maxEstimatedCostUsd=0.25] - Maximum total cost in USD.
   * @param {number} [options.maxOutputTokens=2000] - Configured max output tokens.
   */
  constructor(options = {}) {
    this.model = options.model || 'gpt-5.6-luna';
    this.maxRequests = typeof options.maxRequests === 'number' ? options.maxRequests : 20;
    this.maxInputTokensPerChunk =
      typeof options.maxInputTokensPerChunk === 'number' ? options.maxInputTokensPerChunk : 12000;
    this.maxEstimatedCostUsd =
      typeof options.maxEstimatedCostUsd === 'number' ? options.maxEstimatedCostUsd : 0.25;
    this.defaultMaxOutputTokens =
      typeof options.maxOutputTokens === 'number' ? options.maxOutputTokens : 2000;

    this.pricing = getModelPricing(this.model);

    this.requestsAttempted = 0;
    this.requestsCompleted = 0;
    this.totalEstimatedInputTokens = 0;
    this.totalActualInputTokens = 0;
    this.totalActualOutputTokens = 0;
    this.hasActualTokens = false;
    this.accumulatedCostUsd = 0;
    this.stoppedByBudget = false;
    this.stopReason = null;
  }

  /**
   * Evaluates if a new request can be executed within current budget limits.
   *
   * @param {Object} params
   * @param {number} params.estimatedInputTokens - Estimated input tokens for this chunk.
   * @param {number} [params.maxOutputTokens] - Expected max output tokens for this request.
   * @returns {{ allowed: boolean, reason?: string }}
   */
  canAttemptRequest({ estimatedInputTokens, maxOutputTokens }) {
    if (this.stoppedByBudget) {
      return { allowed: false, reason: this.stopReason || 'budget-exhausted' };
    }

    // 1. Check max requests limit
    if (this.requestsAttempted >= this.maxRequests) {
      this.stoppedByBudget = true;
      this.stopReason = 'max-requests-reached';
      return { allowed: false, reason: this.stopReason };
    }

    // 2. Check per-chunk input token limit
    if (estimatedInputTokens > this.maxInputTokensPerChunk) {
      return { allowed: false, reason: 'chunk-exceeds-max-tokens' };
    }

    // 3. Check estimated cost limit (only if pricing is known for the model)
    if (this.pricing) {
      const outputTokensEstimate =
        typeof maxOutputTokens === 'number' && maxOutputTokens > 0
          ? maxOutputTokens
          : this.defaultMaxOutputTokens;

      const requestCostEstimate =
        (estimatedInputTokens / 1_000_000) * this.pricing.inputPerMillion +
        (outputTokensEstimate / 1_000_000) * this.pricing.outputPerMillion;

      if (this.accumulatedCostUsd + requestCostEstimate > this.maxEstimatedCostUsd) {
        this.stoppedByBudget = true;
        this.stopReason = 'max-cost-exceeded';
        return { allowed: false, reason: this.stopReason };
      }
    }

    return { allowed: true };
  }

  /**
   * Records a request attempt before dispatching.
   * @param {number} estimatedInputTokens
   */
  recordAttempt(estimatedInputTokens = 0) {
    this.requestsAttempted++;
    this.totalEstimatedInputTokens += estimatedInputTokens;
  }

  /**
   * Records a completed request with actual usage from provider.
   *
   * @param {Object} usage
   * @param {number | null} [usage.inputTokens]
   * @param {number | null} [usage.outputTokens]
   * @param {number} [fallbackEstimatedInputTokens=0]
   */
  recordCompleted(usage = {}, fallbackEstimatedInputTokens = 0) {
    this.requestsCompleted++;

    const inputTokens = typeof usage?.inputTokens === 'number' ? usage.inputTokens : null;
    const outputTokens = typeof usage?.outputTokens === 'number' ? usage.outputTokens : null;

    if (inputTokens !== null) {
      this.totalActualInputTokens += inputTokens;
      this.hasActualTokens = true;
    }
    if (outputTokens !== null) {
      this.totalActualOutputTokens += outputTokens;
      this.hasActualTokens = true;
    }

    if (this.pricing) {
      const effectiveInput = inputTokens !== null ? inputTokens : fallbackEstimatedInputTokens;
      const effectiveOutput = outputTokens !== null ? outputTokens : this.defaultMaxOutputTokens;

      const requestCost =
        (effectiveInput / 1_000_000) * this.pricing.inputPerMillion +
        (effectiveOutput / 1_000_000) * this.pricing.outputPerMillion;

      this.accumulatedCostUsd += requestCost;
    }
  }

  /**
   * Returns current budget and consumption summary.
   *
   * @returns {{
   *   model: string,
   *   pricingAvailable: boolean,
   *   requestsAttempted: number,
   *   requestsCompleted: number,
   *   estimatedInputTokens: number,
   *   actualInputTokens: number | null,
   *   actualOutputTokens: number | null,
   *   estimatedCostUsd: number | null,
   *   stoppedByBudget: boolean,
   *   stopReason: string | null
   * }}
   */
  getSummary() {
    return {
      model: this.model,
      pricingAvailable: Boolean(this.pricing),
      requestsAttempted: this.requestsAttempted,
      requestsCompleted: this.requestsCompleted,
      estimatedInputTokens: this.totalEstimatedInputTokens,
      actualInputTokens: this.hasActualTokens ? this.totalActualInputTokens : null,
      actualOutputTokens: this.hasActualTokens ? this.totalActualOutputTokens : null,
      estimatedCostUsd: this.pricing ? Number(this.accumulatedCostUsd.toFixed(6)) : null,
      stoppedByBudget: this.stoppedByBudget,
      stopReason: this.stopReason
    };
  }
}
