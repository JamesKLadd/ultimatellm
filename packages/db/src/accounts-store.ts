import { asc, eq, max } from 'drizzle-orm';
import type { AccountStatus, ProviderId } from '@ultimatellm/shared';
import type { AppDatabase } from './client';
import { accountSecrets, providerAccounts } from './schema';

export type AccountRow = typeof providerAccounts.$inferSelect;

export interface NewAccount {
  provider: ProviderId;
  label: string;
  keyHint: string;
  ciphertext: string;
  models: string[];
}

export interface AccountHealth {
  status: AccountStatus;
  unavailableUntil: Date | null;
  lastError: string | null;
}

export interface AccountStore {
  /** All accounts, grouped by provider in priority order. */
  list(): AccountRow[];
  get(id: string): AccountRow | undefined;
  /** Adds an account at the end of its provider's priority list. */
  insert(account: NewAccount, now: Date): AccountRow;
  remove(id: string): void;
  /** Sets a provider's priority order. `ids` must be exactly that provider's accounts. */
  reorder(provider: ProviderId, ids: readonly string[]): void;
  setHealth(id: string, health: AccountHealth): void;
  setValidated(id: string, models: string[], now: Date): void;
  getCiphertext(id: string): string | undefined;
}

export function createAccountStore(db: AppDatabase): AccountStore {
  const get = (id: string) =>
    db.select().from(providerAccounts).where(eq(providerAccounts.id, id)).get();

  return {
    list: () =>
      db
        .select()
        .from(providerAccounts)
        .orderBy(asc(providerAccounts.provider), asc(providerAccounts.priority))
        .all(),

    get,

    insert(account, now) {
      const id = crypto.randomUUID();
      db.transaction((tx) => {
        const last = tx
          .select({ value: max(providerAccounts.priority) })
          .from(providerAccounts)
          .where(eq(providerAccounts.provider, account.provider))
          .get();
        tx.insert(providerAccounts)
          .values({
            id,
            provider: account.provider,
            label: account.label,
            authType: 'api_key',
            priority: (last?.value ?? -1) + 1,
            keyHint: account.keyHint,
            status: 'active',
            models: account.models,
            validatedAt: now,
            createdAt: now,
          })
          .run();
        tx.insert(accountSecrets).values({ accountId: id, ciphertext: account.ciphertext }).run();
      });
      const row = get(id);
      if (!row) throw new Error('Account was not saved');
      return row;
    },

    remove(id) {
      db.delete(providerAccounts).where(eq(providerAccounts.id, id)).run();
    },

    reorder(provider, ids) {
      const current = db
        .select({ id: providerAccounts.id })
        .from(providerAccounts)
        .where(eq(providerAccounts.provider, provider))
        .all()
        .map((row) => row.id);
      const sameSet =
        current.length === ids.length &&
        new Set(ids).size === ids.length &&
        ids.every((id) => current.includes(id));
      if (!sameSet)
        throw new Error(`The new order must list each ${provider} account exactly once`);

      db.transaction((tx) => {
        ids.forEach((id, priority) => {
          tx.update(providerAccounts).set({ priority }).where(eq(providerAccounts.id, id)).run();
        });
      });
    },

    setHealth(id, health) {
      db.update(providerAccounts).set(health).where(eq(providerAccounts.id, id)).run();
    },

    setValidated(id, models, now) {
      db.update(providerAccounts)
        .set({
          models,
          validatedAt: now,
          status: 'active',
          unavailableUntil: null,
          lastError: null,
        })
        .where(eq(providerAccounts.id, id))
        .run();
    },

    getCiphertext(id) {
      return db
        .select({ ciphertext: accountSecrets.ciphertext })
        .from(accountSecrets)
        .where(eq(accountSecrets.accountId, id))
        .get()?.ciphertext;
    },
  };
}
