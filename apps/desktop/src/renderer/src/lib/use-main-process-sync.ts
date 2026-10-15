import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useRunsStore } from '../state/runs-store';
import { queryKeys } from './queries';

/** Keeps the UI in step with the main process: refreshes changed data and tracks replies. */
export function useMainProcessSync(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const stopData = window.ull.app.onDataChanged((scope) => {
      if (scope === 'accounts') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
        void queryClient.invalidateQueries({ queryKey: queryKeys.manager });
        // Which models are usable depends on account health.
        void queryClient.invalidateQueries({ queryKey: queryKeys.models });
      } else if (scope === 'models') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.models });
      } else {
        void queryClient.invalidateQueries({ queryKey: queryKeys.chats });
        void queryClient.invalidateQueries({ queryKey: queryKeys.allChats });
        void queryClient.invalidateQueries({ queryKey: queryKeys.allFiles });
      }
    });

    const stopRuns = window.ull.chats.onRunEvent((event) => {
      useRunsStore.getState().apply(event);
      if (event.type === 'file') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.files(event.chatId) });
      } else if (event.type === 'finished') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.files(event.chatId) });
        // Show the saved message first, then drop the live copy, so nothing flickers.
        void queryClient
          .invalidateQueries({ queryKey: queryKeys.chat(event.chatId) })
          .finally(() => useRunsStore.getState().clear(event.chatId, event.runId));
      }
    });

    return () => {
      stopData();
      stopRuns();
    };
  }, [queryClient]);
}
