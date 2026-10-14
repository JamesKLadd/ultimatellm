import type { OutputMode, PlanMode } from '@ultimatellm/shared';
import { create } from 'zustand';

export type View = 'new-chat' | 'chat' | 'chats' | 'projects' | 'library';
export type SettingsTab = 'accounts' | 'manager' | 'appearance' | 'about';

interface UiState {
  view: View;
  /** The chat shown when `view` is 'chat'. */
  activeChatId: string | null;
  sidebarOpen: boolean;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  outputMode: OutputMode;
  planMode: PlanMode;
  setView: (view: View) => void;
  openChat: (chatId: string) => void;
  newChat: () => void;
  toggleSidebar: () => void;
  openSettings: (tab?: SettingsTab) => void;
  setSettingsOpen: (open: boolean) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setOutputMode: (mode: OutputMode) => void;
  setPlanMode: (mode: PlanMode) => void;
}

/** UI-only state (which view is showing, panel visibility, composer choices). */
export const useUiStore = create<UiState>()((set) => ({
  view: 'new-chat',
  activeChatId: null,
  sidebarOpen: true,
  settingsOpen: false,
  settingsTab: 'accounts',
  outputMode: 'balanced',
  planMode: 'auto',
  setView: (view) => set({ view }),
  openChat: (activeChatId) => set({ view: 'chat', activeChatId }),
  newChat: () => set({ view: 'new-chat', activeChatId: null }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  openSettings: (tab) =>
    set((state) => ({ settingsOpen: true, settingsTab: tab ?? state.settingsTab })),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  setOutputMode: (outputMode) => set({ outputMode }),
  setPlanMode: (planMode) => set({ planMode }),
}));
