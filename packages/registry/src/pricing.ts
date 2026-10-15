import type { TokenUsage } from '@ultimatellm/shared';
import type { ModelEntry, Prices } from './schema';

/** The prices in effect on a day, for a request with `promptTokens` input tokens. */
export function pricesAt(model: ModelEntry, at: Date, promptTokens = 0): Prices {
  const day = at.toISOString().slice(0, 10);
  // Periods are in date order and the first has no `from` (checked by the schema).
  const period = model.pricing.findLast((p) => p.from === undefined || p.from <= day) ??
    model.pricing[0] ?? { inputPerM: 0, outputPerM: 0 };
  const long = period.longContext;
  return long && promptTokens > long.thresholdTokens ? long : period;
}

/**
 * What a call cost in US dollars at list prices, or null if the provider
 * reported no usage. Free tiers and plan credits aren't known to the app.
 */
export function costUsd(model: ModelEntry, usage: TokenUsage, at: Date): number | null {
  if (usage.inputTokens === null && usage.outputTokens === null) return null;
  const input = usage.inputTokens ?? 0;
  const cached = Math.min(usage.cachedInputTokens ?? 0, input);
  const prices = pricesAt(model, at, input);
  const cachedPrice = prices.cachedInputPerM ?? prices.inputPerM;
  return (
    ((input - cached) * prices.inputPerM +
      cached * cachedPrice +
      (usage.outputTokens ?? 0) * prices.outputPerM) /
    1_000_000
  );
}

/**
 * One number for comparing prices: dollars per million tokens, weighting
 * output (which includes reasoning) twice as much as input.
 */
export function blendedPrice(model: ModelEntry, at: Date): number {
  const prices = pricesAt(model, at);
  return (prices.inputPerM + 2 * prices.outputPerM) / 3;
}
