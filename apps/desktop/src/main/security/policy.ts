import { isAbsolute, join, normalize, relative } from 'node:path';

// Pure security rules. Kept free of Electron imports so they can be unit tested.

/** The production UI is served from app://ultimatellm/ rather than file://. */
export const APP_SCHEME = 'app';
export const APP_HOST = 'ultimatellm';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/**
 * Content-Security-Policy for the UI. The renderer only talks to the main
 * process over IPC, so it gets no network access of its own.
 */
export function buildContentSecurityPolicy(mode: 'production' | 'development'): string {
  const dev = mode === 'development';
  const directives: Record<string, string[]> = {
    'default-src': ["'none'"],
    // In development, Vite's React Fast Refresh needs a small inline script.
    'script-src': dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    // Radix UI injects small <style> tags (e.g. scroll locking in dialogs).
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    // In development, Vite's hot reload uses a websocket to the dev server.
    'connect-src': dev ? ["'self'", 'ws://localhost:*', 'http://localhost:*'] : ["'self'"],
    'media-src': ["'self'", 'blob:'],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
    'frame-ancestors': ["'none'"],
    'frame-src': ["'none'"],
  };
  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
}

/**
 * `scheme://host[:port]` of a URL, or null if it can't be parsed. (`URL.origin`
 * is "null" for custom schemes like app://, so it's built by hand.)
 */
function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

export function isTrustedOrigin(url: string, trustedOrigins: readonly string[]): boolean {
  const origin = originOf(url);
  return origin !== null && trustedOrigins.includes(origin);
}

/** Links that may be opened in the user's default browser or mail app. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'mailto:';
  } catch {
    return false;
  }
}

/**
 * Maps an app://ultimatellm/… request to a file inside `rootDir`.
 * Returns null for other hosts/schemes and for paths that escape `rootDir`.
 */
export function resolveAppFile(rootDir: string, requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) return null;

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;
  if (pathname === '' || pathname === '/') pathname = '/index.html';

  const filePath = join(rootDir, normalize(pathname));
  const relativePath = relative(rootDir, filePath);
  if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return null;
  }
  return filePath;
}
