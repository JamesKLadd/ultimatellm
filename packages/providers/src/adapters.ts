import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import type { ProviderId } from '@ultimatellm/shared';
import type { SharedV4ProviderOptions as ProviderOptions } from '@ai-sdk/provider';
import type { LanguageModel } from 'ai';
import { classifyError, classifyHttpError } from './errors';
import type { Effort } from '@ultimatellm/shared';
import type { Credential, ProviderAdapter, ValidationResult } from './types';

type FetchFn = typeof fetch;

interface ModelListing {
  url: string;
  headers: Record<string, string>;
  /** Extracts model IDs from the response JSON. */
  parse: (json: unknown) => string[];
}

const dataIds = (json: unknown): string[] => {
  const data = (json as { data?: { id?: unknown }[] }).data ?? [];
  return data.map((model) => model.id).filter((id): id is string => typeof id === 'string');
};

/** Free "list models" endpoints, used to check a key without spending tokens. */
const MODEL_LISTINGS: Record<ProviderId, (apiKey: string) => ModelListing> = {
  xai: (apiKey) => ({
    url: 'https://api.x.ai/v1/models',
    headers: { Authorization: `Bearer ${apiKey}` },
    parse: dataIds,
  }),
  anthropic: (apiKey) => ({
    url: 'https://api.anthropic.com/v1/models?limit=1000',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    parse: dataIds,
  }),
  openai: (apiKey) => ({
    url: 'https://api.openai.com/v1/models',
    headers: { Authorization: `Bearer ${apiKey}` },
    parse: dataIds,
  }),
  google: (apiKey) => ({
    // The key goes in a header, never the URL, so it can't leak into logs or errors.
    url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
    headers: { 'x-goog-api-key': apiKey },
    parse: (json) => {
      const models =
        (json as { models?: { name?: unknown; supportedGenerationMethods?: unknown }[] }).models ??
        [];
      return models
        .filter(
          (model) =>
            Array.isArray(model.supportedGenerationMethods) &&
            model.supportedGenerationMethods.includes('generateContent'),
        )
        .map((model) => model.name)
        .filter((name): name is string => typeof name === 'string')
        .map((name) => name.replace(/^models\//, ''));
    },
  }),
};

function languageModelFor(provider: ProviderId, modelId: string, apiKey: string): LanguageModel {
  switch (provider) {
    case 'xai':
      return createXai({ apiKey })(modelId);
    case 'anthropic':
      return createAnthropic({ apiKey })(modelId);
    case 'openai':
      return createOpenAI({ apiKey })(modelId);
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(modelId);
  }
}

function effortOptionsFor(provider: ProviderId, effort: Effort): ProviderOptions | undefined {
  switch (provider) {
    case 'openai':
      return { openai: { reasoningEffort: effort } };
    case 'anthropic':
      // Claude has no "off" effort level; its lowest is `low`.
      return { anthropic: { effort: effort === 'none' ? 'low' : effort } };
    default:
      // Gemini and Grok use their models' default reasoning for now.
      return undefined;
  }
}

export function createProviderAdapter(
  provider: ProviderId,
  fetchFn: FetchFn = fetch,
): ProviderAdapter {
  return {
    id: provider,

    async validate(credential: Credential, signal?: AbortSignal): Promise<ValidationResult> {
      const listing = MODEL_LISTINGS[provider](credential.apiKey);
      let response: Response;
      try {
        response = await fetchFn(listing.url, { headers: listing.headers, signal: signal ?? null });
      } catch (error) {
        throw classifyError(error);
      }
      const body = await response.text();
      if (!response.ok) {
        throw classifyHttpError(
          response.status,
          body,
          Object.fromEntries(response.headers.entries()),
        );
      }
      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        json = {};
      }
      return { models: listing.parse(json) };
    },

    languageModel: (modelId, credential) => languageModelFor(provider, modelId, credential.apiKey),

    effortOptions: (_modelId, effort) => effortOptionsFor(provider, effort),
  };
}
