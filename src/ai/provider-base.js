/**
 * Base AI Provider abstractions.
 * Isolated to prevent circular dependency cycles between provider.js and concrete provider subclasses.
 */

/**
 * Custom error class for AI provider failures with sanitized error classifications.
 */
export class AIProviderError extends Error {
  /**
   * @param {string} message - Human-readable, sanitized error description (no API keys or raw headers).
   * @param {Object} [options={}]
   * @param {'authentication' | 'rate-limit' | 'timeout' | 'network' | 'invalid-response' | 'provider-error'} [options.code='provider-error'] - Categorized error code.
   * @param {number} [options.status] - HTTP status code if applicable.
   * @param {unknown} [options.cause] - Underlying cause.
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'AIProviderError';
    this.code = options.code || 'provider-error';
    if (options.status !== undefined) {
      this.status = options.status;
    }
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/**
 * Abstract AI Provider base class.
 */
export class AIProvider {
  /**
   * Reviews an individual code chunk using the provider's AI model.
   *
   * @param {Object} request - Request parameters.
   * @param {Object} request.chunk - Semantic code chunk.
   * @param {string} request.model - Target model name.
   * @param {'none' | 'low' | 'medium' | 'high'} [request.reasoningEffort] - Reasoning effort.
   * @param {number} [request.maxOutputTokens] - Maximum output tokens.
   * @param {number} [request.retries=2] - Maximum retry attempts.
   * @param {AbortSignal} [request.signal] - Abort signal.
   * @returns {Promise<{ findings: Array<Object>, usage: { inputTokens: number | null, outputTokens: number | null } }>}
   */
  async reviewChunk(_request) {
    throw new Error('reviewChunk() must be implemented');
  }

  /**
   * Proposes AI planning enhancements for code splitting candidates.
   *
   * @param {Object} request - Request parameters.
   * @param {string} request.sourceFile - Source file path.
   * @param {string} request.source - Raw source code.
   * @param {Array<Object>} request.candidates - Deterministic candidate list.
   * @param {string} [request.model] - Target AI model name.
   * @param {number} [request.maxOutputTokens] - Maximum output tokens.
   * @param {AbortSignal} [request.signal] - Abort signal.
   * @returns {Promise<{ candidates: Array<{ id: string, reason?: string, confidence?: number, additionalRisks?: string[] }> }>}
   */
  async planSplit(_request) {
    throw new Error('planSplit() must be implemented');
  }
}

