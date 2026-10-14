import type { ProviderId } from '@ultimatellm/shared';

/** Order providers are listed in on the Accounts page. */
export const PROVIDER_LIST: readonly ProviderId[] = ['xai', 'anthropic', 'openai', 'google'];

export interface ProviderUi {
  /** Where to create an API key. */
  keyUrl: string;
  keyPlaceholder: string;
  /** Short, practical advice shown under the provider's name. */
  help: string;
  /** Tailwind class for the provider's color dot. */
  dotClass: string;
}

export const PROVIDER_UI: Record<ProviderId, ProviderUi> = {
  xai: {
    keyUrl: 'https://console.x.ai',
    keyPlaceholder: 'xai-…',
    help: 'Makes Grok bot your manager. A SuperGrok subscription doesn’t include API access; API usage is prepaid on the xAI console.',
    dotClass: 'bg-neutral-900 dark:bg-neutral-100',
  },
  anthropic: {
    keyUrl: 'https://platform.claude.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
    help: 'Claude Max includes $100–200 of API credits each month: on claude.ai, open Settings → Billing → API credits and link a Console organization.',
    dotClass: 'bg-orange-500',
  },
  openai: {
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
    help: 'Signing in with your ChatGPT plan instead of a key is coming in a later update.',
    dotClass: 'bg-emerald-500',
  },
  google: {
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyPlaceholder: 'AIza…',
    help: 'Free to try: a Google AI Studio key works without billing (with lower limits). Google AI Pro and Ultra include monthly Cloud credits.',
    dotClass: 'bg-blue-500',
  },
};

/** Cleans the "Error invoking remote method …" prefix Electron adds to IPC errors. */
export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '');
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
