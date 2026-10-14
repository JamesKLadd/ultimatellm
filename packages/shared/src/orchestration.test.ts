import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MANAGER_PRIORITY,
  ManagerPriority,
  rankManagers,
  resolveManagerPriority,
} from './orchestration';
import { ProviderId } from './providers';

const ALL_PROVIDERS = ProviderId.options;

describe('manager selection', () => {
  it('defaults to Grok, then Claude, ChatGPT and Gemini', () => {
    expect(DEFAULT_MANAGER_PRIORITY).toEqual(['xai', 'anthropic', 'openai', 'google']);
    expect(rankManagers(DEFAULT_MANAGER_PRIORITY, ALL_PROVIDERS)[0]).toBe('xai');
  });

  it('does not require xAI: the first provider with an account manages', () => {
    expect(rankManagers(DEFAULT_MANAGER_PRIORITY, ['google', 'openai', 'anthropic'])).toEqual([
      'anthropic',
      'openai',
      'google',
    ]);
    expect(rankManagers(DEFAULT_MANAGER_PRIORITY, ['google'])).toEqual(['google']);
  });

  it('returns no managers when no provider has a usable account', () => {
    expect(rankManagers(DEFAULT_MANAGER_PRIORITY, [])).toEqual([]);
  });

  it("follows the user's own order", () => {
    expect(rankManagers(['google', 'xai', 'anthropic', 'openai'], ALL_PROVIDERS)).toEqual([
      'google',
      'xai',
      'anthropic',
      'openai',
    ]);
  });

  it('appends providers missing from a saved order, in default order', () => {
    expect(resolveManagerPriority(['openai'])).toEqual(['openai', 'xai', 'anthropic', 'google']);
    expect(resolveManagerPriority([])).toEqual([...DEFAULT_MANAGER_PRIORITY]);
  });

  it('rejects a saved order that lists a provider twice', () => {
    expect(ManagerPriority.safeParse(['xai', 'xai']).success).toBe(false);
    expect(ManagerPriority.safeParse(['anthropic', 'xai']).success).toBe(true);
  });
});
