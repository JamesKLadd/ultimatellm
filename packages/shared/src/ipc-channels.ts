/**
 * IPC channel names. This file has no runtime dependencies so the sandboxed
 * preload script can import it without bundling Zod.
 */

/** Renderer → main request/response calls (`ipcRenderer.invoke`). */
export const InvokeChannel = {
  appGetInfo: 'app:get-info',
  settingsGetTheme: 'settings:get-theme',
  settingsSetTheme: 'settings:set-theme',
  accountsList: 'accounts:list',
  accountsAdd: 'accounts:add',
  accountsRemove: 'accounts:remove',
  accountsReorder: 'accounts:reorder',
  accountsRecheck: 'accounts:recheck',
  managerStatus: 'manager:status',
  managerSetOrder: 'manager:set-order',
  chatsList: 'chats:list',
  chatsGet: 'chats:get',
  chatsSend: 'chats:send',
  chatsStop: 'chats:stop',
  chatsRemove: 'chats:remove',
} as const;

/** Main → renderer events (`webContents.send`). */
export const EventChannel = {
  appCommand: 'app:command',
  chatRun: 'chat:run',
  dataChanged: 'data:changed',
} as const;
