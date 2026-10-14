import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_ORIGIN,
  buildContentSecurityPolicy,
  isSafeExternalUrl,
  isTrustedOrigin,
  resolveAppFile,
} from './policy';

describe('resolveAppFile', () => {
  const root = resolve('/app/out/renderer');

  it('serves index.html for the root path', () => {
    expect(resolveAppFile(root, `${APP_ORIGIN}/`)).toBe(join(root, 'index.html'));
    expect(resolveAppFile(root, APP_ORIGIN)).toBe(join(root, 'index.html'));
  });

  it('maps asset paths into the renderer folder', () => {
    expect(resolveAppFile(root, `${APP_ORIGIN}/assets/index-abc.js?v=1#x`)).toBe(
      join(root, 'assets', 'index-abc.js'),
    );
  });

  it('never resolves outside the renderer folder', () => {
    const attempts = [
      `${APP_ORIGIN}/../secret.txt`,
      `${APP_ORIGIN}/%2e%2e/%2e%2e/etc/passwd`,
      `${APP_ORIGIN}/assets/..%2f..%2f..%2fsecret`,
      `${APP_ORIGIN}/..%5c..%5csecret`,
    ];
    for (const url of attempts) {
      const file = resolveAppFile(root, url);
      if (file !== null) expect(file.startsWith(root)).toBe(true);
    }
  });

  it('rejects other hosts, schemes and malformed input', () => {
    expect(resolveAppFile(root, 'app://evil/index.html')).toBeNull();
    expect(resolveAppFile(root, 'file:///etc/passwd')).toBeNull();
    expect(resolveAppFile(root, `${APP_ORIGIN}/%E0%A4%A`)).toBeNull();
    expect(resolveAppFile(root, `${APP_ORIGIN}/a%00b`)).toBeNull();
    expect(resolveAppFile(root, 'not a url')).toBeNull();
  });
});

describe('isTrustedOrigin', () => {
  const trusted = [APP_ORIGIN, 'http://localhost:5173'];

  it('accepts the app and dev-server origins', () => {
    expect(isTrustedOrigin('app://ultimatellm/index.html', trusted)).toBe(true);
    expect(isTrustedOrigin('http://localhost:5173/src/main.tsx', trusted)).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isTrustedOrigin('app://other/index.html', trusted)).toBe(false);
    expect(isTrustedOrigin('http://localhost:5174/', trusted)).toBe(false);
    expect(isTrustedOrigin('https://example.com/', trusted)).toBe(false);
    expect(isTrustedOrigin('', trusted)).toBe(false);
  });
});

describe('isSafeExternalUrl', () => {
  it('allows https and mailto links only', () => {
    expect(isSafeExternalUrl('https://x.ai/')).toBe(true);
    expect(isSafeExternalUrl('mailto:someone@example.com')).toBe(true);
    expect(isSafeExternalUrl('http://example.com/')).toBe(false);
    expect(isSafeExternalUrl('file:///C:/Windows/system32/calc.exe')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('not a url')).toBe(false);
  });
});

describe('buildContentSecurityPolicy', () => {
  it('is strict in production', () => {
    const csp = buildContentSecurityPolicy('production');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain("connect-src 'self';");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('only relaxes what the dev server needs in development', () => {
    const csp = buildContentSecurityPolicy('development');
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain('ws://localhost:*');
    expect(csp).not.toContain('unsafe-eval');
  });
});
