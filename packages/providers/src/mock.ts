import type { LanguageModelV4Prompt, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import type { ProviderId } from '@ultimatellm/shared';
import { APICallError, simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { ProviderError } from './errors';
import { MODELS, modelName } from './registry';
import type { ProviderAdapter } from './types';

/**
 * A stand-in for a real provider, for development and automated tests. No
 * network calls are made and nothing is billed. Behavior is controlled by the
 * API key and the prompt:
 *
 * - key starting with `invalid`     → rejected when added
 * - key starting with `ratelimited` → accepted, but every request hits a rate limit
 * - key starting with `revoked`     → accepted, but requests fail authentication
 * - prompt containing `[slow]`      → the reply streams slowly (for testing Stop)
 */
export function createMockAdapter(provider: ProviderId): ProviderAdapter {
  return {
    id: provider,

    validate(credential) {
      if (credential.apiKey.startsWith('invalid')) {
        return Promise.reject(new ProviderError('auth_invalid', 'Mock: this API key is invalid.'));
      }
      const models = MODELS.filter((model) => model.provider === provider).map((m) => m.id);
      return Promise.resolve({ models });
    },

    languageModel: (modelId, credential) =>
      new MockLanguageModelV4({
        provider: `${provider}.mock`,
        modelId,
        doStream: ({ prompt }) => {
          const failure = failureFor(credential.apiKey);
          if (failure) return Promise.reject(failure);
          const text = lastUserText(prompt);
          return Promise.resolve({
            stream: simulateReadableStream({
              chunks: replyParts(provider, modelId, text),
              initialDelayInMs: 50,
              chunkDelayInMs: text.includes('[slow]') ? 250 : 10,
            }),
          });
        },
      }),

    effortOptions: () => undefined,
  };
}

function failureFor(apiKey: string): APICallError | undefined {
  const fail = (statusCode: number, message: string) =>
    new APICallError({
      message,
      url: 'mock://provider',
      requestBodyValues: {},
      statusCode,
      responseBody: JSON.stringify({ error: { message } }),
      isRetryable: statusCode === 429,
    });
  if (apiKey.startsWith('ratelimited')) return fail(429, 'Mock: rate limit reached.');
  if (apiKey.startsWith('revoked')) return fail(401, 'Mock: this API key was revoked.');
  return undefined;
}

function lastUserText(prompt: LanguageModelV4Prompt): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const message = prompt[i];
    if (message?.role !== 'user') continue;
    return message.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join(' ')
      .trim();
  }
  return '';
}

function replyParts(
  provider: ProviderId,
  modelId: string,
  userText: string,
): LanguageModelV4StreamPart[] {
  const quoted = userText.length > 200 ? `${userText.slice(0, 197)}...` : userText;
  const reply =
    `**Mock reply** from ${modelName(modelId)} (${provider}).\n\n` +
    `You asked: “${quoted}”\n\n` +
    `- This answer was generated locally for testing.\n- No API calls were made.`;
  const pieces = reply.split(/(?<=\s)/);
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text-1' },
    ...pieces.map((delta): LanguageModelV4StreamPart => ({
      type: 'text-delta',
      id: 'text-1',
      delta,
    })),
    { type: 'text-end', id: 'text-1' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: {
          total: Math.ceil(userText.length / 4),
          noCache: Math.ceil(userText.length / 4),
          cacheRead: 0,
          cacheWrite: 0,
        },
        outputTokens: { total: pieces.length, text: pieces.length, reasoning: 0 },
      },
    },
  ];
}
