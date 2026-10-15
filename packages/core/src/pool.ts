import type { AccountCandidate, AccountService } from '@ultimatellm/accounts';
import type { ModelEntry, ModelRegistry } from '@ultimatellm/registry';
import type { ProviderId } from '@ultimatellm/shared';

/** How long a model is skipped on an account after a model-specific failure. */
const BLOCK_MS = 15 * 60_000;

export interface ModelSlot {
  candidate: AccountCandidate;
  /** The ID to call: the model's own ID, or an alias the account lists instead. */
  apiId: string;
}

/** Which models can run right now, and on which accounts. */
export class ModelPool {
  private readonly blocked = new Map<string, number>();

  constructor(
    private readonly accounts: AccountService,
    private readonly registry: () => ModelRegistry,
    private readonly now: () => number,
  ) {}

  /** The accounts that can run a model now, in the user's priority order. */
  slots(modelId: string, byProvider?: ReadonlyMap<ProviderId, AccountCandidate[]>): ModelSlot[] {
    const registry = this.registry();
    const model = registry.get(modelId);
    if (!model) return [];
    const candidates = byProvider?.get(model.provider) ?? this.accounts.candidates(model.provider);
    const known = registry.forProvider(model.provider).flatMap((m) => [m.id, ...m.aliases]);
    const slots: ModelSlot[] = [];
    for (const candidate of candidates) {
      if (this.isBlocked(candidate.account.id, model.id)) continue;
      const apiId = apiIdFor(model, candidate.models, known);
      if (apiId) slots.push({ candidate, apiId });
    }
    return slots;
  }

  /** Active registry models that at least one usable account can run. */
  usableModels(): ModelEntry[] {
    const registry = this.registry();
    const byProvider = new Map<ProviderId, AccountCandidate[]>();
    for (const model of registry.models) {
      if (!byProvider.has(model.provider)) {
        byProvider.set(model.provider, this.accounts.candidates(model.provider));
      }
    }
    return registry.models.filter((model) => this.slots(model.id, byProvider).length > 0);
  }

  /** Skips a model on an account for a while, e.g. after it was reported unavailable. */
  block(accountId: string, modelId: string): void {
    this.blocked.set(`${accountId}\n${modelId}`, this.now() + BLOCK_MS);
  }

  private isBlocked(accountId: string, modelId: string): boolean {
    const key = `${accountId}\n${modelId}`;
    const until = this.blocked.get(key);
    if (until === undefined) return false;
    if (until > this.now()) return true;
    this.blocked.delete(key);
    return false;
  }
}

function apiIdFor(
  model: ModelEntry,
  available: readonly string[],
  known: readonly string[],
): string | undefined {
  // The provider didn't list models when the key was checked: just try.
  if (available.length === 0) return model.id;
  if (available.includes(model.id)) return model.id;
  const alias = model.aliases.find((id) => available.includes(id));
  if (alias) return alias;
  // The account lists none of the models we know (the provider renamed them?): still try ours.
  return known.some((id) => available.includes(id)) ? undefined : model.id;
}
