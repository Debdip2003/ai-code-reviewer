/**
 * AI Provider abstraction module.
 * Defines the abstract interface and factory for AI code review providers.
 */

import { AIProvider, AIProviderError } from './provider-base.js';
import { OpenAIProvider } from './providers/openai-provider.js';

export { AIProvider, AIProviderError };

/**
 * Factory function to instantiate an AI provider.
 *
 * @param {Object} options
 * @param {'openai' | 'groq' | string} [options.provider='openai'] - Provider identifier.
 * @param {string} [options.apiKey] - Explicit API key (optional).
 * @param {unknown} [options.client] - Injected client instance for testing.
 * @param {string} [options.baseURL] - Custom base URL for OpenAI-compatible endpoints.
 * @param {number} [options.timeoutMs] - Timeout in milliseconds.
 * @returns {AIProvider} Configured AI provider instance.
 * @throws {AIProviderError} If provider is unsupported or invalid.
 */
export function createAIProvider(options = {}) {
  const providerName = options.provider || 'openai';

  if (providerName === 'openai' || providerName === 'groq') {
    const baseURL = options.baseURL || (providerName === 'groq' ? 'https://api.groq.com/openai/v1' : undefined);
    return new OpenAIProvider({
      apiKey: options.apiKey,
      client: options.client,
      baseURL,
      timeoutMs: options.timeoutMs
    });
  }

  throw new AIProviderError(`Unsupported AI provider "${providerName}". Supported providers: "openai", "groq".`, {
    code: 'provider-error'
  });
}
