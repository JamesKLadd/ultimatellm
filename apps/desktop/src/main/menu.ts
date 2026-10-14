import { app, Menu, type MenuItemConstructorOptions } from 'electron';
import type { AppCommand } from '@ultimatellm/shared';

/**
 * The native app menu. It also provides the keyboard shortcuts, including the
 * Edit menu that macOS needs for copy/paste to work in text fields.
 */
export function buildAppMenu(sendCommand: (command: AppCommand) => void): Menu {
  const isMac = process.platform === 'darwin';
  const settingsItem: MenuItemConstructorOptions = {
    label: 'Settings…',
    accelerator: 'CmdOrCtrl+,',
    click: () => sendCommand('open-settings'),
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              settingsItem,
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Chat', accelerator: 'CmdOrCtrl+N', click: () => sendCommand('new-chat') },
        { type: 'separator' },
        ...(isMac ? [] : [settingsItem, { type: 'separator' } as const]),
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => sendCommand('toggle-sidebar'),
        },
        { type: 'separator' },
        ...(app.isPackaged
          ? []
          : ([{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }] as const)),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];

  return Menu.buildFromTemplate(template);
}
