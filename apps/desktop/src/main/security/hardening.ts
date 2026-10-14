import { app, shell, type Session } from 'electron';
import { isSafeExternalUrl, isTrustedOrigin } from './policy';

/** Browser permissions the UI may use. Everything else (camera, location, ...) is denied. */
const ALLOWED_PERMISSIONS = new Set<string>(['clipboard-sanitized-write']);

export function hardenSession(session: Session, trustedOrigins: readonly string[]): void {
  session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(
      ALLOWED_PERMISSIONS.has(permission) && isTrustedOrigin(details.requestingUrl, trustedOrigins),
    );
  });
  session.setPermissionCheckHandler(
    (_contents, permission, requestingOrigin) =>
      ALLOWED_PERMISSIONS.has(permission) && isTrustedOrigin(requestingOrigin, trustedOrigins),
  );
}

/**
 * Adds the CSP header to pages from the Vite dev server. In production the
 * app:// protocol handler sets it instead.
 */
export function applyDevServerCsp(session: Session, devServerOrigin: string, csp: string): void {
  session.webRequest.onHeadersReceived({ urls: [`${devServerOrigin}/*`] }, (details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] },
    });
  });
}

/**
 * Locks down every window and frame the app creates: no navigating away from
 * the app, no new windows, no <webview>. Safe links open in the default browser.
 */
export function hardenWebContents(trustedOrigins: readonly string[]): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isTrustedOrigin(url, trustedOrigins)) event.preventDefault();
    });
    contents.on('will-redirect', (event, url) => {
      if (!isTrustedOrigin(url, trustedOrigins)) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalUrl(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
  });
}
