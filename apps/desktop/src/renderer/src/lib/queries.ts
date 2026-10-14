import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ThemePreference } from '@ultimatellm/shared';

const queryKeys = {
  appInfo: ['app', 'info'],
  theme: ['settings', 'theme'],
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
