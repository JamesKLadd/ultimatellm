import { streamText } from 'ai';
import { describe, expect, it } from 'vitest';
import { createProviderAdapters } from './index';

function fakeFetch(
  status: number,
  body: unknown,
  seen: { url?: string; headers?: RequestInit['headers'] } = {},
) {
  return ((url: string, init?: RequestInit) => {
    seen.url = url;
    seen.headers = init?.headers;
    return Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
    );
  }) as typeof fetch;
}

const key = { type: 'api_key', apiKey: 'test-key-1234' } as const;

describe('validate', () => {
  it('lists OpenAI-style models', async () => {
    const seen: { url?: string; headers?: RequestInit['headers'] } = {};
    const adapters = createProviderAdapters({
      fetch: fakeFetch(200, { data: [{ id: 'gpt-6-luna' }, { id: 'gpt-6.1-sol' }] }, seen),
    });
    await expect(adapters.openai.validate(key)).resolves.toEqual({
      models: ['gpt-6-luna', 'gpt-6.1-sol'],
    });
    expect(seen.url).toBe('https://api.openai.com/v1/models');
    expect(seen.headers).toEqual({ Authorization: 'Bearer test-key-1234' });
  });

  it('sends the Anthropic key and version headers', async () => {
    const seen: { url?: string; headers?: RequestInit['headers'] } = {};
    const adapters = createProviderAdapters({
      fetch: fakeFetch(200, { data: [{ id: 'claude-haiku-5-5' }] }, seen),
    });
    await expect(adapters.anthropic.validate(key)).resolves.toEqual({
      models: ['claude-haiku-5-5'],
    });
    expect(seen.headers).toEqual({
      'x-api-key': 'test-key-1234',
      'anthropic-version': '2023-06-01',
    });
  });

  it('keeps the Gemini key out of the URL and keeps only chat models', async () => {
    const seen: { url?: string; headers?: RequestInit['headers'] } = {};
    const adapters = createProviderAdapters({
      fetch: fakeFetch(
        200,
        {
          models: [
            { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-embedding-2', supportedGenerationMethods: ['embedContent'] },
          ],
        },
        seen,
      ),
    });
    await expect(adapters.google.validate(key)).resolves.toEqual({ models: ['gemini-3.8-flash'] });
    expect(seen.url).not.toContain('test-key-1234');
    expect(seen.headers).toEqual({ 'x-goog-api-key': 'test-key-1234' });
  });

  it('throws a classified error when the provider rejects the key', async () => {
    const adapters = createProviderAdapters({
      fetch: fakeFetch(401, { error: { message: 'Incorrect API key provided' } }),
    });
    await expect(adapters.xai.validate(key)).rejects.toMatchObject({
      kind: 'auth_invalid',
      message: 'Incorrect API key provided',
    });
  });

  it('reports network failures', async () => {
    const adapters = createProviderAdapters({
      fetch: () => Promise.reject(new TypeError('fetch failed')),
    });
    await expect(adapters.google.validate(key)).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('effort options', () => {
  const adapters = createProviderAdapters();

  it('maps effort to each provider, nearest supported level', () => {
    expect(adapters.openai.effortOptions('gpt-6-luna', 'none')).toEqual({
      openai: { reasoningEffort: 'none' },
    });
    // Sol has no "none" level; the closest is "low".
    expect(adapters.openai.effortOptions('gpt-6.1-sol', 'none')).toEqual({
      openai: { reasoningEffort: 'low' },
    });
    expect(adapters.anthropic.effortOptions('claude-opus-5-5', 'high')).toEqual({
      anthropic: { effort: 'high' },
    });
  });

  it('sends nothing for unknown models or providers without an effort control', () => {
    expect(adapters.openai.effortOptions('some-future-model', 'high')).toBeUndefined();
    expect(adapters.google.effortOptions('gemini-3.8-flash', 'high')).toBeUndefined();
    expect(adapters.xai.effortOptions('grok-4.7', 'high')).toBeUndefined();
  });
});

describe('mock provider', () => {
  const adapters = createProviderAdapters({ mock: true });

  it('streams a reply that echoes the prompt', async () => {
    const result = streamText({
      model: adapters.anthropic.languageModel('claude-sonnet-5-5', key),
      prompt: 'Hello there',
    });
    const text = await result.text;
    expect(text).toContain('Mock reply');
    expect(text).toContain('Claude Sonnet 5.5');
    expect(text).toContain('Hello there');
  });

  it('rejects keys that start with "invalid"', async () => {
    await expect(
      adapters.google.validate({ type: 'api_key', apiKey: 'invalid-key' }),
    ).rejects.toMatchObject({ kind: 'auth_invalid' });
    await expect(adapters.google.validate(key)).resolves.toMatchObject({
      models: expect.arrayContaining(['gemini-3.8-flash']) as unknown,
    });
  });
});
