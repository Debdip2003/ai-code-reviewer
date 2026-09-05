/**
 * OpenAI Provider implementation using OpenAI Responses API with Structured Outputs.
 */

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { AIProvider, AIProviderError } from '../provider-base.js';
import { AIReviewResponseSchema, sanitizeRawAIFindings } from '../response-schema.js';
import { buildReviewPrompt } from '../prompts.js';

/**
 * Sanitizes an error message by stripping API keys and sensitive tokens.
 * @param {string} text
 * @returns {string}
 */
function sanitizeErrorMessage(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, '[REDACTED_API_KEY]')
    .replace(/gsk_[a-zA-Z0-9_-]{10,}/g, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]');
}

/**
 * Classifies an arbitrary error into a sanitized AIProviderError.
 *
 * @param {unknown} err
 * @returns {AIProviderError}
 */
function classifyOpenAIError(err) {
  if (err instanceof AIProviderError) {
    return err;
  }

  const rawMessage = err && typeof err === 'object' && typeof err.message === 'string'
    ? err.message
    : String(err);
  const cleanMessage = sanitizeErrorMessage(rawMessage);

  const status = err && typeof err === 'object' && typeof err.status === 'number'
    ? err.status
    : undefined;
  const name = err && typeof err === 'object' && typeof err.name === 'string'
    ? err.name
    : '';

  // 1. Authentication failures (401, 403, AuthenticationError)
  if (
    status === 401 ||
    status === 403 ||
    name === 'AuthenticationError' ||
    name === 'PermissionDeniedError' ||
    /incorrect api key|invalid api key|unauthorized|authentication/i.test(cleanMessage)
  ) {
    return new AIProviderError(`AI provider authentication failed: ${cleanMessage}`, {
      code: 'authentication',
      status: status || 401,
      cause: err
    });
  }

  // 2. Rate limit (429, RateLimitError)
  if (
    status === 429 ||
    name === 'RateLimitError' ||
    /rate limit|quota exceeded|too many requests/i.test(cleanMessage)
  ) {
    return new AIProviderError(`AI provider rate limit reached: ${cleanMessage}`, {
      code: 'rate-limit',
      status: 429,
      cause: err
    });
  }

  // 3. Timeout (APIConnectionTimeoutError, AbortError, timeout)
  if (
    name === 'APIConnectionTimeoutError' ||
    name === 'TimeoutError' ||
    /timed? ?out/i.test(cleanMessage)
  ) {
    return new AIProviderError(`AI provider request timed out: ${cleanMessage}`, {
      code: 'timeout',
      status,
      cause: err
    });
  }

  // 4. Network failures (APIConnectionError, fetch failed, socket hang up)
  if (
    name === 'APIConnectionError' ||
    /fetch failed|network|econnrefused|econnreset|enotfound|socket hang up/i.test(cleanMessage)
  ) {
    return new AIProviderError(`AI provider network connection failed: ${cleanMessage}`, {
      code: 'network',
      status,
      cause: err
    });
  }

  // 5. Schema validation / invalid response
  if (
    name === 'ZodError' ||
    name === 'LengthFinishReasonError' ||
    name === 'ContentFilterFinishReasonError' ||
    /did not match schema|invalid response|failed to parse/i.test(cleanMessage)
  ) {
    return new AIProviderError(`AI provider invalid response or schema mismatch: ${cleanMessage}`, {
      code: 'invalid-response',
      status,
      cause: err
    });
  }

  // 6. Generic / 5xx provider error
  return new AIProviderError(`AI provider error: ${cleanMessage}`, {
    code: 'provider-error',
    status,
    cause: err
  });
}

/**
 * OpenAI / Groq AIProvider implementation.
 */
export class OpenAIProvider extends AIProvider {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.apiKey] - Explicit OpenAI or Groq API key.
   * @param {OpenAI} [options.client] - Injected OpenAI client instance.
   * @param {string} [options.baseURL] - Base URL override (e.g. Groq endpoint).
   * @param {number} [options.timeoutMs=30000] - Request timeout in milliseconds.
   */
  constructor({ apiKey, client, baseURL, timeoutMs = 30000 } = {}) {
    super();
    this.timeoutMs = timeoutMs;
    this.baseURL = baseURL;

    if (client) {
      this.client = client;
      this.isGroq = Boolean(
        (baseURL && baseURL.includes('groq.com')) ||
        (client.baseURL && typeof client.baseURL === 'string' && client.baseURL.includes('groq.com'))
      );
    } else {
      const resolvedKey = apiKey || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
      if (!resolvedKey || typeof resolvedKey !== 'string' || resolvedKey.trim().length === 0) {
        throw new AIProviderError(
          'OpenAI / Groq API key is missing. Set the OPENAI_API_KEY or GROQ_API_KEY environment variable or pass an explicit apiKey.',
          { code: 'authentication' }
        );
      }
      this.isGroq = Boolean(
        resolvedKey.startsWith('gsk_') ||
        process.env.GROQ_API_KEY ||
        (baseURL && baseURL.includes('groq.com'))
      );

      const resolvedBaseURL = baseURL || (this.isGroq ? 'https://api.groq.com/openai/v1' : undefined);
      this.baseURL = resolvedBaseURL;

      this.client = new OpenAI({
        apiKey: resolvedKey,
        baseURL: resolvedBaseURL,
        timeout: timeoutMs
      });
    }
  }

  /**
   * Reviews a semantic code chunk using OpenAI Responses API or Groq Chat Completions.
   *
   * @param {Object} request
   * @param {Object} request.chunk - Semantic code chunk.
   * @param {string} [request.model='gpt-5.6-luna'] - Target OpenAI / Groq model.
   * @param {'none' | 'low' | 'medium' | 'high'} [request.reasoningEffort] - Reasoning effort.
   * @param {number} [request.maxOutputTokens] - Maximum output tokens.
   * @param {number} [request.retries=2] - Retry attempts.
   * @param {AbortSignal} [request.signal] - Abort signal.
   * @returns {Promise<{ findings: Array<Object>, usage: { inputTokens: number | null, outputTokens: number | null } }>}
   */
  async reviewChunk(request) {
    if (!request || !request.chunk) {
      throw new TypeError('request.chunk is required');
    }

    const { chunk, model, reasoningEffort, maxOutputTokens, retries = 2, signal } = request;

    // Default model resolution: if Groq is active and model is default gpt-5.6-luna, switch to Groq model
    const targetModel =
      this.isGroq && (!model || model === 'gpt-5.6-luna')
        ? 'openai/gpt-oss-120b'
        : model || 'gpt-5.6-luna';

    const { system, user } = buildReviewPrompt({
      chunk,
      staticFindings: chunk.staticFindings || []
    });

    const maxAttempts = Math.max(0, retries) + 1;
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const options = signal ? { signal } : undefined;

        // Groq / OpenAI Chat Completions fallback mode
        if (this.isGroq || typeof this.client?.responses?.parse !== 'function') {
          const chatParams = {
            model: targetModel,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user }
            ],
            response_format: { type: 'json_object' }
          };

          if (typeof maxOutputTokens === 'number' && maxOutputTokens > 0) {
            chatParams.max_tokens = maxOutputTokens;
          }

          const completion = await this.client.chat.completions.create(chatParams, options);
          const rawContent = completion.choices?.[0]?.message?.content || '{}';

          let parsedJson;
          try {
            parsedJson = JSON.parse(rawContent);
          } catch (jsonErr) {
            throw new AIProviderError(`Failed to parse AI response JSON: ${jsonErr.message}`, {
              code: 'invalid-response',
              cause: jsonErr
            });
          }

          const sanitized = sanitizeRawAIFindings(parsedJson);
          const validated = AIReviewResponseSchema.parse(sanitized);
          const findings = Array.isArray(validated?.findings) ? validated.findings : [];

          return {
            findings,
            usage: {
              inputTokens: completion.usage?.prompt_tokens ?? null,
              outputTokens: completion.usage?.completion_tokens ?? null
            }
          };
        }

        // Standard OpenAI Responses API
        const parseParams = {
          model: targetModel,
          input: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          text: {
            format: zodTextFormat(AIReviewResponseSchema, 'code_review')
          },
          store: false
        };

        if (typeof maxOutputTokens === 'number' && maxOutputTokens > 0) {
          parseParams.max_output_tokens = maxOutputTokens;
        }

        if (reasoningEffort && reasoningEffort !== 'none') {
          parseParams.reasoning = { effort: reasoningEffort };
        }

        const response = await this.client.responses.parse(parseParams, options);

        // Detect refusal
        if (
          response.refusal ||
          (response.status === 'incomplete' && response.incomplete_details?.reason === 'refusal')
        ) {
          return {
            findings: [],
            usage: {
              inputTokens: response.usage?.input_tokens ?? null,
              outputTokens: response.usage?.output_tokens ?? null
            }
          };
        }

        const parsed = response.output_parsed;
        const findings = Array.isArray(parsed?.findings) ? parsed.findings : [];

        return {
          findings,
          usage: {
            inputTokens: response.usage?.input_tokens ?? null,
            outputTokens: response.usage?.output_tokens ?? null
          }
        };
      } catch (err) {
        const classified = classifyOpenAIError(err);
        lastError = classified;

        // Determine if error is retriable
        const isRetriable =
          (classified.code === 'rate-limit' && classified.status === 429) ||
          classified.code === 'network' ||
          (classified.code === 'provider-error' &&
            typeof classified.status === 'number' &&
            classified.status >= 500 &&
            classified.status < 600);

        if (isRetriable && attempt < maxAttempts - 1) {
          const delay = Math.min(2000, 100 * Math.pow(2, attempt) + Math.random() * 50);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw classified;
      }
    }

    throw lastError;
  }
}
