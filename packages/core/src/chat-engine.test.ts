import { fileURLToPath } from 'node:url';
import { AccountService, type SecretBox } from '@ultimatellm/accounts';
import {
  createAccountStore,
  createChatStore,
  openDatabase,
  type DatabaseHandle,
} from '@ultimatellm/db';
import { createProviderAdapters } from '@ultimatellm/providers';
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

const started = () => events.filter((e) => e.type === 'started');
const finished = () => events.filter((e) => e.type === 'finished');

describe('ChatEngine', () => {
  it('answers with the manager and saves the conversation', async () => {
    await addKey('anthropic', 'key-anthropic', 'Personal');
    const { chatId } = await ask('What is a monorepo?');

    expect(started()).toMatchObject([
      { provider: 'anthropic', model: 'claude-sonnet-5-5', accountLabel: 'Personal' },
    ]);
    expect(finished()).toMatchObject([{ status: 'complete' }]);

    const chat = engine.getChat(chatId);
    expect(chat?.chat.title).toBe('What is a monorepo?');
    expect(chat?.messages.map((m) => [m.role, m.status])).toEqual([
      ['user', 'complete'],
      ['assistant', 'complete'],
    ]);
    const reply = chat!.messages[1]!;
    expect(reply.content).toContain('What is a monorepo?');
    expect(reply).toMatchObject({ modelName: 'Claude Sonnet 5.5', accountLabel: 'Personal' });
    expect(reply.outputTokens).toBeGreaterThan(0);

    const streamed = events.flatMap((e) => (e.type === 'text' ? [e.delta] : [])).join('');
    expect(streamed).toBe(reply.content);
  });

  it('prefers Grok, and follows the output mode and the user’s manager order', async () => {
    await addKey('google', 'key-google');
    await addKey('xai', 'key-xai-1');
    await ask('hi', { outputMode: 'best' });
    expect(started()[0]).toMatchObject({ provider: 'xai', model: 'grok-4.7' });

    managerOrder = ['google', 'xai', 'anthropic', 'openai'];
    events = [];
    await ask('hi again', { outputMode: 'cheapest' });
    expect(started()[0]).toMatchObject({ provider: 'google', model: 'gemini-3.5-flash-lite' });
  });

  it('fails over from a rate-limited account to the next one, and pauses it', async () => {
    const limited = await addKey('anthropic', 'ratelimited-key', 'Work');
    await addKey('anthropic', 'key-good', 'Personal');
    await ask('hello');

    expect(started().map((e) => e.accountLabel)).toEqual(['Work', 'Personal']);
    expect(events.some((e) => e.type === 'retrying')).toBe(true);
    expect(finished()).toMatchObject([{ status: 'complete' }]);
    expect(accounts.list().find((a) => a.id === limited.id)?.status).toBe('rate_limited');
  });

  it('moves to the next manager when a key was revoked', async () => {
    const revoked = await addKey('xai', 'revoked-key');
    await addKey('openai', 'key-openai');
    await ask('hello');

    expect(started().map((e) => e.provider)).toEqual(['xai', 'openai']);
    expect(finished()).toMatchObject([{ status: 'complete' }]);
    expect(accounts.list().find((a) => a.id === revoked.id)?.status).toBe('auth_invalid');
  });

  it('keeps the partial reply when stopped', async () => {
    await addKey('google', 'key-google');
    const { chatId, runId } = engine.send({
      text: '[slow] tell me a story',
      outputMode: 'fastest',
      planMode: 'auto',
    });
    await waitFor(() => events.some((e) => e.type === 'text'));
    engine.stop(runId);
    await engine.waitForRun(runId);

    expect(finished()).toMatchObject([{ status: 'stopped' }]);
    const reply = engine.getChat(chatId)!.messages[1]!;
    expect(reply.status).toBe('stopped');
    expect(reply.content.length).toBeGreaterThan(0);
  });

  it('explains when no account is available', async () => {
    const { chatId } = await ask('hello?');
    const [end] = finished();
    expect(end).toMatchObject({ status: 'error' });
    expect(end?.type === 'finished' ? end.error : '').toContain('Settings');
    expect(engine.getChat(chatId)!.messages[1]).toMatchObject({
      role: 'assistant',
      status: 'error',
    });
  });

  it('continues an existing chat and refuses a second message while replying', async () => {
    await addKey('anthropic', 'key-anthropic');
    const { chatId } = await ask('first');
    await ask('second', { chatId });
    expect(engine.getChat(chatId)!.messages).toHaveLength(4);

    const { runId } = engine.send({
      chatId,
      text: '[slow] third',
      outputMode: 'fastest',
      planMode: 'auto',
    });
    expect(() =>
      engine.send({ chatId, text: 'fourth', outputMode: 'fastest', planMode: 'auto' }),
    ).toThrow(/current reply/);
    engine.stop(runId);
    await engine.waitForRun(runId);
    expect(engine.listChats()).toHaveLength(1);
  });

  it('removes chats with their messages', async () => {
    await addKey('anthropic', 'key-anthropic');
    const { chatId } = await ask('to delete');
    engine.removeChat(chatId);
    expect(engine.getChat(chatId)).toBeNull();
    expect(engine.listChats()).toEqual([]);
  });
});

describe('titleFrom', () => {
  it('uses the first line, shortened', () => {
    expect(titleFrom('  Plan a trip\nwith details')).toBe('Plan a trip');
    expect(titleFrom('x'.repeat(80))).toHaveLength(58);
    expect(titleFrom('   ')).toBe('New chat');
  });
});

async function waitFor(condition: () => boolean, timeoutMs = 5000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
