import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * App settings as key/value pairs. Values are stored as JSON and validated
 * against `settingDefinitions` (in @ultimatellm/shared) when they're read.
 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
