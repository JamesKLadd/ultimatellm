import { describe, expect, it } from 'vitest';
import { modelCandidates, modelName, supportedEffort } from './registry';

describe('modelCandidates', () => {
  it('starts with the requested tier and falls back to the others', () => {
    expect(modelCandidates('anthropic', 'best')).toEqual([
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'claude-haiku-5-5',
    ]);
    expect(modelCandidates('openai', 'fast')).toEqual(['gpt-6-luna', 'gpt-6.1-sol']);
  });

  it("skips models the account can't use (e.g. a free-tier key)", () => {
    expect(
      modelCandidates('google', 'best', ['gemini-3.8-flash', 'gemini-3.5-flash-lite']),
    ).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
  });

  it('still tries known models if the account lists none of them', () => {
    expect(modelCandidates('xai', 'best', ['some-new-grok'])).toEqual(
      modelCandidates('xai', 'best'),
    );
  });
});

describe('modelName / supportedEffort', () => {
  it('names known models and passes unknown IDs through', () => {
    expect(modelName('gpt-6.1-sol')).toBe('GPT-6.1 Sol');
    expect(modelName('mystery-model')).toBe('mystery-model');
  });

  it('picks the nearest supported effort level', () => {
    expect(supportedEffort('claude-haiku-5-5', 'max')).toBe('high');
    expect(supportedEffort('claude-haiku-5-5', 'none')).toBe('low');
    expect(supportedEffort('gpt-6-luna', 'medium')).toBe('medium');
    expect(supportedEffort('gemini-3.8-flash', 'high')).toBeUndefined();
  });
});
