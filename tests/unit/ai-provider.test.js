import { describe, it, expect, vi } from 'vitest';
import { AIProviderError, createAIProvider } from '../../src/ai/provider.js';
import { OpenAIProvider } from '../../src/ai/providers/openai-provider.js';

describe('OpenAI Provider', () => {
  const sampleChunk = {
    relativePath: 'src/app.js',
    kind: 'function-declaration',
    symbolName: 'run',
    lineStart: 1,
    lineEnd: 5,
    code: 'export function run() { return true; }',
    imports: []
  };

  it('should throw authentication error when API key is missing', () => {
    const originalEnv = process.env.OPENAI_API_KEY;
    const originalGroq = process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GROQ_API_KEY;

    try {
      expect(() => new OpenAIProvider({ apiKey: '' })).toThrowError(AIProviderError);
      try {
        new OpenAIProvider({ apiKey: '' });
      } catch (err) {
        expect(err.code).toBe('authentication');
        expect(err.message).toMatch(/API key is missing/i);
      }
    } finally {
      if (originalEnv) process.env.OPENAI_API_KEY = originalEnv;
      if (originalGroq) process.env.GROQ_API_KEY = originalGroq;
    }
  });

  it('should never expose OpenAI or Groq API keys in error messages', async () => {
    const openaiKey = 'sk-proj-super-secret-1234567890-abcdefg';
    const groqKey = 'gsk_super_secret_groq_key_1234567890_xyz';

    const mockClient = {
      responses: {
        parse: vi.fn().mockRejectedValue(new Error(`Unauthorized with key ${openaiKey} and ${groqKey}`))
      }
    };

    const provider = new OpenAIProvider({ client: mockClient });

    await expect(provider.reviewChunk({ chunk: sampleChunk, retries: 0 })).rejects.toSatisfy(
      (err) => {
        expect(err).toBeInstanceOf(AIProviderError);
        expect(err.message).not.toContain(openaiKey);
        expect(err.message).not.toContain(groqKey);
        expect(err.message).toContain('[REDACTED_API_KEY]');
        return true;
      }
    );
  });

  it('should support Groq Chat Completions mode and parse JSON findings', async () => {
    const mockFinding = {
      ruleId: 'ai/security-vulnerability',
      severity: 'high',
      category: 'security',
      title: 'SQL Injection Risk',
      message: 'Unescaped user input in query',
      lineStart: 1,
      lineEnd: 3,
      suggestion: 'Use parameterized queries',
      confidence: 0.95
    };

    const mockClient = {
      baseURL: 'https://api.groq.com/openai/v1',
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({ findings: [mockFinding] })
                }
              }
            ],
            usage: {
              prompt_tokens: 120,
              completion_tokens: 60
            }
          })
        }
      }
    };

    const provider = new OpenAIProvider({ client: mockClient });
    const result = await provider.reviewChunk({ chunk: sampleChunk });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].ruleId).toBe('ai/security-vulnerability');
    expect(result.usage.inputTokens).toBe(120);
    expect(result.usage.outputTokens).toBe(60);
    expect(mockClient.chat.completions.create).toHaveBeenCalled();
  });

  it('should instantiate Groq provider with createAIProvider({ provider: "groq" })', () => {
    const mockClient = { baseURL: 'https://api.groq.com/openai/v1' };
    const provider = createAIProvider({ provider: 'groq', client: mockClient });
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  it('should parse structured output and return findings with usage', async () => {
    const mockFinding = {
      ruleId: 'ai/unhandled-rejection',
      severity: 'medium',
      category: 'correctness',
      title: 'Unhandled Rejection',
      message: 'Async function missing catch',
      lineStart: 2,
      lineEnd: 4,
      suggestion: 'Add try-catch',
      confidence: 0.9
    };

    const mockClient = {
      responses: {
        parse: vi.fn().mockResolvedValue({
          output_parsed: {
            findings: [mockFinding]
          },
          usage: {
            input_tokens: 150,
            output_tokens: 45
          }
        })
      }
    };

    const provider = new OpenAIProvider({ client: mockClient });
    const result = await provider.reviewChunk({ chunk: sampleChunk });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].ruleId).toBe('ai/unhandled-rejection');
    expect(result.usage.inputTokens).toBe(150);
    expect(result.usage.outputTokens).toBe(45);
  });

  it('should handle empty parsed output gracefully', async () => {
    const mockClient = {
      responses: {
        parse: vi.fn().mockResolvedValue({
          output_parsed: { findings: [] },
          usage: { input_tokens: 80, output_tokens: 10 }
        })
      }
    };

    const provider = new OpenAIProvider({ client: mockClient });
    const result = await provider.reviewChunk({ chunk: sampleChunk });

    expect(result.findings).toEqual([]);
  });

  it('should detect model refusals and return zero findings', async () => {
    const mockClient = {
      responses: {
        parse: vi.fn().mockResolvedValue({
          refusal: 'I cannot review this code.',
          usage: { input_tokens: 50, output_tokens: 10 }
        })
      }
    };

    const provider = new OpenAIProvider({ client: mockClient });
    const result = await provider.reviewChunk({ chunk: sampleChunk });

    expect(result.findings).toEqual([]);
  });

  it('should retry on rate limit (429) failures up to configured retries', async () => {
    const rateLimitErr = new Error('Rate limit exceeded');
    rateLimitErr.status = 429;
    rateLimitErr.name = 'RateLimitError';

    const successResponse = {
      output_parsed: { findings: [] },
      usage: { input_tokens: 100, output_tokens: 20 }
    };

    const parseMock = vi
      .fn()
      .mockRejectedValueOnce(rateLimitErr)
      .mockResolvedValueOnce(successResponse);

    const mockClient = { responses: { parse: parseMock } };
    const provider = new OpenAIProvider({ client: mockClient });

    const result = await provider.reviewChunk({ chunk: sampleChunk, retries: 2 });
    expect(parseMock).toHaveBeenCalledTimes(2);
    expect(result.findings).toEqual([]);
  });

  it('should retry on 5xx server errors', async () => {
    const serverErr = new Error('Internal server error');
    serverErr.status = 500;

    const successResponse = {
      output_parsed: { findings: [] },
      usage: { input_tokens: 100, output_tokens: 20 }
    };

    const parseMock = vi
      .fn()
      .mockRejectedValueOnce(serverErr)
      .mockResolvedValueOnce(successResponse);

    const mockClient = { responses: { parse: parseMock } };
    const provider = new OpenAIProvider({ client: mockClient });

    const result = await provider.reviewChunk({ chunk: sampleChunk, retries: 1 });
    expect(parseMock).toHaveBeenCalledTimes(2);
    expect(result.findings).toEqual([]);
  });

  it('should not retry on authentication failures (401)', async () => {
    const authErr = new Error('Invalid API key');
    authErr.status = 401;
    authErr.name = 'AuthenticationError';

    const parseMock = vi.fn().mockRejectedValue(authErr);
    const mockClient = { responses: { parse: parseMock } };
    const provider = new OpenAIProvider({ client: mockClient });

    await expect(provider.reviewChunk({ chunk: sampleChunk, retries: 3 })).rejects.toMatchObject({
      code: 'authentication'
    });
    expect(parseMock).toHaveBeenCalledTimes(1); // No retry
  });

  it('should classify timeout errors properly', async () => {
    const timeoutErr = new Error('Request timed out');
    timeoutErr.name = 'APIConnectionTimeoutError';

    const mockClient = { responses: { parse: vi.fn().mockRejectedValue(timeoutErr) } };
    const provider = new OpenAIProvider({ client: mockClient });

    await expect(provider.reviewChunk({ chunk: sampleChunk, retries: 0 })).rejects.toMatchObject({
      code: 'timeout'
    });
  });

  it('should reject unsupported providers in createAIProvider', () => {
    expect(() => createAIProvider({ provider: 'unsupported' })).toThrowError(AIProviderError);
  });
});
