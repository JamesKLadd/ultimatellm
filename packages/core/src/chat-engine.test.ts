import { fileURLToPath } from 'node:url';
import { AccountService, type SecretBox } from '@ultimatellm/accounts';
import {
  createAccountStore,
  createChatStore,
  createWorkspaceStore,
  openDatabase,
  type DatabaseHandle,
} from '@ultimatellm/db';
import { createProviderAdapters } from '@ultimatellm/providers';
import { BUNDLED_REGISTRY } from '@ultimatellm/registry';
import {
  DEFAULT_MANAGER_PRIORITY,
  type ChatRunEvent,
  type ProviderId,
  type SendMessageInput,
} from '@ultimatellm/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatEngine, titleFrom } from './chat-engine';

const migrationsFolder = fileURLToPath(new URL('../../db/migrations', import.meta.url));
const secrets: SecretBox = { encrypt: (s) => `x${s}`, decrypt: (s) => s.slice(1) };

let handle: DatabaseHandle;
let accounts: AccountService;
let engine: ChatEngine;
let events: ChatRunEvent[];
let managerOrder: readonly ProviderId[];

beforeEach(() => {
  handle = openDatabase({ file: ':memory:', migrationsFolder });
  const adapters = createProviderAdapters({ mock: true });
  accounts = new AccountService({ store: createAccountStore(handle.db), adapters, secrets });
  events = [];
  managerOrder = DEFAULT_MANAGER_PRIORITY;
  engine = new ChatEngine({
    accounts,
    adapters,
    chats: createChatStore(handle.db),
    workspace: createWorkspaceStore(handle.db),
    registry: () => BUNDLED_REGISTRY,
    managerOrder: () => managerOrder,
    emit: (event) => events.push(event),
  });
});

afterEach(() => handle.close());

async function addKey(provider: ProviderId, apiKey: string, label?: string) {
  const result = await accounts.addApiKey({ provider, apiKey, ...(label ? { label } : {}) });
  if (!result.ok) throw new Error(result.error);
  return result.account;
}

async function ask(text: string, extra: Partial<SendMessageInput> = {}) {
  const result = engine.send({ text, outputMode: 'balanced', planMode: 'auto', ...extra });
  await engine.waitForRun(result.runId);
  return result;
}

function lastReply(chatId: string) {
  const reply = engine.getChat(chatId)?.messages.at(-1);
  if (!reply) throw new Error('No reply');
  return reply;
}

const of = <T extends ChatRunEvent['type']>(type: T) =>
  events.filter((e): e is Extract<ChatRunEvent, { type: T }> => e.type === type);

describe('direct answers', () => {
  it('plans with the manager, then answers with the best model for the request', async () => {
    await addKey('anthropic', 'key-anthropic', 'Personal');
    const { chatId } = await ask('What is a monorepo?');

    expect(of('step-started').map((e) => [e.step, e.model, e.accountLabel])).toEqual([
      ['plan', 'claude-haiku-5-5', 'Personal'],
      ['answer', 'claude-sonnet-5-5', 'Personal'],
    ]);
    expect(of('plan')[0]).toMatchObject({
      awaitingApproval: false,
      plan: { kind: 'direct', manager: { model: 'claude-haiku-5-5' } },
    });
    expect(of('finished')).toMatchObject([{ status: 'complete' }]);

    const chat = engine.getChat(chatId);
    expect(chat?.chat.title).toBe('What is a monorepo?');
    const reply = chat!.messages[1]!;
    expect(reply.content).toContain('What is a monorepo?');
    expect(reply).toMatchObject({
      status: 'complete',
      modelName: 'Claude Sonnet 5.5',
      accountLabel: 'Personal',
      outputMode: 'balanced',
      plan: { kind: 'direct', summary: 'Answer directly' },
    });
    expect(reply.steps.map((s) => [s.key, s.status])).toEqual([
      ['plan', 'done'],
      ['answer', 'done'],
    ]);
    // Totals include the planning call.
    expect(reply.outputTokens).toBeGreaterThan(reply.steps[1]!.outputTokens!);
    expect(reply.costUsd).toBeGreaterThan(0);
  });

  it('skips planning when the user mentions a provider or model', async () => {
    await addKey('google', 'AIza-mock-key');
    await addKey('anthropic', 'key-anthropic');
    const { chatId } = await ask('@gemini hello there');

    expect(of('step-started').map((e) => e.step)).toEqual(['answer']);
    const reply = lastReply(chatId);
    expect(reply).toMatchObject({ modelName: 'Gemini 3.8 Flash', plan: { pinned: '@gemini' } });
    // A leading mention isn't sent to the model.
    expect(reply.content).toContain('You asked: “hello there”');

    await ask('Compare these, @opus.', { chatId });
    expect(lastReply(chatId).modelName).toBe('Claude Opus 5.5');
  });

  it('explains when a mentioned model is not available', async () => {
    await addKey('google', 'AIza-mock-key');
    const { chatId } = await ask('@claude hi');
    expect(lastReply(chatId)).toMatchObject({
      status: 'error',
      error: expect.stringContaining("Claude isn't available") as unknown,
    });
  });

  it('fails over to another provider when the manager account is rate-limited', async () => {
    const work = await addKey('anthropic', 'ratelimited-key', 'Work');
    await addKey('google', 'AIza-mock-key', 'Personal');
    const { chatId } = await ask('Hello');

    expect(of('step-retrying').map((e) => e.step)).toContain('plan');
    const reply = lastReply(chatId);
    expect(reply).toMatchObject({
      status: 'complete',
      provider: 'google',
      accountLabel: 'Personal',
    });
    expect(reply.plan?.manager?.provider).toBe('google');
    expect(accounts.list().find((a) => a.id === work.id)?.status).toBe('rate_limited');
  });

  it('answers directly when planning fails', async () => {
    await addKey('openai', 'key-openai');
    const { chatId } = await ask('[badplan] Hello');
    const reply = lastReply(chatId);
    expect(reply.status).toBe('complete');
    expect(reply.steps[0]).toMatchObject({ key: 'plan', status: 'failed' });
    expect(reply.plan?.summary).toContain('Planning failed');
    expect(reply.modelName).toBe('GPT-6.1 Sol');
  });

  it('reports that no account is available', async () => {
    const { chatId } = await ask('Hi');
    expect(lastReply(chatId)).toMatchObject({
      status: 'error',
      error: expect.stringContaining('No AI account is available') as unknown,
    });
  });
});

describe('workflows', () => {
  beforeEach(async () => {
    await addKey('anthropic', 'key-anthropic', 'Claude key');
    await addKey('google', 'AIza-mock-key', 'Gemini key');
  });

  it('runs tasks across models, writes files and wraps up', async () => {
    const { chatId } = await ask('Create a tennis game');

    const plan = of('plan')[0]!.plan;
    expect(plan.kind).toBe('workflow');
    expect(plan.spec).toContain('data/players.json');
    expect(plan.tasks.map((t) => [t.key, t.dependsOn])).toEqual([
      ['t1', []],
      ['t2', ['t1']],
      ['t3', []],
    ]);
    // Balanced: the cheapest capable model, except coding, which needs a stronger one.
    expect(plan.tasks.map((t) => t.model)).toEqual([
      'gemini-3.8-flash',
      'claude-sonnet-5-5',
      'gemini-3.8-flash',
    ]);
    expect(plan.estimate.costUsd).toBeGreaterThan(0);

    // t2 waits for t1; t3 doesn't.
    const order = events
      .filter((e) => e.type === 'step-started' || e.type === 'step-finished')
      .map((e) => `${e.type === 'step-started' ? '+' : '-'}${e.step}`);
    expect(order.indexOf('-t1')).toBeLessThan(order.indexOf('+t2'));
    expect(order.indexOf('+t3')).toBeLessThan(order.indexOf('-t1'));
    expect(order.at(-1)).toBe('-wrapup');

    expect(
      of('file')
        .map((e) => e.path)
        .sort(),
    ).toEqual(['README.md', 'data/players.json', 'index.html', 'src/game.js']);
    const files = engine.listFiles(chatId);
    expect(files.find((f) => f.path === 'src/game.js')).toMatchObject({
      versions: 1,
      writtenBy: { title: 'Write the game code', modelName: 'Claude Sonnet 5.5' },
    });
    expect(engine.readFile(chatId, 'data/players.json')?.content).toContain('Gemini 3.8 Flash');

    const reply = lastReply(chatId);
    expect(reply.status).toBe('complete');
    expect(reply.content).toContain('Mock wrap-up');
    expect(reply.content).toContain('src/game.js');
    expect(reply.steps.map((s) => [s.key, s.status])).toEqual([
      ['plan', 'done'],
      ['t1', 'done'],
      ['t2', 'done'],
      ['t3', 'done'],
      ['wrapup', 'done'],
    ]);
    expect(reply.steps.find((s) => s.key === 't2')?.files).toEqual(['index.html', 'src/game.js']);
  });

  it('waits for review, then runs the edited plan', async () => {
    const { chatId, runId } = engine.send({
      text: 'Build a todo app',
      outputMode: 'balanced',
      planMode: 'review',
    });
    await waitFor(() => of('plan').length > 0);
    const plan = of('plan')[0]!;
    expect(plan.awaitingApproval).toBe(true);
    expect(of('step-started').map((e) => e.step)).toEqual(['plan']);

    engine.approvePlan({
      runId,
      spec: `${plan.plan.spec}\n- Use tabs for indentation.`,
      tasks: plan.plan.tasks
        .filter((task) => task.key !== 't3')
        .map((task) => ({
          key: task.key,
          title: task.title,
          instructions: task.instructions,
          category: task.category ?? 'chat',
          model: task.key === 't1' ? 'gemini-3.5-flash-lite' : task.model!,
          effort: task.effort,
          dependsOn: task.dependsOn,
          outputs: task.outputs,
        })),
    });
    await engine.waitForRun(runId);

    expect(of('plan')[1]).toMatchObject({ awaitingApproval: false });
    const reply = lastReply(chatId);
    expect(reply.plan?.spec).toContain('Use tabs');
    expect(reply.steps.map((s) => s.key)).toEqual(['plan', 't1', 't2', 'wrapup']);
    expect(reply.steps[1]).toMatchObject({ modelName: 'Gemini 3.5 Flash-Lite', status: 'done' });
    expect(engine.listFiles(chatId).map((f) => f.path)).not.toContain('README.md');
  });

  it('stops a plan that is waiting for review', async () => {
    const { chatId, runId } = engine.send({
      text: 'Build a todo app',
      outputMode: 'balanced',
      planMode: 'review',
    });
    await waitFor(() => of('plan').length > 0);
    engine.stop(runId);
    await engine.waitForRun(runId);
    expect(() => engine.approvePlan({ runId, spec: '', tasks: [] })).toThrow();
    const reply = lastReply(chatId);
    expect(reply.status).toBe('stopped');
    expect(reply.steps.filter((s) => s.kind === 'task').every((s) => s.status === 'skipped')).toBe(
      true,
    );
  });

  it('keeps the workspace for follow-ups in the same chat', async () => {
    const { chatId } = await ask('Create a tennis game');
    await ask('What does src/game.js do?', { chatId });
    expect(lastReply(chatId)).toMatchObject({ status: 'complete', plan: { kind: 'direct' } });
    expect(engine.filesForExport(chatId)).toHaveLength(4);
  });
});

describe('ChatEngine basics', () => {
  it('refuses a second message while a reply is running', async () => {
    await addKey('anthropic', 'key-anthropic');
    const { chatId, runId } = engine.send({
      text: 'Tell me a story [slow]',
      outputMode: 'balanced',
      planMode: 'auto',
    });
    expect(() =>
      engine.send({ chatId, text: 'Another', outputMode: 'balanced', planMode: 'auto' }),
    ).toThrow(/current reply/);
    engine.stop(runId);
    await engine.waitForRun(runId);
    expect(lastReply(chatId).status).toBe('stopped');
  });

  it('keeps a partial answer when stopped while it streams', async () => {
    await addKey('anthropic', 'key-anthropic');
    const { chatId, runId } = engine.send({
      text: 'Tell me a long story [slow]',
      outputMode: 'balanced',
      planMode: 'auto',
    });
    await waitFor(() => of('text').length > 2);
    engine.stop(runId);
    await engine.waitForRun(runId);
    const reply = lastReply(chatId);
    expect(reply.status).toBe('stopped');
    expect(reply.content).toContain('Mock reply');
    expect(reply.steps.at(-1)).toMatchObject({ key: 'answer', status: 'stopped' });
  });

  it('removes a chat and its replies', async () => {
    await addKey('anthropic', 'key-anthropic');
    const { chatId } = await ask('Hello');
    engine.removeChat(chatId);
    expect(engine.getChat(chatId)).toBeNull();
    expect(engine.listChats()).toEqual([]);
  });

  it('lists models with prices and whether they can be used', async () => {
    await addKey('google', 'AIza-mock-key');
    const models = engine.modelOptions();
    expect(models.find((m) => m.id === 'gemini-3.8-flash')).toMatchObject({ usable: true });
    expect(models.find((m) => m.id === 'claude-opus-5-5')).toMatchObject({ usable: false });
    expect(models.every((m) => m.inputPerM >= 0)).toBe(true);
  });
});

describe('titleFrom', () => {
  it('uses the first line, shortened', () => {
    expect(titleFrom('  Hello world\nsecond line')).toBe('Hello world');
    expect(titleFrom('x'.repeat(80))).toHaveLength(58);
    expect(titleFrom('   ')).toBe('New chat');
  });
});

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
