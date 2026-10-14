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
            ui.newChat();
            break;
          case 'open-settings':
            ui.openSettings();
            break;
          case 'toggle-sidebar':
            ui.toggleSidebar();
            break;
        }
      }),
    [],
  );
}
