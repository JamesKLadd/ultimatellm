import type { ProviderId } from '@ultimatellm/shared';
import type { Effort, ModelTier } from './types';

/**
 * Minimal model registry (Phase 1a): enough to pick a sensible model per
 * provider and tier. Phase 1b grows this into the full knowledge base from
 * docs/03-orchestration.md (pricing, speed, per-task scores).
 *
 * Model lineups as of 2026-10-14, from each provider's model docs.
 */
export interface ModelInfo {
  id: string;
  provider: ProviderId;
  name: string;
  tier: ModelTier;
  /** Effort levels the model accepts, if the provider exposes an effort control. */
  efforts?: readonly Effort[];
}

export const MODELS: readonly ModelInfo[] = [
  // xAI
  { id: 'grok-4.20-0309-non-reasoning', provider: 'xai', name: 'Grok 4.20', tier: 'fast' },
  { id: 'grok-4.20-non-reasoning', provider: 'xai', name: 'Grok 4.20', tier: 'fast' },
  { id: 'grok-4.3', provider: 'xai', name: 'Grok 4.3', tier: 'balanced' },
  { id: 'grok-4.7', provider: 'xai', name: 'Grok 4.7', tier: 'best' },
  // Anthropic
  {
    id: 'claude-haiku-5-5',
    provider: 'anthropic',
    name: 'Claude Haiku 5.5',
    tier: 'fast',
    efforts: ['low', 'medium', 'high'],
  },
  {
    id: 'claude-sonnet-5-5',
    provider: 'anthropic',
    name: 'Claude Sonnet 5.5',
    tier: 'balanced',
    efforts: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'claude-opus-5-5',
    provider: 'anthropic',
    name: 'Claude Opus 5.5',
    tier: 'best',
    efforts: ['low', 'medium', 'high', 'max'],
  },
  // OpenAI
  {
    id: 'gpt-6-luna',
    provider: 'openai',
    name: 'GPT-6 Luna',
    tier: 'fast',
    efforts: ['none', 'low', 'medium', 'high', 'max'],
  },
  {
    id: 'gpt-6.1-sol',
    provider: 'openai',
    name: 'GPT-6.1 Sol',
    tier: 'balanced',
    efforts: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'gpt-6-astra',
    provider: 'openai',
    name: 'GPT-6 Astra',
    tier: 'best',
    efforts: ['low', 'medium', 'high', 'max'],
  },
  // Google
  { id: 'gemini-3.5-flash-lite', provider: 'google', name: 'Gemini 3.5 Flash-Lite', tier: 'fast' },
  { id: 'gemini-3.1-flash-lite', provider: 'google', name: 'Gemini 3.1 Flash-Lite', tier: 'fast' },
  { id: 'gemini-3.8-flash', provider: 'google', name: 'Gemini 3.8 Flash', tier: 'balanced' },
  { id: 'gemini-3.6-flash', provider: 'google', name: 'Gemini 3.6 Flash', tier: 'balanced' },
  { id: 'gemini-4-argon', provider: 'google', name: 'Gemini 4 Argon', tier: 'best' },
];

const TIER_ORDER: Record<ModelTier, readonly ModelTier[]> = {
  best: ['best', 'balanced', 'fast'],
  balanced: ['balanced', 'fast', 'best'],
  fast: ['fast', 'balanced'],
};

export function findModel(modelId: string): ModelInfo | undefined {
  return MODELS.find((model) => model.id === modelId);
}

/** Display name for a model ID, e.g. "Claude Sonnet 5.5". */
export function modelName(modelId: string): string {
  return findModel(modelId)?.name ?? modelId;
}

/**
 * Models to try, in order, for a provider and tier. Falls back to other tiers
 * (e.g. a free-tier key without access to the best model gets the next best).
 * When the account's model list is known, models it lacks are skipped.
 */
export function modelCandidates(
  provider: ProviderId,
  tier: ModelTier,
  availableModels?: readonly string[],
): string[] {
  const ordered = TIER_ORDER[tier].flatMap((t) =>
    MODELS.filter((model) => model.provider === provider && model.tier === t).map((m) => m.id),
  );
  if (!availableModels || availableModels.length === 0) return ordered;
  const available = new Set(availableModels);
  const filtered = ordered.filter((id) => available.has(id));
  // If the provider renamed everything we know about, still try our list.
  return filtered.length > 0 ? filtered : ordered;
}

/** The closest effort level the model supports, or undefined if it has no effort control. */
export function supportedEffort(modelId: string, effort: Effort): Effort | undefined {
  const efforts = findModel(modelId)?.efforts;
  if (!efforts || efforts.length === 0) return undefined;
  if (efforts.includes(effort)) return effort;
  const scale: readonly Effort[] = ['none', 'low', 'medium', 'high', 'max'];
  const wanted = scale.indexOf(effort);
  // Nearest level, preferring the higher one on ties.
  return [...efforts].sort(
    (a, b) =>
      Math.abs(scale.indexOf(a) - wanted) - Math.abs(scale.indexOf(b) - wanted) ||
      scale.indexOf(b) - scale.indexOf(a),
  )[0];
}
