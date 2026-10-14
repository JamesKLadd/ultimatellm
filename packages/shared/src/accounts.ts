import { z } from 'zod';
import { ProviderId } from './providers';

/**
 * `rate_limited` and `quota_exhausted` accounts are skipped until
 * `unavailableUntil`; `auth_invalid` ones until the user checks them again.
 */
export const AccountStatus = z.enum(['active', 'rate_limited', 'quota_exhausted', 'auth_invalid']);
export type AccountStatus = z.infer<typeof AccountStatus>;

/** A provider account as the UI sees it. The key itself never leaves the main process. */
export interface AccountSummary {
  id: string;
  provider: ProviderId;
  label: string;
  authType: 'api_key';
  /** Position in the provider's priority list (0 = tried first). */
  priority: number;
  /** Last characters of the key, e.g. "…a1b2". */
  keyHint: string;
  status: AccountStatus;
  /** When a rate-limited or exhausted account will be tried again (ms since epoch). */
  unavailableUntil: number | null;
  lastError: string | null;
  /** How many models the key can use, as reported by the provider. */
  modelCount: number;
  createdAt: number;
}

export const AddApiKeyInput = z.object({
  provider: ProviderId,
  label: z.string().trim().max(60).optional(),
  apiKey: z.string().trim().min(8, 'That key looks too short.').max(1000),
});
export type AddApiKeyInput = z.input<typeof AddApiKeyInput>;

export type AddAccountResult = { ok: true; account: AccountSummary } | { ok: false; error: string };

export const AccountIdInput = z.object({ id: z.string().min(1).max(100) });

export const ReorderAccountsInput = z.object({
  provider: ProviderId,
  ids: z.array(z.string().min(1).max(100)).min(1).max(100),
});
export type ReorderAccountsInput = z.infer<typeof ReorderAccountsInput>;

export interface ManagerStatus {
  /** Who manages right now, or null if no provider has a usable account. */
  manager: ProviderId | null;
  /** The full manager order (saved order plus any providers it doesn't mention). */
  order: ProviderId[];
  /** Providers with at least one usable account. */
  usable: ProviderId[];
  /** Providers with any account, usable or not (e.g. paused by a rate limit). */
  configured: ProviderId[];
}
