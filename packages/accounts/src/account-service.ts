import type { AccountRow, AccountStore } from '@ultimatellm/db';
import {
  classifyError,
  type Credential,
  type ProviderAdapters,
  type ProviderError,
} from '@ultimatellm/providers';
import {
  AddApiKeyInput,
  PROVIDER_NAMES,
  type AccountSummary,
  type AddAccountResult,
  type ProviderId,
} from '@ultimatellm/shared';

/** Encrypts credentials at rest. In the app this is Electron's `safeStorage` (OS keychain). */
export interface SecretBox {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

export interface AccountCandidate {
  account: AccountSummary;
  credential: Credential;
  /** Models the key could use when last checked (empty if unknown). */
  models: string[];
}

/** How long to skip an account after it hits a limit. */
const RATE_LIMIT_PAUSE_MS = 60_000;
const QUOTA_PAUSE_MS = 15 * 60_000;

export interface AccountServiceOptions {
  store: AccountStore;
  adapters: ProviderAdapters;
  secrets: SecretBox;
  now?: () => number;
}

export class AccountService {
  private readonly store: AccountStore;
  private readonly adapters: ProviderAdapters;
  private readonly secrets: SecretBox;
  private readonly now: () => number;

  constructor(options: AccountServiceOptions) {
    this.store = options.store;
    this.adapters = options.adapters;
    this.secrets = options.secrets;
    this.now = options.now ?? Date.now;
  }

  list(): AccountSummary[] {
    return this.store.list().map(toSummary);
  }

  /** Checks an API key with the provider, then saves it (encrypted) at the end of the priority list. */
  async addApiKey(rawInput: AddApiKeyInput): Promise<AddAccountResult> {
    const parsed = AddApiKeyInput.safeParse(rawInput);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'That key looks invalid.' };
    }
    const input = parsed.data;
    const providerName = PROVIDER_NAMES[input.provider];
    const existing = this.store.list().filter((row) => row.provider === input.provider);

    if (existing.some((row) => this.decrypt(row.id) === input.apiKey)) {
      return { ok: false, error: `This ${providerName} key has already been added.` };
    }

    let models: string[];
    try {
      ({ models } = await this.adapters[input.provider].validate({
        type: 'api_key',
        apiKey: input.apiKey,
      }));
    } catch (error) {
      return { ok: false, error: describeKeyError(providerName, classifyError(error)) };
    }

    let ciphertext: string;
    try {
      ciphertext = this.secrets.encrypt(input.apiKey);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    const row = this.store.insert(
      {
        provider: input.provider,
        label: input.label || `API key ${existing.length + 1}`,
        keyHint: `…${input.apiKey.slice(-4)}`,
        ciphertext,
        models,
      },
      new Date(this.now()),
    );
    return { ok: true, account: toSummary(row) };
  }

  remove(id: string): void {
    this.store.remove(id);
  }

  reorder(provider: ProviderId, ids: readonly string[]): void {
    this.store.reorder(provider, ids);
  }

  /** Checks a saved key again, e.g. after the user fixed billing. Clears its error if it works. */
  async recheck(id: string): Promise<AccountSummary> {
    const row = this.requireRow(id);
    const apiKey = this.decrypt(id);
    if (apiKey === undefined) {
      this.store.setHealth(id, {
        status: 'auth_invalid',
        unavailableUntil: null,
        lastError: "The saved key couldn't be read on this device. Remove it and add it again.",
      });
    } else {
      try {
        const { models } = await this.adapters[row.provider].validate({ type: 'api_key', apiKey });
        this.store.setValidated(id, models, new Date(this.now()));
      } catch (error) {
        const failure = classifyError(error);
        if (failure.kind === 'auth_invalid') {
          this.recordFailure(id, failure);
        } else {
          // Couldn't tell (e.g. offline): keep the current status, just show why.
          this.store.setHealth(id, {
            status: row.status,
            unavailableUntil: row.unavailableUntil,
            lastError: describeKeyError(PROVIDER_NAMES[row.provider], failure),
          });
        }
      }
    }
    return toSummary(this.requireRow(id));
  }

  /** Providers with at least one account that can take a request right now. */
  usableProviders(): ProviderId[] {
    const now = this.now();
    return [
      ...new Set(
        this.store
          .list()
          .filter((row) => isUsable(row, now))
          .map((r) => r.provider),
      ),
    ];
  }

  /** A provider's usable accounts with their credentials, in priority order. */
  candidates(provider: ProviderId): AccountCandidate[] {
    const now = this.now();
    const result: AccountCandidate[] = [];
    for (const row of this.store.list()) {
      if (row.provider !== provider || !isUsable(row, now)) continue;
      const apiKey = this.decrypt(row.id);
      if (apiKey === undefined) {
        this.store.setHealth(row.id, {
          status: 'auth_invalid',
          unavailableUntil: null,
          lastError: "The saved key couldn't be read on this device. Remove it and add it again.",
        });
        continue;
      }
      result.push({
        account: toSummary(row),
        credential: { type: 'api_key', apiKey },
        models: row.models,
      });
    }
    return result;
  }

  /** Records why a request on this account failed, so it's skipped for a while if needed. */
  recordFailure(id: string, failure: ProviderError): void {
    const now = this.now();
    const row = this.store.get(id);
    if (!row) return;
    const lastError = failure.message;
    switch (failure.kind) {
      case 'auth_invalid':
        this.store.setHealth(id, { status: 'auth_invalid', unavailableUntil: null, lastError });
        break;
      case 'rate_limited':
        this.store.setHealth(id, {
          status: 'rate_limited',
          unavailableUntil: new Date(now + (failure.details.retryAfterMs ?? RATE_LIMIT_PAUSE_MS)),
          lastError,
        });
        break;
      case 'quota_exhausted':
        this.store.setHealth(id, {
          status: 'quota_exhausted',
          unavailableUntil: new Date(now + QUOTA_PAUSE_MS),
          lastError,
        });
        break;
      default:
        this.store.setHealth(id, {
          status: row.status,
          unavailableUntil: row.unavailableUntil,
          lastError,
        });
    }
  }

  /** Marks an account healthy after a successful request. Returns true if anything changed. */
  recordSuccess(id: string): boolean {
    const row = this.store.get(id);
    if (!row || (row.status === 'active' && row.lastError === null)) return false;
    this.store.setHealth(id, { status: 'active', unavailableUntil: null, lastError: null });
    return true;
  }

  private requireRow(id: string): AccountRow {
    const row = this.store.get(id);
    if (!row) throw new Error('Account not found');
    return row;
  }

  private decrypt(id: string): string | undefined {
    const ciphertext = this.store.getCiphertext(id);
    if (ciphertext === undefined) return undefined;
    try {
      return this.secrets.decrypt(ciphertext);
    } catch {
      return undefined;
    }
  }
}

function isUsable(row: AccountRow, now: number): boolean {
  if (row.status === 'active') return true;
  if (row.status === 'auth_invalid') return false;
  return row.unavailableUntil === null || row.unavailableUntil.getTime() <= now;
}

function toSummary(row: AccountRow): AccountSummary {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    authType: row.authType,
    priority: row.priority,
    keyHint: row.keyHint,
    status: row.status,
    unavailableUntil: row.unavailableUntil?.getTime() ?? null,
    lastError: row.lastError,
    modelCount: row.models.length,
    createdAt: row.createdAt.getTime(),
  };
}

function describeKeyError(providerName: string, failure: ProviderError): string {
  switch (failure.kind) {
    case 'auth_invalid':
      return `${providerName} didn't accept this key: ${failure.message}`;
    case 'network':
      return `Couldn't reach ${providerName}. Check your internet connection and try again.`;
    case 'rate_limited':
      return `${providerName} is rate-limiting this key right now. Try again in a minute.`;
    case 'quota_exhausted':
      return `${providerName} says this account is out of credit: ${failure.message}`;
    default:
      return `${providerName} returned an error: ${failure.message}`;
  }
}
