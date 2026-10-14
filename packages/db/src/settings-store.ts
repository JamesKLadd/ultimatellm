import { eq } from 'drizzle-orm';
import { settingDefinitions, type SettingKey, type SettingValue } from '@ultimatellm/shared';
import type { AppDatabase } from './client';
import { settings } from './schema';

export interface SettingsStore {
  /** Returns the stored value, or the setting's default if it's unset or invalid. */
  get<K extends SettingKey>(key: K): SettingValue<K>;
  /** Validates and stores a value. Throws if the value doesn't match the setting's schema. */
  set<K extends SettingKey>(key: K, value: SettingValue<K>): void;
}

export function createSettingsStore(db: AppDatabase): SettingsStore {
  return {
    get<K extends SettingKey>(key: K): SettingValue<K> {
      const definition = settingDefinitions[key];
      const row = db
        .select({ value: settings.value })
        .from(settings)
        .where(eq(settings.key, key))
        .get();
      // Defaults are shared constants; hand out copies so callers can't change them.
      if (!row) return structuredClone(definition.default) as SettingValue<K>;

      const parsed = definition.schema.safeParse(row.value);
      return (
        parsed.success ? parsed.data : structuredClone(definition.default)
      ) as SettingValue<K>;
    },

    set<K extends SettingKey>(key: K, value: SettingValue<K>): void {
      const valid: unknown = settingDefinitions[key].schema.parse(value);
      const updatedAt = new Date();
      db.insert(settings)
        .values({ key, value: valid, updatedAt })
        .onConflictDoUpdate({ target: settings.key, set: { value: valid, updatedAt } })
        .run();
    },
  };
}
