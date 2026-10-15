import { HARD_TASK_CATEGORIES, type OutputMode, type TaskCategory } from '@ultimatellm/shared';
import { blendedPrice } from './pricing';
import type { ModelEntry } from './schema';

/**
 * The minimum category score a model needs before a mode optimizes for price
 * or speed. Hard categories (coding, math, …) need more. Best mode has no bar:
 * it takes the highest score.
 */
export const QUALITY_BARS: Record<Exclude<OutputMode, 'best'>, { normal: number; hard: number }> = {
  cheapest: { normal: 60, hard: 66 },
  fastest: { normal: 60, hard: 66 },
  balanced: { normal: 78, hard: 84 },
};

/** A model's 0–100 score for a category (its chat score if the category isn't rated). */
export function categoryScore(model: ModelEntry, category: TaskCategory): number {
  return model.scores[category] ?? model.scores.chat ?? 50;
}

/** Rough seconds to finish a typical answer: first-token wait plus streaming time. */
export function typicalSeconds(model: ModelEntry, outputTokens = 600): number {
  return model.speed.latencyMs / 1000 + outputTokens / model.speed.tokensPerSec;
}

export function qualityBar(mode: OutputMode, category: TaskCategory): number {
  if (mode === 'best') return 0;
  const bars = QUALITY_BARS[mode];
  return HARD_TASK_CATEGORIES.has(category) ? bars.hard : bars.normal;
}

/**
 * Orders models for a task, best fit first (docs/03-orchestration.md):
 * - Cheapest: the cheapest model that clears the quality bar
 * - Fastest: the fastest model that clears the quality bar
 * - Balanced: mid-tier models that clear a higher bar, best score first;
 *   escalates to the cheapest stronger model only when none does
 * - Best: the highest score (cheaper first on ties)
 *
 * Models below the bar follow, highest score first, as fallbacks.
 */
export function rankModels(
  models: readonly ModelEntry[],
  category: TaskCategory,
  mode: OutputMode,
  at: Date,
): ModelEntry[] {
  const score = (model: ModelEntry) => categoryScore(model, category);
  const price = (model: ModelEntry) => blendedPrice(model, at);
  const byScore = (a: ModelEntry, b: ModelEntry) => score(b) - score(a) || price(a) - price(b);
  const byPrice = (a: ModelEntry, b: ModelEntry) => price(a) - price(b) || score(b) - score(a);
  const bySpeed = (a: ModelEntry, b: ModelEntry) =>
    typicalSeconds(a) - typicalSeconds(b) || score(b) - score(a);

  if (mode === 'best') return [...models].sort(byScore);

  const bar = qualityBar(mode, category);
  const qualified = models.filter((model) => score(model) >= bar);
  const fallbacks = models.filter((model) => score(model) < bar).sort(byScore);

  switch (mode) {
    case 'cheapest':
      return [...qualified.sort(byPrice), ...fallbacks];
    case 'fastest':
      return [...qualified.sort(bySpeed), ...fallbacks];
    case 'balanced': {
      const midTier = qualified.filter((model) => model.tier === 'balanced').sort(byScore);
      const others = qualified.filter((model) => model.tier !== 'balanced').sort(byPrice);
      return [...midTier, ...others, ...fallbacks];
    }
  }
}
