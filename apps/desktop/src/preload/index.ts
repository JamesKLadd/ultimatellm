import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { EventChannel, InvokeChannel } from '@ultimatellm/shared/ipc-channels';
import type {
  EventChannelName,
  EventPayload,
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

/** Subscribes to a main → renderer event. Returns an unsubscribe function. */
function subscribe<C extends EventChannelName>(
  channel: C,
  listener: (payload: EventPayload<C>) => void,
): () => void {
  const forward = (_event: IpcRendererEvent, payload: EventPayload<C>) => listener(payload);
  ipcRenderer.on(channel, forward);
  return () => {
    ipcRenderer.removeListener(channel, forward);
  };
}

const api: UllApi = {
  platform: process.platform,
  app: {
    getInfo: () => invoke(InvokeChannel.appGetInfo),
    onCommand: (listener) => subscribe(EventChannel.appCommand, listener),
    onDataChanged: (listener) => subscribe(EventChannel.dataChanged, listener),
  },
  settings: {
    getTheme: () => invoke(InvokeChannel.settingsGetTheme),
    setTheme: (theme) => invoke(InvokeChannel.settingsSetTheme, theme),
  },
  accounts: {
    list: () => invoke(InvokeChannel.accountsList),
    add: (input) => invoke(InvokeChannel.accountsAdd, input),
    remove: (id) => invoke(InvokeChannel.accountsRemove, { id }),
    reorder: (provider, ids) => invoke(InvokeChannel.accountsReorder, { provider, ids }),
    recheck: (id) => invoke(InvokeChannel.accountsRecheck, { id }),
  },
  manager: {
    status: () => invoke(InvokeChannel.managerStatus),
    setOrder: (order) => invoke(InvokeChannel.managerSetOrder, order),
  },
  chats: {
    list: () => invoke(InvokeChannel.chatsList),
    get: (id) => invoke(InvokeChannel.chatsGet, { id }),
    send: (input) => invoke(InvokeChannel.chatsSend, input),
    stop: (runId) => invoke(InvokeChannel.chatsStop, { runId }),
    remove: (id) => invoke(InvokeChannel.chatsRemove, { id }),
    onRunEvent: (listener) => subscribe(EventChannel.chatRun, listener),
  },
};

contextBridge.exposeInMainWorld('ull', api);
