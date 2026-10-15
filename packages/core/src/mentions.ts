import type { ModelRegistry } from '@ultimatellm/registry';
import { PROVIDER_MENTIONS, ProviderId } from '@ultimatellm/shared';

/** A model the user chose with an @mention. */
export type Pin =
  | { kind: 'provider'; provider: ProviderId; mention: string }
  | { kind: 'model'; modelId: string; mention: string };

const LEADING = /^\s*@([A-Za-z0-9][A-Za-z0-9.-]*)[\s,:]*/;
const ANYWHERE = /(?:^|\s)@([A-Za-z0-9][A-Za-z0-9.-]*)/g;

/**
 * Finds the first @mention of a provider ("@claude") or model ("@opus",
 * "@gpt-6.1-sol"). A mention at the very start is an instruction to the app
 * and is removed from the prompt; mentions elsewhere stay part of the text.
 */
export function parseMentions(
  text: string,
  registry: ModelRegistry,
): { text: string; pin: Pin | null } {
  const leading = LEADING.exec(text);
  if (leading?.[1]) {
    const pin = resolveMention(leading[1], registry);
    const rest = text.slice(leading[0].length);
    if (pin) return { text: rest.trim() ? rest : text, pin };
  }
  for (const match of text.matchAll(ANYWHERE)) {
    const pin = match[1] ? resolveMention(match[1], registry) : null;
    if (pin) return { text, pin };
  }
  return { text, pin: null };
}

function resolveMention(raw: string, registry: ModelRegistry): Pin | null {
  // "@claude." at the end of a sentence still counts.
  const name = raw.toLowerCase().replace(/[.-]+$/, '');
  const mention = `@${name}`;
  for (const provider of ProviderId.options) {
    if (PROVIDER_MENTIONS[provider].includes(name)) return { kind: 'provider', provider, mention };
  }
  const model = registry.models.find(
    (entry) => entry.id === name || entry.aliases.includes(name) || entry.mentions.includes(name),
  );
  return model ? { kind: 'model', modelId: model.id, mention } : null;
}
