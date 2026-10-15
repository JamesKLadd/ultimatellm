import type {
  AccountStatus,
  Effort,
  MessageStatus,
  OutputMode,
  PlanKind,
  PlanMode,
  ProviderId,
  StepKind,
  StepStatus,
  TaskCategory,
} from '@ultimatellm/shared';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
    /** Totals for the whole reply (planning, tasks and wrap-up). */
    inputTokens: integer('input_tokens'),
    cachedInputTokens: integer('cached_input_tokens'),
    outputTokens: integer('output_tokens'),
    reasoningTokens: integer('reasoning_tokens'),
    /** US dollars at list prices. */
    costUsd: real('cost_usd'),
    outputMode: text('output_mode').$type<OutputMode>(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [index('messages_chat_created').on(table.chatId, table.createdAt)],
);

/** How the manager handled an assistant message: direct answer or workflow. */
export const plans = sqliteTable('plans', {
  messageId: text('message_id')
    .primaryKey()
    .references(() => messages.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<PlanKind>().notNull(),
  summary: text('summary').notNull(),
  /** The shared contract every task received (Markdown). */
  spec: text('spec').notNull(),
  /** Who planned; null when planning was skipped. */
  managerProvider: text('manager_provider').$type<ProviderId>(),
  managerModel: text('manager_model'),
  /** The @mention that chose the model, if any. */
  pinned: text('pinned'),
  planMode: text('plan_mode').$type<PlanMode>().notNull(),
  estimatedCostUsd: real('estimated_cost_usd'),
  estimatedSeconds: real('estimated_seconds'),
  createdAt: timestamp('created_at').notNull(),
});

/** Planning, each task and the wrap-up of an assistant message. */
export const planSteps = sqliteTable(
  'plan_steps',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    /** "plan", "wrapup", or a task ID. Unique within the message. */
    key: text('key').notNull(),
    kind: text('kind').$type<StepKind>().notNull(),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    instructions: text('instructions').notNull(),
    category: text('category').$type<TaskCategory>(),
    dependsOn: text('depends_on', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    outputs: text('outputs', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    rationale: text('rationale').notNull(),
    provider: text('provider').$type<ProviderId>(),
    model: text('model'),
    effort: text('effort').$type<Effort>(),
    accountId: text('account_id'),
    accountLabel: text('account_label'),
    status: text('status').$type<StepStatus>().notNull(),
    /** The model's text: the answer for direct answers, otherwise its report. */
    report: text('report').notNull(),
    error: text('error'),
    inputTokens: integer('input_tokens'),
    cachedInputTokens: integer('cached_input_tokens'),
    outputTokens: integer('output_tokens'),
    reasoningTokens: integer('reasoning_tokens'),
    costUsd: real('cost_usd'),
    startedAt: timestamp('started_at'),
    finishedAt: timestamp('finished_at'),
  },
  (table) => [uniqueIndex('plan_steps_message_key').on(table.messageId, table.key)],
);

/**
 * Files in a chat's workspace. Every write adds a row, so older versions stay;
 * the current file is the newest row for its path.
 */
export const workspaceFiles = sqliteTable(
  'workspace_files',
  {
    id: text('id').primaryKey(),
    chatId: text('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    /** The reply that wrote this version. */
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    stepKey: text('step_key').notNull(),
    /** Relative path with forward slashes, e.g. "src/game.js". */
    path: text('path').notNull(),
    content: text('content').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [index('workspace_files_chat_path').on(table.chatId, table.path)],
);
