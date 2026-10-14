import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { EventChannel, InvokeChannel } from '@ultimatellm/shared/ipc-channels';
import type {
  AppCommand,
  InvokeChannelName,
  InvokeInput,
  InvokeOutput,
  UllApi,
} from '@ultimatellm/shared';

// Runs in a sandbox with no Node.js access. It only forwards calls to the main
// process (which validates them) and exposes a small, typed API as `window.ull`.

function invoke<C extends InvokeChannelName>(
  channel: C,
  ...args: InvokeInput<C> extends undefined ? [] : [InvokeInput<C>]
): Promise<InvokeOutput<C>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<InvokeOutput<C>>;
}

const api: UllApi = {
  platform: process.platform,
  app: {
    getInfo: () => invoke(InvokeChannel.appGetInfo),
    onCommand: (listener) => {
      const forward = (_event: IpcRendererEvent, command: AppCommand) => listener(command);
      ipcRenderer.on(EventChannel.appCommand, forward);
      return () => {
        ipcRenderer.removeListener(EventChannel.appCommand, forward);
      };
    },
  },
  settings: {
    getTheme: () => invoke(InvokeChannel.settingsGetTheme),
    setTheme: (theme) => invoke(InvokeChannel.settingsSetTheme, theme),
  },
};

contextBridge.exposeInMainWorld('ull', api);
