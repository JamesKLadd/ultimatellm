import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { SettingsStore } from '@ultimatellm/db';
import {
  InvokeChannel,
  invokeContract,
  type InvokeChannelName,
  type InvokeOutput,
  type InvokeParsedInput,
  type ThemePreference,
} from '@ultimatellm/shared';
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
  applyTheme: (theme: ThemePreference) => void;
}

export function registerIpcHandlers({ trustedOrigins, settings, applyTheme }: IpcDependencies) {
  const handle = createHandle(trustedOrigins);

  handle(InvokeChannel.appGetInfo, () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
  }));

  handle(InvokeChannel.settingsGetTheme, () => settings.get('appearance.theme'));

  handle(InvokeChannel.settingsSetTheme, (theme) => {
    settings.set('appearance.theme', theme);
    applyTheme(theme);
    return undefined;
  });
}
