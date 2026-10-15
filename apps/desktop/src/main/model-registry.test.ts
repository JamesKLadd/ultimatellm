import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUNDLED_REGISTRY, BUNDLED_REGISTRY_FILE } from '@ultimatellm/registry';
import { afterEach, describe, expect, it } from 'vitest';
import { RegistryHolder } from './model-registry';

const dirs: string[] = [];
function cacheFile() {
  const dir = mkdtempSync(join(tmpdir(), 'ull-registry-'));
  dirs.push(dir);
  return join(dir, 'model-registry.json');
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const withVersion = (version: number) =>
  JSON.stringify({ ...(BUNDLED_REGISTRY_FILE as object), version });
const serve = (body: string) => () => Promise.resolve(new Response(body, { status: 200 }));

describe('RegistryHolder', () => {
  it('starts with the bundled registry and ignores a broken cache', () => {
    const file = cacheFile();
    writeFileSync(file, '{ not json');
    const holder = new RegistryHolder(file);
    expect(holder.current).toBe(BUNDLED_REGISTRY);
    expect(holder.source).toBe('bundled');
  });

  it('downloads, caches and reloads a newer registry', async () => {
    const file = cacheFile();
    const holder = new RegistryHolder(file);
    const newer = withVersion(BUNDLED_REGISTRY.version + 1);

    expect(await holder.update(serve(newer))).toBe(true);
    expect(holder.source).toBe('downloaded');
    expect(readFileSync(file, 'utf8')).toBe(newer);
    expect(new RegistryHolder(file).current.version).toBe(BUNDLED_REGISTRY.version + 1);
  });

  it('keeps the current registry when the download is not newer or invalid', async () => {
    const holder = new RegistryHolder(cacheFile());
    expect(await holder.update(serve(withVersion(BUNDLED_REGISTRY.version)))).toBe(false);
    await expect(holder.update(serve('{"schemaVersion": 99}'))).rejects.toThrow();
    expect(holder.current).toBe(BUNDLED_REGISTRY);
  });
});
