import { z } from 'zod';

/** The AI providers UltimateLLM supports. */
export const ProviderId = z.enum(['xai', 'anthropic', 'openai', 'google']);
export type ProviderId = z.infer<typeof ProviderId>;

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  xai: 'xAI',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
};

/** What the manager is called in the UI when that provider fills the role. */
export const MANAGER_NAMES: Record<ProviderId, string> = {
  xai: 'Grok',
  anthropic: 'Claude',
  openai: 'ChatGPT',
  google: 'Gemini',
};
