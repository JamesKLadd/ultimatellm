import { fileURLToPath } from 'node:url';
import { createAccountStore, openDatabase, type DatabaseHandle } from '@ultimatellm/db';
import { createProviderAdapters, ProviderError } from '@ultimatellm/providers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccountService, type SecretBox } from './account-service';

const migrationsFolder = fileURLToPath(new URL('../../db/migrations', import.meta.url));

/** Reversible stand-in for safeStorage. */
const fakeSecrets: SecretBox = {
  encrypt: (plain) => `enc:${Buffer.from(plain).toString('base64')}`,
  decrypt: (cipher) => {
    if (!cipher.startsWith('enc:')) throw new Error('bad ciphertext');
    return Buffer.from(cipher.slice(4), 'base64').toString();
  },
};

let handle: DatabaseHandle;
let clock: number;
let service: AccountService;

beforeEach(() => {
  handle = openDatabase({ file: ':memory:', migrationsFolder });
  clock = Date.UTC(2026, 9, 14, 12);
  service = new AccountService({
    store: createAccountStore(handle.db),
    adapters: createProviderAdapters({ mock: true }),
    secrets: fakeSecrets,
    now: () => clock,
  });
});

afterEach(() => handle.close());

describe('adding keys', () => {
  it('validates, encrypts and lists a key without exposing it', async () => {
    const result = await service.addApiKey({ provider: 'anthropic', apiKey: 'sk-ant-test-1234' });
    expect(result).toMatchObject({
      ok: true,
      account: { provider: 'anthropic', label: 'API key 1', keyHint: '…1234', status: 'active' },
    });

    const stored = handle.db.$client.prepare('SELECT ciphertext FROM account_secrets').get() as {
      ciphertext: string;
    };
    expect(stored.ciphertext).not.toContain('sk-ant-test-1234');

    expect(JSON.stringify(service.list())).not.toContain('sk-ant-test-1234');
    expect(service.list()[0]?.modelCount).toBeGreaterThan(0);
  });

  it('reports keys the provider rejects, and saves nothing', async () => {
    const result = await service.addApiKey({ provider: 'xai', apiKey: 'invalid-key-0000' });
    expect(result).toEqual({
      ok: false,
      error: "xAI didn't accept this key: Mock: this API key is invalid.",
    });
    expect(service.list()).toEqual([]);
  });

  it('explains malformed keys instead of throwing', async () => {
    await expect(service.addApiKey({ provider: 'openai', apiKey: 'short' })).resolves.toEqual({
      ok: false,
      error: 'That key looks too short.',
    });
  });

  it('refuses duplicates and numbers default labels per provider', async () => {
    await service.addApiKey({ provider: 'openai', apiKey: 'sk-first-1111' });
    const second = await service.addApiKey({ provider: 'openai', apiKey: 'sk-second-2222' });
    expect(second).toMatchObject({ ok: true, account: { label: 'API key 2', priority: 1 } });

    const duplicate = await service.addApiKey({ provider: 'openai', apiKey: 'sk-first-1111' });
    expect(duplicate).toEqual({ ok: false, error: 'This OpenAI key has already been added.' });
  });
});

describe('priority and removal', () => {
  it('reorders a provider and removes accounts with their secrets', async () => {
    await service.addApiKey({ provider: 'google', apiKey: 'key-aaaa', label: 'Personal' });
    await service.addApiKey({ provider: 'google', apiKey: 'key-bbbb', label: 'Work' });
    const [personal, work] = service.list();

    service.reorder('google', [work!.id, personal!.id]);
    expect(service.candidates('google').map((c) => c.account.label)).toEqual(['Work', 'Personal']);
    expect(() => service.reorder('google', [work!.id])).toThrow();

    service.remove(work!.id);
    expect(service.list().map((a) => a.label)).toEqual(['Personal']);
    const secrets = handle.db.$client
      .prepare('SELECT count(*) AS n FROM account_secrets')
      .get() as {
      n: number;
    };
    expect(secrets.n).toBe(1);
  });
});

describe('health', () => {
  beforeEach(async () => {
    await service.addApiKey({ provider: 'anthropic', apiKey: 'key-1111' });
    await service.addApiKey({ provider: 'google', apiKey: 'key-2222' });
  });

  const anthropicId = () => service.list().find((a) => a.provider === 'anthropic')!.id;

  it('pauses rate-limited accounts until the limit resets', () => {
    service.recordFailure(
      anthropicId(),
      new ProviderError('rate_limited', 'slow down', { retryAfterMs: 30_000 }),
    );
    expect(service.usableProviders()).toEqual(['google']);
    expect(service.candidates('anthropic')).toEqual([]);

    clock += 30_000;
    expect(service.usableProviders()).toContain('anthropic');
  });

  it('pauses exhausted accounts for longer and clears the state after a success', () => {
    service.recordFailure(anthropicId(), new ProviderError('quota_exhausted', 'no credit'));
    clock += 60_000;
    expect(service.usableProviders()).toEqual(['google']);
    clock += 15 * 60_000;
    expect(service.usableProviders()).toContain('anthropic');

    expect(service.recordSuccess(anthropicId())).toBe(true);
    expect(service.list().find((a) => a.id === anthropicId())).toMatchObject({
      status: 'active',
      lastError: null,
      unavailableUntil: null,
    });
  });

  it('keeps rejected keys out until they are checked again', async () => {
    service.recordFailure(anthropicId(), new ProviderError('auth_invalid', 'revoked'));
    clock += 24 * 60 * 60_000;
    expect(service.usableProviders()).toEqual(['google']);

    const rechecked = await service.recheck(anthropicId());
    expect(rechecked.status).toBe('active');
    expect(service.usableProviders()).toContain('anthropic');
  });

  it('hands out decrypted credentials only to the request path', () => {
    const [candidate] = service.candidates('google');
    expect(candidate?.credential).toEqual({ type: 'api_key', apiKey: 'key-2222' });
  });
});
