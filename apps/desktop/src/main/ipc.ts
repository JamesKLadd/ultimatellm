import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { AccountService } from '@ultimatellm/accounts';
import type { ChatEngine } from '@ultimatellm/core';
import type { SettingsStore } from '@ultimatellm/db';
import {
  InvokeChannel,
  invokeContract,
  rankManagers,
  resolveManagerPriority,
  type DataScope,
  type InvokeChannelName,
  type InvokeOutput,
  type InvokeParsedInput,
  type ManagerStatus,
  type ThemePreference,
} from '@ultimatellm/shared';
import { exportFiles } from './export-files';
import type { ModelsService } from './models-service';
import { isTrustedOrigin } from './security/policy';

type Handler<C extends InvokeChannelName> = (
  input: InvokeParsedInput<C>,
  event: IpcMainInvokeEvent,
) => InvokeOutput<C> | Promise<InvokeOutput<C>>;

/**
 * Returns a typed `ipcMain.handle`. Each call is rejected unless it comes from
 * the top-level frame of a trusted origin, and its input must match the
 * channel's schema in `invokeContract`.
 */
function createHandle(trustedOrigins: readonly string[]) {
  return function handle<C extends InvokeChannelName>(channel: C, handler: Handler<C>): void {
    ipcMain.handle(channel, async (event, rawInput: unknown) => {
      const frame = event.senderFrame;
      if (!frame || frame.parent !== null || !isTrustedOrigin(frame.url, trustedOrigins)) {
        throw new Error(`Blocked "${channel}" call from an untrusted sender`);
      }
      const input = invokeContract[channel].input.parse(rawInput) as InvokeParsedInput<C>;
      return handler(input, event);
    });
  };
}

export interface IpcDependencies {
  trustedOrigins: readonly string[];
  settings: SettingsStore;
  accounts: AccountService;
  engine: ChatEngine;
  models: ModelsService;
  mockProviders: boolean;
  applyTheme: (theme: ThemePreference) => void;
  /** Tells the UI that data changed so it can refresh. */
  changed: (scope: DataScope) => void;
}

export function registerIpcHandlers(deps: IpcDependencies) {
  const { settings, accounts, engine, models, changed } = deps;
  const handle = createHandle(deps.trustedOrigins);

  handle(InvokeChannel.appGetInfo, () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
    mockProviders: deps.mockProviders,
  }));

  handle(InvokeChannel.settingsGetTheme, () => settings.get('appearance.theme'));
  handle(InvokeChannel.settingsSetTheme, (theme) => {
    settings.set('appearance.theme', theme);
    deps.applyTheme(theme);
    return undefined;
  });

  // Accounts
  handle(InvokeChannel.accountsList, () => accounts.list());
  handle(InvokeChannel.accountsAdd, async (input) => {
    const result = await accounts.addApiKey(input);
    if (result.ok) changed('accounts');
    return result;
  });
  handle(InvokeChannel.accountsRemove, ({ id }) => {
    accounts.remove(id);
    changed('accounts');
    return undefined;
  });
  handle(InvokeChannel.accountsReorder, ({ provider, ids }) => {
    accounts.reorder(provider, ids);
    changed('accounts');
    return undefined;
  });
  handle(InvokeChannel.accountsRecheck, async ({ id }) => {
    const account = await accounts.recheck(id);
    changed('accounts');
    return account;
  });

  // Manager
  handle(InvokeChannel.managerStatus, (): ManagerStatus => {
    const saved = settings.get('orchestration.managerPriority');
    const usable = accounts.usableProviders();
    return {
      manager: rankManagers(saved, usable)[0] ?? null,
      order: resolveManagerPriority(saved),
      usable,
      configured: [...new Set(accounts.list().map((account) => account.provider))],
    };
  });
  handle(InvokeChannel.managerSetOrder, (order) => {
    settings.set('orchestration.managerPriority', order);
    changed('accounts');
    return undefined;
  });

  // Chats
  handle(InvokeChannel.chatsList, () => engine.listChats());
  handle(InvokeChannel.chatsGet, ({ id }) => engine.getChat(id));
  handle(InvokeChannel.chatsSend, (input) => engine.send(input));
  handle(InvokeChannel.chatsStop, ({ runId }) => {
    engine.stop(runId);
    return undefined;
  });
  handle(InvokeChannel.chatsRemove, ({ id }) => {
    engine.removeChat(id);
    return undefined;
  });
  handle(InvokeChannel.chatsApprovePlan, (input) => {
    engine.approvePlan(input);
    return undefined;
  });

  // Workspace
  handle(InvokeChannel.workspaceList, ({ id }) => engine.listFiles(id));
  handle(InvokeChannel.workspaceRead, ({ chatId, path }) => engine.readFile(chatId, path));
  handle(InvokeChannel.workspaceExport, async ({ id }, event) => {
    const files = engine.filesForExport(id);
    if (files.length === 0) return null;
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Export files',
      buttonLabel: 'Export here',
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
    };
    const choice = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const parent = choice.filePaths[0];
    if (choice.canceled || !parent) return null;
    const title = engine.getChat(id)?.chat.title ?? 'UltimateLLM files';
    return { folder: exportFiles(parent, title, files), count: files.length };
  });

  // Models
  handle(InvokeChannel.modelsInfo, () => models.info());
  handle(InvokeChannel.modelsCheckForUpdate, () => models.checkForUpdate());
  handle(InvokeChannel.modelsSetAutoUpdate, (enabled) => {
    models.setAutoUpdate(enabled);
    return undefined;
  });
}
