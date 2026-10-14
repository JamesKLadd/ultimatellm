import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import { APP_SCHEME, resolveAppFile } from './security/policy';

/** Registers app:// as a secure, standard scheme. Must run before the app is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true },
    },
  ]);
}

/** Serves the built UI from `rendererDir` at app://ultimatellm/ with security headers. */
export function serveAppProtocol(rendererDir: string, csp: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const filePath = resolveAppFile(rendererDir, request.url);
    if (!filePath) return new Response('Not found', { status: 404 });

    let file: Response;
    try {
      file = await net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }

    const headers = new Headers(file.headers);
    headers.set('Content-Security-Policy', csp);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(file.body, { status: file.status, headers });
  });
}
