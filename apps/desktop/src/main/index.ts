import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, Menu, nativeTheme, net, session } from 'electron';
import { AccountService } from '@ultimatellm/accounts';
import { ChatEngine } from '@ultimatellm/core';
import {
  createAccountStore,
  createChatStore,
  createSettingsStore,
  createWorkspaceStore,
} from '@ultimatellm/db';
import { createProviderAdapters } from '@ultimatellm/providers';
import {
  EventChannel,
  type AppCommand,
  type DataScope,
  type ThemePreference,
} from '@ultimatellm/shared';
import { openAppDatabase } from './database';
import { registerIpcHandlers } from './ipc';
import { RegistryHolder } from './model-registry';
import { ModelsService } from './models-service';
import { buildAppMenu } from './menu';
import { registerAppScheme, serveAppProtocol } from './protocol';
import { batchTextEvents } from './run-events';
import { createSafeStorageBox } from './secret-box';
import { applyDevServerCsp, hardenSession, hardenWebContents } from './security/hardening';
import { APP_ORIGIN, buildContentSecurityPolicy } from './security/policy';
import { runSmokeTest } from './smoke-test';
import { createMainWindow } from './window';

const APP_USER_MODEL_ID = 'com.ultimatellm.desktop';
const isSmokeTest = process.argv.includes('--smoke-test');
/**
 * Offline mock providers instead of the real APIs, for development and tests
 * (`pnpm dev:mock`). Never available in an installed app.
 */
const mockProviders =
  !app.isPackaged &&
  (process.argv.includes('--mock-providers') || process.env.ULL_MOCK_PROVIDERS === '1');
/** Set by `electron-vite dev`. Ignored in packaged builds. */
const devServerUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL || undefined;

// --- Before the app is ready ---------------------------------------------------

configureUserDataPath();
registerAppScheme();
// Sandbox every renderer process. An explicit `--no-sandbox` (only needed when
// running as root, e.g. in some Linux containers) is respected instead.
if (!app.commandLine.hasSwitch('no-sandbox')) app.enableSandbox();
if (process.platform === 'win32') {
  app.setAppUserModelId(app.isPackaged ? APP_USER_MODEL_ID : process.execPath);
}

if (!app.requestSingleInstanceLock()) {
  // Another copy is already running; it gets focused via 'second-instance'.
  app.quit();
} else {
  app
    .whenReady()
    .then(start)
    .catch((error: unknown) => {
      console.error(error);
      dialog.showErrorBox(
        'UltimateLLM could not start',
        error instanceof Error ? error.message : String(error),
      );
      app.exit(1);
    });
}

function configureUserDataPath(): void {
  if (isSmokeTest) {
    // Smoke tests must never touch real user data.
    app.setPath('userData', mkdtempSync(join(tmpdir(), 'ultimatellm-smoke-')));
  } else if (!app.isPackaged) {
    // Keep development data separate from an installed copy of the app.
    app.setPath('userData', process.env.ULL_USER_DATA_DIR || `${app.getPath('userData')}-dev`);
  }
}

// --- After the app is ready ----------------------------------------------------

function start(): void {
  const database = openAppDatabase();
  const settings = createSettingsStore(database.db);

  // nativeTheme drives `prefers-color-scheme` in the UI and the native window chrome.
  const applyTheme = (theme: ThemePreference) => {
    nativeTheme.themeSource = theme;
  };
  applyTheme(settings.get('appearance.theme'));

  const devOrigin = devServerUrl ? new URL(devServerUrl).origin : undefined;
  const trustedOrigins = devOrigin ? [APP_ORIGIN, devOrigin] : [APP_ORIGIN];
  hardenSession(session.defaultSession, trustedOrigins);
  hardenWebContents(trustedOrigins);
  if (devOrigin) {
    applyDevServerCsp(session.defaultSession, devOrigin, buildContentSecurityPolicy('development'));
  } else {
    serveAppProtocol(join(__dirname, '../renderer'), buildContentSecurityPolicy('production'));
  }

  let mainWindow: BrowserWindow | null = null;
  const sendToWindow = (channel: string, payload: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  };
  const changed = (scope: DataScope) => sendToWindow(EventChannel.dataChanged, scope);

  const registry = new RegistryHolder(join(app.getPath('userData'), 'model-registry.json'));
  const adapters = createProviderAdapters({ mock: mockProviders });
  const accounts = new AccountService({
    store: createAccountStore(database.db),
    adapters,
    secrets: createSafeStorageBox(),
  });
  const engine = new ChatEngine({
    accounts,
    adapters,
    chats: createChatStore(database.db),
    workspace: createWorkspaceStore(database.db),
    registry: () => registry.current,
    managerOrder: () => settings.get('orchestration.managerPriority'),
    emit: batchTextEvents((event) => sendToWindow(EventChannel.chatRun, event)),
    changed,
  });
  engine.recoverInterrupted();
  const models = new ModelsService(registry, settings, engine, changed, (input, init) =>
    net.fetch(input instanceof URL ? input.href : input, init),
  );
  // Tests and mock mode never go online.
  if (!mockProviders && !isSmokeTest) models.start();

  registerIpcHandlers({
    trustedOrigins,
    settings,
    accounts,
    engine,
    models,
    mockProviders,
    applyTheme,
    changed,
  });

  // On quit, stop replies and give them a moment to save before closing the database.
  let closing = false;
  app.on('will-quit', (event) => {
    if (closing) return;
    closing = true;
    models.stop();
    if (!engine.hasRuns()) return database.close();
    event.preventDefault();
    engine.stopAll();
    void engine.waitForAll(2000).finally(() => {
      database.close();
      app.quit();
    });
  });

  const openMainWindow = () => {
    const window = createMainWindow(devServerUrl ?? `${APP_ORIGIN}/index.html`);
    window.on('closed', () => {
      if (mainWindow === window) mainWindow = null;
    });
    if (isSmokeTest) runSmokeTest(window);
    mainWindow = window;
  };

  const sendCommand = (command: AppCommand) => {
    if (!mainWindow) openMainWindow();
    mainWindow?.webContents.send(EventChannel.appCommand, command);
  };
  Menu.setApplicationMenu(buildAppMenu(sendCommand));

  openMainWindow();

  app.on('second-instance', () => {
    if (!mainWindow) return openMainWindow();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openMainWindow();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
