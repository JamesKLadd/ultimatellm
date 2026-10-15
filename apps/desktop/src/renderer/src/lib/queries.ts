import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddApiKeyInput,
  ApprovePlanInput,
  ProviderId,
  SendMessageInput,
  ThemePreference,
} from '@ultimatellm/shared';

export const queryKeys = {
  appInfo: ['app', 'info'],
  theme: ['settings', 'theme'],
  accounts: ['accounts'],
  manager: ['manager'],
  chats: ['chats'],
  chat: (id: string) => ['chat', id] as const,
  allChats: ['chat'],
  files: (chatId: string) => ['files', chatId] as const,
  file: (chatId: string, path: string) => ['files', chatId, path] as const,
  allFiles: ['files'],
  models: ['models'],
} as const;

export function useAppInfo() {
  return useQuery({ queryKey: queryKeys.appInfo, queryFn: () => window.ull.app.getInfo() });
}

export function useTheme() {
  return useQuery({ queryKey: queryKeys.theme, queryFn: () => window.ull.settings.getTheme() });
}

/** Saves the theme. The UI updates right away and rolls back if saving fails. */
export function useSetTheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (theme: ThemePreference) => window.ull.settings.setTheme(theme),
    onMutate: async (theme) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.theme });
      const previous = queryClient.getQueryData<ThemePreference>(queryKeys.theme);
      queryClient.setQueryData(queryKeys.theme, theme);
      return { previous };
    },
    onError: (_error, _theme, result) => {
      if (result?.previous) queryClient.setQueryData(queryKeys.theme, result.previous);
    },
  });
}

// --- Accounts & manager ----------------------------------------------------------
// Mutations don't refresh queries themselves: the main process announces every
// change (see use-main-process-sync.ts), which keeps all windows consistent.

export function useAccounts() {
  return useQuery({ queryKey: queryKeys.accounts, queryFn: () => window.ull.accounts.list() });
}

export function useManagerStatus() {
  return useQuery({
    queryKey: queryKeys.manager,
    queryFn: () => window.ull.manager.status(),
    // Rate-limited accounts come back on their own after a while.
    refetchInterval: 30_000,
  });
}

export function useAddAccount() {
  return useMutation({ mutationFn: (input: AddApiKeyInput) => window.ull.accounts.add(input) });
}

export function useRemoveAccount() {
  return useMutation({ mutationFn: (id: string) => window.ull.accounts.remove(id) });
}

export function useReorderAccounts() {
  return useMutation({
    mutationFn: ({ provider, ids }: { provider: ProviderId; ids: string[] }) =>
      window.ull.accounts.reorder(provider, ids),
  });
}

export function useRecheckAccount() {
  return useMutation({ mutationFn: (id: string) => window.ull.accounts.recheck(id) });
}

export function useSetManagerOrder() {
  return useMutation({ mutationFn: (order: ProviderId[]) => window.ull.manager.setOrder(order) });
}

// --- Chats -------------------------------------------------------------------------

export function useChats() {
  return useQuery({ queryKey: queryKeys.chats, queryFn: () => window.ull.chats.list() });
}

export function useChat(id: string | null) {
  return useQuery({
    queryKey: queryKeys.chat(id ?? ''),
    queryFn: () => window.ull.chats.get(id!),
    enabled: id !== null,
  });
}

export function useSendMessage() {
  return useMutation({ mutationFn: (input: SendMessageInput) => window.ull.chats.send(input) });
}

export function useRemoveChat() {
  return useMutation({ mutationFn: (id: string) => window.ull.chats.remove(id) });
}

export function useApprovePlan() {
  return useMutation({
    mutationFn: (input: ApprovePlanInput) => window.ull.chats.approvePlan(input),
  });
}

// --- Workspace ---------------------------------------------------------------------

export function useWorkspaceFiles(chatId: string) {
  return useQuery({
    queryKey: queryKeys.files(chatId),
    queryFn: () => window.ull.workspace.list(chatId),
  });
}

export function useWorkspaceFile(chatId: string, path: string | null) {
  return useQuery({
    queryKey: queryKeys.file(chatId, path ?? ''),
    queryFn: () => window.ull.workspace.read(chatId, path!),
    enabled: path !== null,
  });
}

export function useExportFiles() {
  return useMutation({ mutationFn: (chatId: string) => window.ull.workspace.export(chatId) });
}

// --- Models ------------------------------------------------------------------------

export function useModelsInfo() {
  return useQuery({ queryKey: queryKeys.models, queryFn: () => window.ull.models.info() });
}

export function useCheckModelsUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => window.ull.models.checkForUpdate(),
    onSuccess: (info) => queryClient.setQueryData(queryKeys.models, info),
  });
}

export function useSetModelsAutoUpdate() {
  return useMutation({
    mutationFn: (enabled: boolean) => window.ull.models.setAutoUpdate(enabled),
  });
}
