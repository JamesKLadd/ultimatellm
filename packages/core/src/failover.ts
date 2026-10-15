import type { AccountService } from '@ultimatellm/accounts';
import { classifyError, ProviderError, type Credential } from '@ultimatellm/providers';
import type { ModelEntry, ModelRegistry } from '@ultimatellm/registry';
import type { AccountSummary, DataScope } from '@ultimatellm/shared';
import type { ModelPool } from './pool';

export const NO_ACCOUNTS_ERROR =
  'No AI account is available. Add one in Settings → Accounts, or wait for a rate-limited account to reset.';

/** One try of a call: a model on an account. */
export interface Attempt {
  model: ModelEntry;
  /** The model ID sent to the provider (the model's ID or an alias). */
  apiId: string;
  account: AccountSummary;
  credential: Credential;
}

/** Thrown by a call to end it without trying other models or accounts. */
export class StopFailover extends Error {
  constructor(readonly failure: ProviderError) {
    super(failure.message);
  }
}

export interface FailoverDeps {
  accounts: AccountService;
  pool: ModelPool;
  registry: () => ModelRegistry;
  changed?: ((scope: DataScope) => void) | undefined;
}

export interface FailoverHooks {
  signal: AbortSignal;
  /** Before each try. */
  onAttempt?: (attempt: Attempt) => void;
  /** After a try failed and another one may follow. */
  onRetry?: (attempt: Attempt, failure: ProviderError) => void;
}

/**
 * Runs `call` on the first model and account that works: each model in
 * order, on each of its usable accounts in the user's priority order. Account
 * health is recorded along the way. If every try fails, throws the last
 * failure (or a "no account" error if there was nothing to try).
 */
export async function withFailover<T>(
  deps: FailoverDeps,
  modelIds: readonly string[],
  call: (attempt: Attempt) => Promise<T>,
  hooks: FailoverHooks,
): Promise<{ value: T; attempt: Attempt }> {
  let last: ProviderError | undefined;
  // Out-of-quota errors are often per model (free tiers), so an account is only
  // paused when it runs out on more than one model.
  const quota = new Map<string, { failure: ProviderError; models: Set<string> }>();
  let succeededOn: string | undefined;

  try {
    for (const modelId of new Set(modelIds)) {
      const model = deps.registry().get(modelId);
      if (!model) continue;
      for (const { candidate, apiId } of deps.pool.slots(model.id)) {
        if (hooks.signal.aborted) throw new ProviderError('aborted', 'Cancelled');
        const attempt: Attempt = {
          model,
          apiId,
          account: candidate.account,
          credential: candidate.credential,
        };
        hooks.onAttempt?.(attempt);
        try {
          const value = await call(attempt);
          succeededOn = attempt.account.id;
          if (deps.accounts.recordSuccess(attempt.account.id)) deps.changed?.('accounts');
          return { value, attempt };
        } catch (error) {
          if (error instanceof StopFailover) throw error.failure;
          const failure = classifyError(error);
          if (hooks.signal.aborted || failure.kind === 'aborted') {
            throw new ProviderError('aborted', 'Cancelled', { cause: error });
          }
          last = failure;
          hooks.onRetry?.(attempt, failure);
          if (afterFailure(deps, attempt, failure, quota) === 'next-model') break;
        }
      }
    }
  } finally {
    for (const [accountId, { failure, models }] of quota) {
      if (accountId !== succeededOn && models.size > 1) {
        deps.accounts.recordFailure(accountId, failure);
        deps.changed?.('accounts');
      }
    }
  }
  throw last ?? new ProviderError('unknown', NO_ACCOUNTS_ERROR);
}

function afterFailure(
  deps: FailoverDeps,
  attempt: Attempt,
  failure: ProviderError,
  quota: Map<string, { failure: ProviderError; models: Set<string> }>,
): 'next-account' | 'next-model' {
  switch (failure.kind) {
    case 'auth_invalid':
    case 'rate_limited':
      // The whole account is affected.
      deps.accounts.recordFailure(attempt.account.id, failure);
      deps.changed?.('accounts');
      return 'next-account';
    case 'quota_exhausted': {
      deps.pool.block(attempt.account.id, attempt.model.id);
      const entry = quota.get(attempt.account.id) ?? { failure, models: new Set<string>() };
      entry.models.add(attempt.model.id);
      quota.set(attempt.account.id, entry);
      return 'next-account';
    }
    case 'model_unavailable':
      deps.pool.block(attempt.account.id, attempt.model.id);
      return 'next-account';
    case 'server_error':
    case 'network':
      return 'next-account';
    default:
      // bad_request, invalid_output, unknown: the same request would fail again here.
      return 'next-model';
  }
}
