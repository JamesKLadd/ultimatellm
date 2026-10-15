import type { ChatEngine } from '@ultimatellm/core';
import type { SettingsStore } from '@ultimatellm/db';
import type { DataScope, ModelsInfo } from '@ultimatellm/shared';
import type { RegistryHolder } from './model-registry';

const FIRST_CHECK_MS = 10_000;
const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;
const TIMEOUT_MS = 15_000;

/** Model information for the UI, and keeping the registry up to date. */
export class ModelsService {
  private lastChecked: number | null = null;
  private lastError: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly holder: RegistryHolder,
    private readonly settings: SettingsStore,
    private readonly engine: ChatEngine,
    private readonly changed: (scope: DataScope) => void,
    private readonly fetchFn: typeof fetch,
  ) {}

  info(): ModelsInfo {
    const registry = this.holder.current;
    return {
      models: this.engine.modelOptions(),
      registry: {
        version: registry.version,
        updatedAt: registry.updatedAt,
        source: this.holder.source,
        autoUpdate: this.settings.get('models.autoUpdate'),
        lastChecked: this.lastChecked,
        lastError: this.lastError,
      },
    };
  }

  async checkForUpdate(): Promise<ModelsInfo> {
    try {
      const updated = await this.holder.update(this.fetchFn, AbortSignal.timeout(TIMEOUT_MS));
      this.lastError = null;
      if (updated) this.changed('models');
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
    this.lastChecked = Date.now();
    return this.info();
  }

  setAutoUpdate(enabled: boolean): void {
    this.settings.set('models.autoUpdate', enabled);
    if (enabled) this.schedule(FIRST_CHECK_MS);
    else this.stop();
    this.changed('models');
  }

  /** Checks shortly after startup, then twice a day, while automatic updates are on. */
  start(): void {
    if (this.settings.get('models.autoUpdate')) this.schedule(FIRST_CHECK_MS);
  }

  stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(delay: number): void {
    this.stop();
    this.timer = setTimeout(() => {
      void this.checkForUpdate().finally(() => {
        if (this.settings.get('models.autoUpdate')) this.schedule(CHECK_EVERY_MS);
      });
    }, delay);
  }
}
