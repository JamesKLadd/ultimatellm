import { useEffect } from 'react';
import { useUiStore } from '../state/ui-store';

/** Handles commands sent by the native app menu and its keyboard shortcuts. */
export function useAppCommands(): void {
  useEffect(
    () =>
      window.ull.app.onCommand((command) => {
        const ui = useUiStore.getState();
        switch (command) {
          case 'new-chat':
            ui.setView('new-chat');
            break;
          case 'open-settings':
            ui.setSettingsOpen(true);
            break;
          case 'toggle-sidebar':
            ui.toggleSidebar();
            break;
        }
      }),
    [],
  );
}
