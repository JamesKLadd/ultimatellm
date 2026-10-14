import type { OutputMode, PlanMode } from '@ultimatellm/shared';
import { create } from 'zustand';

export type View = 'new-chat' | 'chats' | 'projects' | 'library';

interface UiState {
  view: View;
  sidebarOpen: boolean;
  settingsOpen: boolean;
  outputMode: OutputMode;
  planMode: PlanMode;
  setView: (view: View) => void;
  toggleSidebar: () => void;
  setSettingsOpen: (open: boolean) => void;
  setOutputMode: (mode: OutputMode) => void;
  setPlanMode: (mode: PlanMode) => void;
}

/** UI-only state (which view is showing, panel visibility, composer choices). */
export const useUiStore = create<UiState>()((set) => ({
  view: 'new-chat',
  sidebarOpen: true,
  settingsOpen: false,
  outputMode: 'balanced',
  planMode: 'auto',
  setView: (view) => set({ view }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setOutputMode: (outputMode) => set({ outputMode }),
  setPlanMode: (planMode) => set({ planMode }),
}));
