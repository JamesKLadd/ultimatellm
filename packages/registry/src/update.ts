import { ProviderId } from '@ultimatellm/shared';
import { ModelRegistry } from './registry';
import { ModelEntry, RegistryFile } from './schema';

/**
 * Where installed apps look for newer model information: the registry file on
 * the repository's default branch. Bump `version` in the file to publish.
 */
export const REGISTRY_UPDATE_URL =
  'https://raw.githubusercontent.com/JamesKLadd/ultimatellm/main/packages/registry/data/registry.v1.json';

const MAX_REGISTRY_BYTES = 2_000_000;

export interface ParsedRegistry {
  registry: ModelRegistry;
  /** Entries this app version couldn't read (e.g. a provider it doesn't support yet). */
  skipped: number;
}

/**
 * Validates registry JSON. Unreadable model entries are skipped; the file is
 * rejected if its format is unknown or a supported provider has no models.
 */
export function parseRegistry(json: unknown): ParsedRegistry {
  const file = RegistryFile.safeParse(json);
  if (!file.success) {
    throw new Error(`Invalid model registry: ${file.error.issues[0]?.message ?? 'unknown format'}`);
  }
  const models: ModelEntry[] = [];
  let skipped = 0;
  for (const entry of file.data.models) {
    const model = ModelEntry.safeParse(entry);
    if (model.success) models.push(model.data);
    else skipped++;
  }
  const registry = new ModelRegistry({
    version: file.data.version,
    updatedAt: file.data.updatedAt,
    models,
  });
  const missing = ProviderId.options.filter(
    (provider) => registry.forProvider(provider).length === 0,
  );
  if (missing.length > 0) {
    throw new Error(`Invalid model registry: no models for ${missing.join(', ')}`);
  }
  return { registry, skipped };
}

/**
 * Downloads and validates the published registry. Also returns the file's
 * text, to cache exactly what was validated. Throws if it can't.
 */
export async function fetchRegistry(
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): Promise<ParsedRegistry & { text: string }> {
  const response = await fetchFn(REGISTRY_UPDATE_URL, {
    signal: signal ?? null,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Model registry download failed (HTTP ${response.status})`);
  const text = await response.text();
  if (text.length > MAX_REGISTRY_BYTES) throw new Error('Model registry download is too large');
  return { ...parseRegistry(JSON.parse(text)), text };
}
