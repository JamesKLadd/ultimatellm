import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import {
  BUNDLED_REGISTRY,
  fetchRegistry,
  parseRegistry,
  type ModelRegistry,
} from '@ultimatellm/registry';

export type RegistrySource = 'bundled' | 'downloaded';

/**
 * The model registry in use: the copy bundled with the app, or a newer one
 * downloaded from the repository and cached in `cacheFile`.
 */
export class RegistryHolder {
  private registry: ModelRegistry = BUNDLED_REGISTRY;
  private origin: RegistrySource = 'bundled';

  constructor(private readonly cacheFile: string) {
    try {
      const cached = parseRegistry(JSON.parse(readFileSync(cacheFile, 'utf8'))).registry;
      if (cached.version > BUNDLED_REGISTRY.version) {
        this.registry = cached;
        this.origin = 'downloaded';
      }
    } catch {
      // No cached copy yet, or it's unreadable: the bundled one is fine.
    }
  }

  get current(): ModelRegistry {
    return this.registry;
  }

  get source(): RegistrySource {
    return this.origin;
  }

  /** Downloads the published registry; uses and caches it if it's newer. Returns true if so. */
  async update(fetchFn: typeof fetch, signal?: AbortSignal): Promise<boolean> {
    const { registry, text } = await fetchRegistry(fetchFn, signal);
    if (registry.version <= this.registry.version) return false;
    const temporary = `${this.cacheFile}.tmp`;
    writeFileSync(temporary, text);
    renameSync(temporary, this.cacheFile);
    this.registry = registry;
    this.origin = 'downloaded';
    return true;
  }
}
