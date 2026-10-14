import type { AccountStatus, MessageStatus, ProviderId } from '@ultimatellm/shared';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

/**
 * App settings as key/value pairs. Values are stored as JSON and validated
 * against `settingDefinitions` (in @ultimatellm/shared) when they're read.
 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

/** The user's provider accounts. Secrets live in `account_secrets`. */
export const providerAccounts = sqliteTable(
  'provider_accounts',
  {
    id: text('id').primaryKey(),
    provider: text('provider').$type<ProviderId>().notNull(),
    label: text('label').notNull(),
    authType: text('auth_type').$type<'api_key'>().notNull(),
    /** Position in the provider's priority list; lower is tried first. */
    priority: integer('priority').notNull(),
    keyHint: text('key_hint').notNull(),
    status: text('status').$type<AccountStatus>().notNull(),
    unavailableUntil: timestamp('unavailable_until'),
    lastError: text('last_error'),
    /** Model IDs the key could use when it was last checked. */
    models: text('models', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    validatedAt: timestamp('validated_at'),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [index('provider_accounts_provider_priority').on(table.provider, table.priority)],
);

/**
 * Encrypted credentials (OS keychain-backed `safeStorage`, base64). Kept apart
 * from account metadata so they can never be synced or exported by accident.
 */
export const accountSecrets = sqliteTable('account_secrets', {
  accountId: text('account_id')
    .primaryKey()
    .references(() => providerAccounts.id, { onDelete: 'cascade' }),
  ciphertext: text('ciphertext').notNull(),
});

export const chats = sqliteTable(
  'chats',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    /** Only local chats exist until cloud sync arrives (milestone 1d). */
    kind: text('kind').$type<'local'>().notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [index('chats_updated_at').on(table.updatedAt)],
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    chatId: text('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    role: text('role').$type<'user' | 'assistant'>().notNull(),
    content: text('content').notNull(),
    status: text('status').$type<MessageStatus>().notNull(),
    error: text('error'),
    provider: text('provider').$type<ProviderId>(),
    model: text('model'),
    /** Which account answered. Not a foreign key: history survives removing the account. */
    accountId: text('account_id'),
    accountLabel: text('account_label'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    reasoningTokens: integer('reasoning_tokens'),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [index('messages_chat_created').on(table.chatId, table.createdAt)],
);
