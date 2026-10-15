import type { ProviderId } from '@ultimatellm/shared';
import { createProviderAdapter } from './adapters';
import { createMockAdapter } from './mock';
import type { ProviderAdapter } from './types';

export interface ProviderAdaptersOptions {
  /** Use offline mock providers instead of the real APIs (development and tests). */
  mock?: boolean;
  /** Custom fetch for the real adapters (tests). */
  fetch?: typeof fetch;
}

export type ProviderAdapters = Record<ProviderId, ProviderAdapter>;

export function createProviderAdapters(options: ProviderAdaptersOptions = {}): ProviderAdapters {
  const make = (id: ProviderId) =>
    options.mock ? createMockAdapter(id) : createProviderAdapter(id, options.fetch);
  return {
    xai: make('xai'),
    anthropic: make('anthropic'),
    openai: make('openai'),
    google: make('google'),
  };
}

export { classifyError, classifyHttpError, ProviderError, type ErrorKind } from './errors';
export {
  streamChat,
  toTokenUsage,
  type ChatStreamEvent,
  type ChatTurn,
  type StreamChatOptions,
} from './stream';
export { generateStructured, type GenerateStructuredOptions } from './structured';
export type { ApiKeyCredential, Credential, ProviderAdapter, ValidationResult } from './types';
