import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createChatStore, type NewStep } from './chats-store';
import { openDatabase, type DatabaseHandle } from './client';
import { createWorkspaceStore } from './workspace-store';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
const handles: DatabaseHandle[] = [];

function setup() {
  const handle = openDatabase({ file: ':memory:', migrationsFolder });
  handles.push(handle);
  const chats = createChatStore(handle.db);
  const workspace = createWorkspaceStore(handle.db);
  const now = new Date('2026-10-15T10:00:00Z');
  const chat = chats.createChat('Test', now);
  const message = chats.addMessage(
    { chatId: chat.id, role: 'assistant', content: '', status: 'running' },
    now,
  );
  return { chats, workspace, chat, message, now };
}

const step = (messageId: string, key: string, overrides: Partial<NewStep> = {}): NewStep => ({
  messageId,
  key,
  kind: 'task',
  position: 1,
  title: key,
  instructions: '',
  rationale: '',
  status: 'queued',
  report: '',
  ...overrides,
});

afterEach(() => {
  for (const handle of handles.splice(0)) handle.close();
});

describe('plans and steps', () => {
  it('saves a plan and updates steps in place', () => {
    const { chats, message, now } = setup();
    chats.savePlan({
      messageId: message.id,
      kind: 'workflow',
      summary: 'v1',
      spec: '',
      planMode: 'review',
      createdAt: now,
    });
    chats.savePlan({
      messageId: message.id,
      kind: 'workflow',
      summary: 'v2',
      spec: 'spec',
      planMode: 'review',
      createdAt: now,
    });
    expect(chats.getPlans([message.id])).toMatchObject([{ summary: 'v2', spec: 'spec' }]);

    chats.saveStep(step(message.id, 't2', { position: 2, dependsOn: ['t1'] }));
    chats.saveStep(step(message.id, 't1'));
    chats.saveStep(step(message.id, 't1', { status: 'done', report: 'ok', costUsd: 0.25 }));
    const steps = chats.getSteps([message.id]);
    expect(steps.map((s) => [s.key, s.status])).toEqual([
      ['t1', 'done'],
      ['t2', 'queued'],
    ]);
    expect(steps[0]).toMatchObject({ report: 'ok', costUsd: 0.25 });
    expect(steps[1]?.dependsOn).toEqual(['t1']);

    chats.pruneSteps(message.id, ['t1']);
    expect(chats.getSteps([message.id]).map((s) => s.key)).toEqual(['t1']);
  });

  it('marks replies left running as interrupted', () => {
    const { chats, chat, message } = setup();
    chats.saveStep(step(message.id, 't1', { status: 'running' }));
    chats.saveStep(step(message.id, 't2', { status: 'queued' }));
    chats.saveStep(step(message.id, 't3', { status: 'done' }));

    expect(chats.interruptRunning()).toBe(1);
    expect(chats.getMessages(chat.id)[0]).toMatchObject({ status: 'error' });
    expect(chats.getSteps([message.id]).map((s) => s.status)).toEqual([
      'stopped',
      'skipped',
      'done',
    ]);
    expect(chats.interruptRunning()).toBe(0);
  });

  it('deletes plans, steps and files with the chat', () => {
    const { chats, workspace, chat, message, now } = setup();
    chats.saveStep(step(message.id, 't1'));
    workspace.write(
      {
        chatId: chat.id,
        messageId: message.id,
        stepKey: 't1',
        path: 'a.txt',
        content: 'x',
        mime: 'text/plain',
      },
      now,
    );
    chats.removeChat(chat.id);
    expect(chats.getSteps([message.id])).toEqual([]);
    expect(workspace.list(chat.id)).toEqual([]);
  });
});

describe('workspace', () => {
  it('keeps versions and lists the latest one per path', () => {
    const { workspace, chat, message, now } = setup();
    const write = (path: string, content: string, at: Date, stepKey = 't1') =>
      workspace.write(
        { chatId: chat.id, messageId: message.id, stepKey, path, content, mime: 'text/plain' },
        at,
      );
    write('src/game.js', 'v1', now);
    write('README.md', 'hello', now);
    write('src/game.js', 'version 2 ✓', new Date(now.getTime() + 1000), 't2');

    expect(workspace.list(chat.id)).toEqual([
      expect.objectContaining({ path: 'README.md', versions: 1 }),
      expect.objectContaining({ path: 'src/game.js', versions: 2, stepKey: 't2', size: 13 }),
    ]);
    expect(workspace.read(chat.id, 'src/game.js')?.content).toBe('version 2 ✓');
    expect(workspace.read(chat.id, 'missing.txt')).toBeUndefined();
    expect(workspace.writtenBy([message.id])).toHaveLength(3);
  });
});
