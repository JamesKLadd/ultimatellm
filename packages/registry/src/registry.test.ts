import { PROVIDER_MENTIONS, ProviderId, TaskCategory } from '@ultimatellm/shared';
import { describe, expect, it } from 'vitest';
import bundledJson from '../data/registry.v1.json';
import { BUNDLED_REGISTRY } from './bundled';
import { blendedPrice, costUsd, pricesAt } from './pricing';
import { rankModels } from './ranking';
import { ModelRegistry } from './registry';
import { ModelEntry } from './schema';
import { fetchRegistry, parseRegistry } from './update';

const model = (overrides: Partial<ModelEntry> & Pick<ModelEntry, 'id'>): ModelEntry =>
  ModelEntry.parse({
    provider: 'anthropic',
    name: overrides.id,
    tier: 'balanced',
    contextTokens: 100_000,
    pricing: [{ inputPerM: 1, outputPerM: 5 }],
    speed: { tokensPerSec: 100, latencyMs: 1000 },
    scores: { chat: 80 },
    ...overrides,
  });

describe('bundled registry', () => {
  it('parses every entry', () => {
    expect(parseRegistry(bundledJson).skipped).toBe(0);
  });

  it('covers every provider with all three tiers and a fast manager model', () => {
    for (const provider of ProviderId.options) {
      const models = BUNDLED_REGISTRY.forProvider(provider);
      expect(new Set(models.map((m) => m.tier))).toEqual(new Set(['fast', 'balanced', 'best']));
      expect(models.filter((m) => m.manager === 'fast')).toHaveLength(1);
      expect(models.filter((m) => m.manager === 'strong').length).toBeLessThanOrEqual(1);
    }
  });

  it('scores every model for every task category', () => {
    for (const entry of BUNDLED_REGISTRY.models) {
      for (const category of TaskCategory.options) {
        expect(entry.scores[category], `${entry.id} ${category}`).toBeTypeOf('number');
      }
    }
  });

  it('has unique IDs, aliases and mentions', () => {
    const ids = BUNDLED_REGISTRY.models.flatMap((m) => [m.id, ...m.aliases]);
    expect(new Set(ids).size).toBe(ids.length);
    const mentions = [
      ...BUNDLED_REGISTRY.models.flatMap((m) => m.mentions),
      ...Object.values(PROVIDER_MENTIONS).flat(),
    ];
    expect(new Set(mentions).size).toBe(mentions.length);
  });
});

describe('ModelRegistry', () => {
  const registry = new ModelRegistry({
    version: 1,
    updatedAt: '2026-10-15',
    models: [
      model({ id: 'small', tier: 'fast', manager: 'fast', aliases: ['small-latest'] }),
      model({ id: 'mid', tier: 'balanced', manager: 'strong', efforts: ['low', 'medium', 'high'] }),
      model({ id: 'big', tier: 'best', efforts: ['low', 'max'] }),
      model({ id: 'old', tier: 'best', status: 'deprecated' }),
    ],
  });

  it('finds models by ID or alias, deprecated ones included', () => {
    expect(registry.get('small-latest')?.id).toBe('small');
    expect(registry.name('old')).toBe('old');
    expect(registry.name('unknown-model')).toBe('unknown-model');
    expect(registry.forProvider('anthropic').map((m) => m.id)).toEqual(['small', 'mid', 'big']);
  });

  it('falls back to neighbouring tiers', () => {
    expect(registry.tierCandidates('anthropic', 'best')).toEqual(['big', 'mid', 'small']);
    expect(registry.tierCandidates('anthropic', 'fast')).toEqual(['small', 'mid', 'big']);
    expect(registry.tierCandidates('openai', 'fast')).toEqual([]);
  });

  it('lists manager models for a role first', () => {
    expect(registry.managerModels('anthropic', 'fast')).toEqual(['small', 'mid', 'big']);
    expect(registry.managerModels('anthropic', 'strong')).toEqual(['mid', 'small', 'big']);
  });

  it('maps effort to the nearest supported level', () => {
    expect(registry.supportedEffort('mid', 'medium')).toBe('medium');
    expect(registry.supportedEffort('mid', 'max')).toBe('high');
    expect(registry.supportedEffort('mid', 'none')).toBe('low');
    // "low" is one step from "medium"; "max" is two.
    expect(registry.supportedEffort('big', 'medium')).toBe('low');
    expect(registry.supportedEffort('big', 'high')).toBe('max');
    expect(registry.supportedEffort('small', 'high')).toBeUndefined();
  });
});

describe('pricing', () => {
  const priced = model({
    id: 'priced',
    pricing: [
      {
        inputPerM: 2,
        outputPerM: 10,
        cachedInputPerM: 0.2,
        longContext: { thresholdTokens: 200_000, inputPerM: 4, outputPerM: 20 },
      },
      { from: '2026-12-01', inputPerM: 4, outputPerM: 20 },
    ],
  });

  it('picks the price period and long-context prices', () => {
    expect(pricesAt(priced, new Date('2026-11-30T23:00:00Z')).inputPerM).toBe(2);
    expect(pricesAt(priced, new Date('2026-12-01T00:00:00Z')).inputPerM).toBe(4);
    expect(pricesAt(priced, new Date('2026-11-01'), 200_001).inputPerM).toBe(4);
    expect(pricesAt(priced, new Date('2026-11-01'), 200_000).inputPerM).toBe(2);
  });

  it('charges cached input at the cache price', () => {
    const cost = costUsd(
      priced,
      {
        inputTokens: 100_000,
        cachedInputTokens: 50_000,
        outputTokens: 100_000,
        reasoningTokens: null,
      },
      new Date('2026-11-01'),
    );
    // 50k × $2 + 50k × $0.20 + 100k × $10, per million
    expect(cost).toBeCloseTo(0.1 + 0.01 + 1);
  });

  it('returns null without usage', () => {
    const usage = {
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
    };
    expect(costUsd(priced, usage, new Date())).toBeNull();
  });

  it('rejects price periods out of order', () => {
    expect(() =>
      model({
        id: 'bad',
        pricing: [
          { inputPerM: 1, outputPerM: 1 },
          { from: '2027-01-01', inputPerM: 1, outputPerM: 1 },
          { from: '2026-12-01', inputPerM: 1, outputPerM: 1 },
        ],
      }),
    ).toThrow();
  });

  it('blends input and output prices', () => {
    expect(blendedPrice(priced, new Date('2026-11-01'))).toBeCloseTo((2 + 20) / 3);
  });
});

describe('rankModels', () => {
  const at = new Date('2026-11-01');
  const cheap = model({
    id: 'cheap',
    tier: 'fast',
    pricing: [{ inputPerM: 0.1, outputPerM: 0.5 }],
    speed: { tokensPerSec: 300, latencyMs: 500 },
    scores: { chat: 70, math: 62 },
  });
  const mid = model({
    id: 'mid',
    tier: 'balanced',
    pricing: [{ inputPerM: 2, outputPerM: 10 }],
    scores: { chat: 85, math: 80 },
  });
  const top = model({
    id: 'top',
    tier: 'best',
    pricing: [{ inputPerM: 5, outputPerM: 25 }],
    speed: { tokensPerSec: 50, latencyMs: 10_000 },
    scores: { chat: 92, math: 95 },
  });
  const ids = (category: TaskCategory, mode: Parameters<typeof rankModels>[2]) =>
    rankModels([top, cheap, mid], category, mode, at).map((m) => m.id);

  it('Cheapest takes the cheapest model above the bar', () => {
    expect(ids('chat', 'cheapest')).toEqual(['cheap', 'mid', 'top']);
    // Hard categories need a higher score: "cheap" scores 62 at math, under the bar of 66.
    expect(ids('math', 'cheapest')).toEqual(['mid', 'top', 'cheap']);
  });

  it('Balanced prefers mid-tier models and escalates for hard tasks', () => {
    expect(ids('chat', 'balanced')).toEqual(['mid', 'top', 'cheap']);
    expect(ids('math', 'balanced')).toEqual(['top', 'mid', 'cheap']);
  });

  it('Best takes the highest score', () => {
    expect(ids('chat', 'best')).toEqual(['top', 'mid', 'cheap']);
  });

  it('Fastest takes the quickest model above the bar', () => {
    expect(ids('chat', 'fastest')).toEqual(['cheap', 'mid', 'top']);
  });

  it('uses the bundled data sensibly', () => {
    const anthropic = BUNDLED_REGISTRY.forProvider('anthropic');
    const first = (category: TaskCategory, mode: Parameters<typeof rankModels>[2]) =>
      rankModels(anthropic, category, mode, at)[0]?.id;
    expect(first('chat', 'cheapest')).toBe('claude-haiku-5-5');
    expect(first('chat', 'balanced')).toBe('claude-sonnet-5-5');
    expect(first('chat', 'best')).toBe('claude-opus-5-5');
  });
});

describe('parseRegistry', () => {
  const file = (models: unknown[]) => ({
    schemaVersion: 1,
    version: 2026101500,
    updatedAt: '2026-10-15',
    models,
  });
  const everyProvider = ProviderId.options.map((provider) =>
    model({ id: `${provider}-model`, provider }),
  );

  it('skips entries it cannot read', () => {
    const parsed = parseRegistry(file([...everyProvider, { id: 'x', provider: 'mistral' }]));
    expect(parsed.skipped).toBe(1);
    expect(parsed.registry.models).toHaveLength(4);
  });

  it('rejects unknown formats and registries missing a provider', () => {
    expect(() => parseRegistry({ ...file(everyProvider), schemaVersion: 2 })).toThrow();
    expect(() => parseRegistry(file(everyProvider.slice(1)))).toThrow(/no models for xai/);
  });

  it('downloads and validates the published file', async () => {
    const ok = (body: unknown) =>
      Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    const parsed = await fetchRegistry(() => ok(file(everyProvider)));
    expect(parsed.registry.version).toBe(2026101500);
    await expect(
      fetchRegistry(() => Promise.resolve(new Response('nope', { status: 404 }))),
    ).rejects.toThrow(/HTTP 404/);
  });
});
