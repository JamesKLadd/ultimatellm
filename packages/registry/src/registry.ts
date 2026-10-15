import type { Effort, ModelTier, ProviderId } from '@ultimatellm/shared';
import type { ModelEntry } from './schema';

const TIER_FALLBACKS: Record<ModelTier, readonly ModelTier[]> = {
  best: ['best', 'balanced', 'fast'],
  balanced: ['balanced', 'fast', 'best'],
  fast: ['fast', 'balanced', 'best'],
};

const EFFORT_SCALE: readonly Effort[] = ['none', 'low', 'medium', 'high', 'max'];

export interface ModelRegistryData {
  version: number;
  updatedAt: string;
  models: readonly ModelEntry[];
}

/** Read-only queries over one version of the model registry. */
export class ModelRegistry {
  readonly version: number;
  readonly updatedAt: string;
  /** Active models, in registry order. */
  readonly models: readonly ModelEntry[];
  private readonly byId = new Map<string, ModelEntry>();

  constructor(data: ModelRegistryData) {
    this.version = data.version;
    this.updatedAt = data.updatedAt;
    const unique = data.models.filter((model, index, all) => {
      return all.findIndex((other) => other.id === model.id) === index;
    });
    for (const model of unique) this.byId.set(model.id, model);
    for (const model of unique) {
      for (const alias of model.aliases) if (!this.byId.has(alias)) this.byId.set(alias, model);
    }
    this.models = unique.filter((model) => model.status === 'active');
  }

  /** A model by ID or alias. Deprecated models are found too, e.g. for old messages. */
  get(modelId: string): ModelEntry | undefined {
    return this.byId.get(modelId);
  }

  /** Display name for a model ID, e.g. "Claude Sonnet 5.5"; the ID itself if unknown. */
  name(modelId: string): string {
    return this.get(modelId)?.name ?? modelId;
  }

  /** A provider's active models, in registry order. */
  forProvider(provider: ProviderId): ModelEntry[] {
    return this.models.filter((model) => model.provider === provider);
  }

  /**
   * A provider's models for a tier, then its other tiers as fallbacks (e.g. a
   * free-tier key without access to the best model gets the next best).
   */
  tierCandidates(provider: ProviderId, tier: ModelTier): string[] {
    const models = this.forProvider(provider);
    return TIER_FALLBACKS[tier].flatMap((t) => models.filter((m) => m.tier === t).map((m) => m.id));
  }

  /**
   * The models a provider uses as manager for a role, best first: the model
   * marked for the role, then its other manager model, then tier fallbacks.
   */
  managerModels(provider: ProviderId, role: 'fast' | 'strong'): string[] {
    const models = this.forProvider(provider);
    const other = role === 'fast' ? 'strong' : 'fast';
    const ordered = [
      ...models.filter((m) => m.manager === role).map((m) => m.id),
      ...models.filter((m) => m.manager === other).map((m) => m.id),
      ...this.tierCandidates(provider, role === 'fast' ? 'balanced' : 'best'),
    ];
    return [...new Set(ordered)];
  }

  /** The closest effort level the model supports, or undefined if it has no effort control. */
  supportedEffort(modelId: string, effort: Effort): Effort | undefined {
    const efforts = this.get(modelId)?.efforts;
    if (!efforts || efforts.length === 0) return undefined;
    if (efforts.includes(effort)) return effort;
    const wanted = EFFORT_SCALE.indexOf(effort);
    // Nearest level, preferring the higher one on ties.
    return [...efforts].sort(
      (a, b) =>
        Math.abs(EFFORT_SCALE.indexOf(a) - wanted) - Math.abs(EFFORT_SCALE.indexOf(b) - wanted) ||
        EFFORT_SCALE.indexOf(b) - EFFORT_SCALE.indexOf(a),
    )[0];
  }
}
