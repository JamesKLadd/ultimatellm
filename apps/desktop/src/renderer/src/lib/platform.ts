export const isMac = window.ull.platform === 'darwin';

/** Formats a Cmd/Ctrl shortcut for display, e.g. `⌘B` on macOS and `Ctrl+B` elsewhere. */
export function shortcut(key: string): string {
  return isMac ? `⌘${key}` : `Ctrl+${key}`;
}
