import { Effort, ModelTier, ProviderId } from '@ultimatellm/shared';
import { z } from 'zod';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date like 2026-10-15');

/** Lowercase letters, digits, dots and dashes, e.g. "opus" or "gpt-6.1-sol". */
export const MENTION_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

/** US dollars per million tokens. */
export const Prices = z.object({
  inputPerM: z.number().nonnegative(),
  outputPerM: z.number().nonnegative(),
  /** Input tokens read from the provider's prompt cache. Defaults to the input price. */
  cachedInputPerM: z.number().nonnegative().optional(),
});
export type Prices = z.infer<typeof Prices>;

export const PricePeriod = Prices.extend({
  /** First UTC day these prices apply. Omitted on the first period. */
  from: IsoDate.optional(),
  /** Higher prices for a request whose prompt is longer than `thresholdTokens`. */
  longContext: Prices.extend({ thresholdTokens: z.number().int().positive() }).optional(),
});
export type PricePeriod = z.infer<typeof PricePeriod>;

export const ModelEntry = z.object({
  /** The provider's API model ID. */
  id: z.string().min(1).max(200),
  provider: ProviderId,
  name: z.string().min(1).max(100),
  tier: ModelTier,
  status: z.enum(['active', 'deprecated']).default('active'),
  /** Other API IDs for the same model, e.g. an undated alias. */
  aliases: z.array(z.string().min(1).max(200)).default([]),
  /** Extra `@mention` names, e.g. "opus". The model ID works as a mention too. */
  mentions: z.array(z.string().regex(MENTION_PATTERN)).default([]),
  /**
   * Set on the models a provider uses when it is the manager: `fast` plans
   * prompts, `strong` plans in Best mode and merges answers.
   */
  manager: z.enum(['fast', 'strong']).optional(),
  contextTokens: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive().optional(),
  /** Effort levels the model accepts. Empty when the app doesn't control its reasoning. */
  efforts: z.array(Effort).default([]),
  /** Price periods, oldest first; a period applies from its `from` day until the next one. */
  pricing: z
    .array(PricePeriod)
    .min(1)
    .refine(
      (periods) =>
        periods[0]?.from === undefined &&
        // periods[i] is the period before periods.slice(1)[i].
        periods
          .slice(1)
          .every(
            (period, i) => period.from !== undefined && period.from > (periods[i]?.from ?? ''),
          ),
      { message: 'Only the first price period may omit `from`; later ones must be in date order' },
    ),
  speed: z.object({
    /** Typical output speed. */
    tokensPerSec: z.number().positive(),
    /** Typical wait for the first token at low effort. */
    latencyMs: z.number().nonnegative(),
  }),
  /**
   * 0–100 per task category (`TaskCategory`). Unknown keys are allowed so a
   * newer registry can score categories that this app version doesn't use yet.
   */
  scores: z.record(z.string(), z.number().min(0).max(100)),
  /** Short, human-written strengths and weaknesses. Shown to the planner and in the UI. */
  notes: z.string().max(400).default(''),
});
export type ModelEntry = z.output<typeof ModelEntry>;

export const REGISTRY_SCHEMA_VERSION = 1;

/**
 * The registry file. Models are validated one by one (see `parseRegistry`) so a
 * newer file with an entry this app version can't read still updates the rest.
 */
export const RegistryFile = z.object({
  schemaVersion: z.literal(REGISTRY_SCHEMA_VERSION),
  /** Increases with every published change: YYYYMMDDNN. */
  version: z.number().int().positive(),
  updatedAt: IsoDate,
  models: z.array(z.unknown()).min(1),
});
