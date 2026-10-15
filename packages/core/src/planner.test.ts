import { BUNDLED_REGISTRY } from '@ultimatellm/registry';
import { describe, expect, it } from 'vitest';
import { runGraph, type GraphStatus } from './graph';
import { parseMentions } from './mentions';
import { draftToRaw, repairPlan, type PlanningContext, type RawPlan } from './planner';
import { normalizePath } from './workspace';

const context = (providers: string[]): PlanningContext => ({
  registry: BUNDLED_REGISTRY,
  usable: BUNDLED_REGISTRY.models.filter((m) => providers.includes(m.provider)),
  mode: 'balanced',
  at: new Date('2026-11-01'),
});

const task = (overrides: Partial<RawPlan['tasks'][number]>): RawPlan['tasks'][number] => ({
  key: 't1',
  title: 'Task',
  instructions: 'Do it',
  category: 'coding',
  model: 'claude-sonnet-5-5',
  effort: 'medium',
  dependsOn: [],
  outputs: [],
  rationale: '',
  ...overrides,
});

describe('repairPlan', () => {
  it('replaces models the user cannot use and adds fallbacks', () => {
    const plan = repairPlan(
      {
        kind: 'workflow',
        summary: 'x',
        spec: 'spec',
        tasks: [
          task({ key: 'a', model: 'gpt-6-astra', category: 'coding' }),
          task({ key: 'b', model: 'grok-4.20-non-reasoning', category: 'chat' }),
        ],
      },
      context(['anthropic', 'xai']),
    );
    // Astra isn't usable here: the best usable coder for Balanced takes over.
    expect(plan.tasks[0]).toMatchObject({ model: 'claude-sonnet-5-5' });
    // Aliases resolve to the registry ID.
    expect(plan.tasks[1]).toMatchObject({ model: 'grok-4.20-0309-non-reasoning' });
    expect(plan.tasks[0]?.fallbacks).not.toContain('claude-sonnet-5-5');
    expect(plan.tasks[0]?.fallbacks.length).toBeGreaterThan(0);
  });

  it('moves effort to a level the model supports', () => {
    const plan = repairPlan(
      {
        kind: 'workflow',
        summary: '',
        spec: '',
        tasks: [
          task({ key: 'a', model: 'gpt-6.1-sol', effort: 'none' }),
          task({ key: 'b', model: 'gemini-3.8-flash', effort: 'high' }),
        ],
      },
      context(['openai', 'google']),
    );
    expect(plan.tasks.map((t) => t.effort)).toEqual(['low', undefined]);
  });

  it('keeps dependencies on earlier tasks only and makes keys unique', () => {
    const plan = repairPlan(
      {
        kind: 'workflow',
        summary: '',
        spec: '',
        tasks: [
          task({ key: 'setup', dependsOn: ['later', 'setup'] }),
          task({ key: 'setup', dependsOn: ['setup'] }),
          task({ key: 'later', dependsOn: ['setup', 'missing'] }),
        ],
      },
      context(['anthropic']),
    );
    expect(plan.tasks.map((t) => [t.key, t.dependsOn])).toEqual([
      ['setup', []],
      ['t2', ['setup']],
      ['later', ['t2']],
    ]);
  });

  it('cleans output paths and gives each file to one task', () => {
    const plan = repairPlan(
      {
        kind: 'workflow',
        summary: '',
        spec: '',
        tasks: [
          task({ key: 'a', outputs: ['./src\\game.js', '../etc/passwd', 'C:/x.txt'] }),
          task({ key: 'b', outputs: ['src/game.js', 'README.md'] }),
        ],
      },
      context(['anthropic']),
    );
    expect(plan.tasks.map((t) => t.outputs)).toEqual([['src/game.js'], ['README.md']]);
  });

  it('caps the number of tasks', () => {
    const tasks = Array.from({ length: 12 }, (_, i) => task({ key: `t${i + 1}` }));
    const plan = repairPlan(
      { kind: 'workflow', summary: '', spec: '', tasks },
      context(['anthropic']),
    );
    expect(plan.tasks).toHaveLength(8);
  });

  it('turns a workflow without tasks into a direct answer of the request', () => {
    const raw = draftToRaw(
      {
        kind: 'workflow',
        summary: 'Hmm',
        category: 'math',
        model: 'claude-opus-5-5',
        effort: 'high',
        spec: 'x',
        tasks: [],
      },
      'What is 2+2?',
    );
    const plan = repairPlan(raw, context(['anthropic']));
    expect(plan).toMatchObject({ kind: 'direct', spec: '' });
    expect(plan.tasks).toMatchObject([
      { key: 'answer', instructions: 'What is 2+2?', model: 'claude-opus-5-5', effort: 'high' },
    ]);
  });
});

describe('runGraph', () => {
  const signal = new AbortController().signal;

  it('runs independent tasks in parallel and waits for dependencies', async () => {
    const log: string[] = [];
    const run = async (t: { key: string }): Promise<GraphStatus> => {
      log.push(`+${t.key}`);
      await new Promise((resolve) => setTimeout(resolve, t.key === 'a' ? 30 : 5));
      log.push(`-${t.key}`);
      return 'done';
    };
    const status = await runGraph(
      [
        { key: 'a', dependsOn: [] },
        { key: 'b', dependsOn: [] },
        { key: 'c', dependsOn: ['a', 'b'] },
      ],
      run,
      { concurrency: 4, signal },
    );
    expect(log.slice(0, 2)).toEqual(['+a', '+b']);
    expect(log.indexOf('+c')).toBeGreaterThan(log.indexOf('-a'));
    expect([...status.values()]).toEqual(['done', 'done', 'done']);
  });

  it('skips tasks whose dependency failed, and respects the concurrency limit', async () => {
    let running = 0;
    let peak = 0;
    const skipped: string[] = [];
    const status = await runGraph(
      [
        { key: 'a', dependsOn: [] },
        { key: 'b', dependsOn: ['a'] },
        { key: 'c', dependsOn: ['b'] },
        { key: 'd', dependsOn: [] },
        { key: 'e', dependsOn: [] },
      ],
      async (t) => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running--;
        if (t.key === 'a') throw new Error('boom');
        return 'done';
      },
      { concurrency: 2, signal, onSkip: (t) => skipped.push(t.key) },
    );
    expect(Object.fromEntries(status)).toEqual({
      a: 'failed',
      b: 'skipped',
      c: 'skipped',
      d: 'done',
      e: 'done',
    });
    expect(skipped).toEqual(['b', 'c']);
    expect(peak).toBe(2);
  });
});

describe('parseMentions', () => {
  it('pins a provider or model and strips a leading mention', () => {
    expect(parseMentions('@claude explain this', BUNDLED_REGISTRY)).toEqual({
      text: 'explain this',
      pin: { kind: 'provider', provider: 'anthropic', mention: '@claude' },
    });
    expect(parseMentions('@GPT, hi', BUNDLED_REGISTRY).pin).toMatchObject({ provider: 'openai' });
    expect(parseMentions('Compare with @opus.', BUNDLED_REGISTRY)).toEqual({
      text: 'Compare with @opus.',
      pin: { kind: 'model', modelId: 'claude-opus-5-5', mention: '@opus' },
    });
    expect(parseMentions('@gpt-6.1-sol', BUNDLED_REGISTRY)).toMatchObject({
      text: '@gpt-6.1-sol',
      pin: { modelId: 'gpt-6.1-sol' },
    });
  });

  it('ignores unknown mentions and email addresses', () => {
    expect(parseMentions('mail me@claude.ai or @someone', BUNDLED_REGISTRY).pin).toBeNull();
  });
});

describe('normalizePath', () => {
  it('accepts relative paths and rejects anything that could escape', () => {
    expect(normalizePath('./src//game.js')).toBe('src/game.js');
    expect(normalizePath('assets\\court.svg')).toBe('assets/court.svg');
    expect(normalizePath('/abs/path.txt')).toBe('abs/path.txt');
    for (const bad of [
      '../x',
      'a/../../b',
      '',
      '.',
      'C:/x',
      'a/b?.txt',
      'name. ',
      'x'.repeat(301),
    ]) {
      expect(normalizePath(bad), bad).toBeNull();
    }
  });
});
