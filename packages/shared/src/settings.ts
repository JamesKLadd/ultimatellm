import { z } from 'zod';

export const ThemePreference = z.enum(['system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof ThemePreference>;

/**
 * Every persisted app setting, with its schema and default value.
 * Stored values are validated against the schema when read, so a corrupt or
 * outdated value falls back to the default instead of crashing the app.
 */
export const settingDefinitions = {
  'appearance.theme': { schema: ThemePreference, default: 'system' },
} as const satisfies Record<string, { schema: z.ZodType; default: unknown }>;

export type SettingKey = keyof typeof settingDefinitions;
export type SettingValue<K extends SettingKey> = z.output<(typeof settingDefinitions)[K]['schema']>;
