import { app, type BrowserWindow } from 'electron';

const TIMEOUT_MS = 30_000;
const POLL_MS = 250;

/**
 * `--smoke-test` mode, used by CI on packaged builds: start the app normally,
 * wait until the UI has rendered and the preload API is present, then exit
 * with code 0. Exits with code 1 on any failure or after a timeout.
 */
export function runSmokeTest(window: BrowserWindow): void {
  const { webContents } = window;
  let finished = false;

  const finish = (code: 0 | 1, message: string) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    (code === 0 ? console.log : console.error)(`[smoke-test] ${message}`);
    app.exit(code);
  };

  const timeout = setTimeout(() => finish(1, 'FAILED: timed out waiting for the UI'), TIMEOUT_MS);

  webContents.on('did-fail-load', (_event, code, description, url) => {
    finish(1, `FAILED: could not load ${url} (${code} ${description})`);
  });
  webContents.on('render-process-gone', (_event, details) => {
    finish(1, `FAILED: renderer process exited (${details.reason})`);
  });

  const poll = async () => {
    if (finished) return;
    try {
      const ready = (await webContents.executeJavaScript(
        `Boolean(document.querySelector('[data-testid="app-shell"]')) && typeof window.ull === 'object'`,
      )) as boolean;
      if (ready) return finish(0, 'OK: UI rendered and preload API available');
    } catch (error) {
      return finish(1, `FAILED: ${String(error)}`);
    }
    setTimeout(() => void poll(), POLL_MS);
  };
  webContents.once('did-finish-load', () => void poll());
}
