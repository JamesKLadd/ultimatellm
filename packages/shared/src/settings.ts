import { z } from 'zod';
import { DEFAULT_MANAGER_PRIORITY, ManagerPriority } from './orchestration';

export const ThemePreference = z.enum(['system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof ThemePreference>;

/**
 * Every persisted app setting, with its schema and default value.
 * Stored values are validated against the schema when read, so a corrupt or
 * outdated value falls back to the default instead of crashing the app.
 */
export const settingDefinitions = {
  'appearance.theme': { schema: ThemePreference, default: 'system' },
  /** Which provider manages prompts; see `rankManagers()`. */
  'orchestration.managerPriority': { schema: ManagerPriority, default: DEFAULT_MANAGER_PRIORITY },
  /** Download newer model information (prices, new models) from the project's repository. */
  'models.autoUpdate': { schema: z.boolean(), default: true },
} as const satisfies Record<string, { schema: z.ZodType; default: unknown }>;

export type SettingKey = keyof typeof settingDefinitions;
export type SettingValue<K extends SettingKey> = z.output<(typeof settingDefinitions)[K]['schema']>;
