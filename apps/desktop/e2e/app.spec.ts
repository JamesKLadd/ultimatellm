import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

// Launches the built app (run `pnpm build` first) the same way users run it,
// but with its own throwaway data folder.

// Launching the app folder (not the bundle file) makes Electron read package.json
// for the app's name and version, like the packaged app.
const APP_DIR = join(__dirname, '..');
// Chromium can't use its sandbox when running as root (e.g. in Linux containers).
const RUNNING_AS_ROOT = process.platform === 'linux' && process.getuid?.() === 0;

let userDataDir: string;

test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'ultimatellm-e2e-'));
});

test.afterEach(() => {
  // Windows can hold file locks for a moment after the app exits.
  rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [APP_DIR],
    env: { ...process.env, ULL_USER_DATA_DIR: userDataDir, ELECTRON_RENDERER_URL: '' },
    // Playwright turns these off by default; test the app as users run it.
    chromiumSandbox: !RUNNING_AS_ROOT,
    colorScheme: null,
  });
  const page = await app.firstWindow();
  await expect(page.getByTestId('app-shell')).toBeVisible();
  return { app, page };
}

function prefersDark(page: Page): Promise<boolean> {
  return page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
}

test('runs the UI in a locked-down renderer', async () => {
  const { app, page } = await launchApp();
  try {
    await expect(page).toHaveTitle('UltimateLLM');
    expect(page.url()).toBe('app://ultimatellm/index.html');

    // Renderer processes run in the OS sandbox. (Electron only reports this on
    // macOS and Windows.)
    const rendererSandboxing = await app.evaluate(({ app }) =>
      app
        .getAppMetrics()
        .filter((metric) => metric.type === 'Tab')
        .map((metric) => metric.sandboxed),
    );
    expect(rendererSandboxing.length).toBeGreaterThan(0);
    if (process.platform !== 'linux') expect(rendererSandboxing).not.toContain(false);

    // No Node.js inside the page, only the preload's small API.
    const globals = await page.evaluate(() => {
      const scope = window as unknown as Record<string, unknown>;
      return {
        require: typeof scope.require,
        process: typeof scope.process,
        ull: typeof window.ull,
      };
    });
    expect(globals).toEqual({ require: 'undefined', process: 'undefined', ull: 'object' });

    // The Content-Security-Policy blocks eval. (It runs on a later task because
    // code evaluated directly by the test runner is exempt from that check.)
    const evalBlocked = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => {
            try {
              (0, eval)('1');
              resolve(false);
            } catch {
              resolve(true);
            }
          });
        }),
    );
    expect(evalBlocked).toBe(true);

    // ...and inline scripts.
    const inlineScriptRan = await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'document.body.dataset.inlineScriptRan = "yes"';
      document.head.append(script);
      return document.body.dataset.inlineScriptRan === 'yes';
    });
    expect(inlineScriptRan).toBe(false);

    // New windows are refused.
    expect(await page.evaluate(() => window.open('http://example.com') === null)).toBe(true);

    // The main process validates IPC input.
    const invalidCall = await page.evaluate(() =>
      window.ull.settings.setTheme('neon' as never).then(
        () => 'accepted',
        () => 'rejected',
      ),
    );
    expect(invalidCall).toBe('rejected');
  } finally {
    await app.close();
  }
});

test('navigates the shell and responds to menu commands', async () => {
  const { app, page } = await launchApp();
  try {
    await expect(page.getByRole('heading', { name: 'What should we work on?' })).toBeVisible();

    await page.getByRole('button', { name: 'Library' }).click();
    await expect(page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible();

    const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
    await page.getByRole('button', { name: 'Hide sidebar' }).click();
    await expect(sidebar).toBeHidden();
    await page.getByRole('button', { name: 'Show sidebar' }).click();
    await expect(sidebar).toBeVisible();

    // What the app menu's "Settings…" item (Ctrl/Cmd+,) sends.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('app:command', 'open-settings');
    });
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();

    // The About section shows the app's own name/version (from package.json).
    const { name, version } = await app.evaluate(({ app }) => ({
      name: app.getName(),
      version: app.getVersion(),
    }));
    expect(name).toBe('UltimateLLM');
    await expect(dialog.getByText(version, { exact: true })).toBeVisible();
  } finally {
    await app.close();
  }
});

test('saves the theme in the local database across restarts', async () => {
  const first = await launchApp();
  try {
    await first.page.getByRole('button', { name: 'Settings' }).click();
    const dialog = first.page.getByRole('dialog', { name: 'Settings' });
    await dialog.getByRole('radio', { name: 'Dark' }).click();
    await expect.poll(() => prefersDark(first.page)).toBe(true);
  } finally {
    await first.app.close();
  }

  const second = await launchApp();
  try {
    expect(await prefersDark(second.page)).toBe(true);
    expect(await second.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');

    await second.page.getByRole('button', { name: 'Settings' }).click();
    await expect(second.page.getByRole('radio', { name: 'Dark' })).toBeChecked();
  } finally {
    await second.app.close();
  }
});
