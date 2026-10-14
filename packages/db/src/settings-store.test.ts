import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, type DatabaseHandle } from './client';
import { createSettingsStore } from './settings-store';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

const handles: DatabaseHandle[] = [];
const tempDirs: string[] = [];

function open(file = ':memory:') {
  const handle = openDatabase({ file, migrationsFolder });
  handles.push(handle);
  return handle;
}

function tempDbFile() {
  const dir = mkdtempSync(join(tmpdir(), 'ull-db-'));
  tempDirs.push(dir);
  return join(dir, 'test.db');
}

afterEach(() => {
  for (const handle of handles.splice(0)) handle.close();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

describe('settings store', () => {
  it('returns the default when a setting has never been saved', () => {
    const store = createSettingsStore(open().db);
    expect(store.get('appearance.theme')).toBe('system');
  });

  it('saves and overwrites values', () => {
    const store = createSettingsStore(open().db);
    store.set('appearance.theme', 'dark');
    expect(store.get('appearance.theme')).toBe('dark');
    store.set('appearance.theme', 'light');
    expect(store.get('appearance.theme')).toBe('light');
  });

  it('rejects values that do not match the schema', () => {
    const store = createSettingsStore(open().db);
    // @ts-expect-error: deliberately invalid value
    expect(() => store.set('appearance.theme', 'purple')).toThrow();
    expect(store.get('appearance.theme')).toBe('system');
  });

  it('falls back to the default when a stored value is invalid', () => {
    const { db } = open();
    db.$client
      .prepare("INSERT INTO settings (key, value, updated_at) VALUES ('appearance.theme', ?, ?)")
      .run(JSON.stringify('neon'), Date.now());
    expect(createSettingsStore(db).get('appearance.theme')).toBe('system');
  });

  it('stores the manager order and hands out copies of the default', () => {
    const store = createSettingsStore(open().db);
    const order = store.get('orchestration.managerPriority');
    expect(order).toEqual(['xai', 'anthropic', 'openai', 'google']);
    order.reverse();
    expect(store.get('orchestration.managerPriority')[0]).toBe('xai');

    store.set('orchestration.managerPriority', ['anthropic', 'google', 'openai', 'xai']);
    expect(store.get('orchestration.managerPriority')).toEqual([
      'anthropic',
      'google',
      'openai',
      'xai',
    ]);
    expect(() => store.set('orchestration.managerPriority', ['xai', 'xai'])).toThrow();
  });

  it('persists values across restarts and re-running migrations is safe', () => {
    const file = tempDbFile();

    const first = open(file);
    createSettingsStore(first.db).set('appearance.theme', 'dark');
    first.close();
    handles.splice(handles.indexOf(first), 1);

    const second = open(file);
    expect(createSettingsStore(second.db).get('appearance.theme')).toBe('dark');
  });
});
