import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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

/** Launches the app. `mock` swaps the real AI providers for offline test models. */
async function launchApp(
  options: { mock?: boolean } = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [APP_DIR, ...(options.mock ? ['--mock-providers'] : [])],
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

    // The About tab shows the app's own name/version (from package.json).
    const { name, version } = await app.evaluate(({ app }) => ({
      name: app.getName(),
      version: app.getVersion(),
    }));
    expect(name).toBe('UltimateLLM');
    await dialog.getByRole('button', { name: 'About' }).click();
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
    await dialog.getByRole('button', { name: 'Appearance' }).click();
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
    await second.page.getByRole('button', { name: 'Appearance' }).click();
    await expect(second.page.getByRole('radio', { name: 'Dark' })).toBeChecked();
  } finally {
    await second.app.close();
  }
});

async function addKey(page: Page, provider: string, apiKey: string, label: string) {
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('button', { name: `Add ${provider} API key` }).click();
  const form = dialog.getByRole('form', { name: `Add ${provider} API key` });
  await form.getByLabel('Label (optional)').fill(label);
  await form.getByLabel('API key', { exact: true }).fill(apiKey);
  await form.getByRole('button', { name: 'Save key' }).click();
}

test('chats through the manager, fails over, and keeps everything after a restart', async () => {
  const first = await launchApp({ mock: true });
  try {
    const { page } = first;
    await expect(page.getByTestId('manager-chip')).toHaveText('No manager yet');
    await page.getByRole('button', { name: 'Add an account' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });

    // A key the provider rejects is not saved.
    await dialog.getByRole('button', { name: 'Add Google API key' }).click();
    const googleForm = dialog.getByRole('form', { name: 'Add Google API key' });
    await googleForm.getByLabel('API key', { exact: true }).fill('invalid-google-key');
    await googleForm.getByRole('button', { name: 'Save key' }).click();
    await expect(googleForm.getByRole('alert')).toContainText("Google didn't accept this key");
    await googleForm.getByRole('button', { name: 'Cancel' }).click();

    // Claude comes before Gemini in the default manager order.
    await addKey(page, 'Google', 'AIza-mock-personal', 'Personal');
    await addKey(page, 'Anthropic', 'ratelimited-work-key', 'Work');
    await expect(dialog.getByTestId('account-row')).toHaveCount(2);
    await expect(page.getByTestId('manager-chip')).toHaveText('Manager: Claude');
    await page.keyboard.press('Escape');

    // The Anthropic key is rate-limited, so the reply fails over to Gemini.
    await page.getByLabel('Message').fill('Hello from the end-to-end test');
    await page.keyboard.press('Enter');
    const reply = page.getByTestId('assistant-message');
    await expect(reply).toContainText('Hello from the end-to-end test');
    await expect(reply).toContainText('Gemini 3.8 Flash');
    await expect(reply).toContainText('Personal');
    await expect(page.getByTestId('manager-chip')).toHaveText('Manager: Gemini');

    // Stopping keeps what was written so far.
    await page.getByLabel('Message').fill('[slow] Tell me a long story');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('live-reply')).toContainText('Mock reply');
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByTestId('assistant-message').last()).toContainText('Stopped');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ mock: true });
  try {
    const { page } = second;
    // Keys were saved (encrypted) and can still be read.
    await expect(page.getByTestId('manager-chip')).toHaveText('Manager: Gemini');
    await page.getByRole('button', { name: 'Hello from the end-to-end test', exact: true }).click();
    await expect(page.getByTestId('user-message')).toHaveCount(2);
    await expect(page.getByTestId('assistant-message')).toHaveCount(2);
  } finally {
    await second.app.close();
  }
});

/** Adds a Claude and a Gemini key from the new-chat screen. */
async function addClaudeAndGemini(page: Page) {
  await page.getByRole('button', { name: 'Add an account' }).click();
  await addKey(page, 'Anthropic', 'sk-ant-mock-key', 'Claude key');
  await addKey(page, 'Google', 'AIza-mock-key', 'Gemini key');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByTestId('account-row')).toHaveCount(2);
  await page.keyboard.press('Escape');
}

test('runs a workflow across models, with files, sources and export', async () => {
  const { app, page } = await launchApp({ mock: true });
  const exportDir = mkdtempSync(join(tmpdir(), 'ultimatellm-export-'));
  try {
    await addClaudeAndGemini(page);
    await page.getByLabel('Message').fill('Create a tennis game');
    await page.keyboard.press('Enter');

    const reply = page.getByTestId('assistant-message');
    await expect(reply).toContainText('Mock wrap-up', { timeout: 20_000 });
    // One status bar per task, each on the model that suits it.
    const rows = reply.getByTestId('step-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Research player stats');
    await expect(rows.nth(0)).toContainText('Gemini 3.8 Flash');
    await expect(rows.nth(1)).toContainText('Claude Sonnet 5.5');
    await expect(reply.locator('[data-testid="step-row"][data-status="done"]')).toHaveCount(3);

    // The files panel opened by itself.
    const files = page.getByTestId('files-panel');
    await expect(files.getByTestId('file-row')).toHaveCount(4);
    await files.getByTestId('file-row').filter({ hasText: 'players.json' }).click();
    await expect(page.getByTestId('file-content')).toContainText('Gemini 3.8 Flash');
    await page.keyboard.press('Escape');

    // Sources: planning, three tasks and the wrap-up, with the cost.
    await reply.getByRole('button', { name: 'Sources' }).click();
    await expect(reply.getByTestId('source-step')).toHaveCount(5);
    await expect(reply.getByTestId('message-cost')).toBeVisible();

    // Export into a folder (the folder picker is stubbed).
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [folder] });
    }, exportDir);
    await files.getByRole('button', { name: 'Export' }).click();
    await expect(files.getByRole('status')).toContainText('Exported 4 files');
    expect(existsSync(join(exportDir, 'Create a tennis game', 'src', 'game.js'))).toBe(true);
  } finally {
    await app.close();
    rmSync(exportDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});

test('lets the user review and edit a plan before it runs', async () => {
  const { app, page } = await launchApp({ mock: true });
  try {
    await addClaudeAndGemini(page);
    await page.getByRole('radio', { name: 'Review' }).click();
    await page.getByLabel('Message').fill('Build a todo app');
    await page.keyboard.press('Enter');

    const review = page.getByTestId('plan-review');
    await expect(review.getByTestId('plan-task')).toHaveCount(3);
    await review.getByLabel('Model for Research player stats').selectOption('claude-haiku-5-5');
    await review.getByRole('button', { name: 'Delete Write the README' }).click();
    await expect(review.getByTestId('plan-task')).toHaveCount(2);
    await review.getByRole('button', { name: 'Run' }).click();

    const reply = page.getByTestId('assistant-message');
    await expect(reply).toContainText('Mock wrap-up', { timeout: 20_000 });
    await expect(reply.getByTestId('step-row')).toHaveCount(2);
    await expect(reply.getByTestId('step-row').first()).toContainText('Claude Haiku 5.5');

    // An @mention picks the model; Review mode still shows the plan first.
    await page.getByLabel('Message').fill('@gemini what is 2 + 2?');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('plan-review')).toContainText('Review the answer plan');
    await page.getByTestId('plan-review').getByRole('button', { name: 'Run' }).click();
    const answer = page.getByTestId('assistant-message').last();
    await expect(answer).toContainText('You asked: “what is 2 + 2?”');
    await expect(answer).toContainText('Gemini 3.8 Flash');
  } finally {
    await app.close();
  }
});
