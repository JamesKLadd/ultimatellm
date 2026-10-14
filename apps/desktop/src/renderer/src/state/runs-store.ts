import type { ChatRunEvent, ProviderId } from '@ultimatellm/shared';
import { create } from 'zustand';

/** A reply that is still being written. Saved messages come from the chat query instead. */
export interface ActiveRun {
  runId: string;
  chatId: string;
  /** Text streamed so far by the current model. */
  text: string;
  provider: ProviderId | null;
  modelName: string | null;
  accountLabel: string | null;
  /** Why the previous model or account was skipped, if it was. */
  notice: string | null;
  finished: boolean;
}

interface RunsState {
  byChat: Record<string, ActiveRun>;
  /** Registers a run as soon as `send` returns (its events may arrive first). */
  track: (chatId: string, runId: string) => void;
  apply: (event: ChatRunEvent) => void;
  clear: (chatId: string, runId: string) => void;
}

const emptyRun = (chatId: string, runId: string): ActiveRun => ({
  runId,
  chatId,
  text: '',
  provider: null,
  modelName: null,
  accountLabel: null,
  notice: null,
  finished: false,
});

export const useRunsStore = create<RunsState>()((set) => ({
  byChat: {},

  track: (chatId, runId) =>
    set((state) =>
      state.byChat[chatId]?.runId === runId
        ? state
        : { byChat: { ...state.byChat, [chatId]: emptyRun(chatId, runId) } },
    ),

  apply: (event) =>
    set((state) => {
      const current =
        state.byChat[event.chatId]?.runId === event.runId
          ? state.byChat[event.chatId]!
          : emptyRun(event.chatId, event.runId);
      let next: ActiveRun;
      switch (event.type) {
        case 'started':
          // A new attempt (first try or failover) starts from scratch.
          next = {
            ...current,
            text: '',
            provider: event.provider,
            modelName: event.modelName,
            accountLabel: event.accountLabel,
          };
          break;
        case 'text':
          next = { ...current, text: current.text + event.delta };
          break;
        case 'retrying':
          next = { ...current, notice: event.reason };
          break;
        case 'finished':
          next = { ...current, finished: true };
          break;
      }
      return { byChat: { ...state.byChat, [event.chatId]: next } };
    }),

  clear: (chatId, runId) =>
    set((state) => {
      if (state.byChat[chatId]?.runId !== runId) return state;
      const { [chatId]: _removed, ...rest } = state.byChat;
      return { byChat: rest };
    }),
}));
