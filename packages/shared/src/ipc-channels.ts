/**
 * IPC channel names. This file has no runtime dependencies so the sandboxed
 * preload script can import it without bundling Zod.
 */

/** Renderer → main request/response calls (`ipcRenderer.invoke`). */
export const InvokeChannel = {
  appGetInfo: 'app:get-info',
  settingsGetTheme: 'settings:get-theme',
  settingsSetTheme: 'settings:set-theme',
} as const;

/** Main → renderer events (`webContents.send`). */
export const EventChannel = {
  appCommand: 'app:command',
} as const;
