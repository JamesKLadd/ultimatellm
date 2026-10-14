import { join } from 'node:path';
import { app, BrowserWindow, nativeTheme } from 'electron';

// Matches --background / --foreground in packages/ui/src/styles/globals.css, so
// the window doesn't flash a different color before the UI paints.
const COLORS = {
  light: { background: '#fafaf9', foreground: '#1d1a18' },
  dark: { background: '#1b1918', foreground: '#f1f0ee' },
} as const;

/** Height of the custom title bar (the UI's top bar is h-10 = 40px). */
const TITLE_BAR_HEIGHT = 40;

function themeColors() {
  return nativeTheme.shouldUseDarkColors ? COLORS.dark : COLORS.light;
}

export function createMainWindow(url: string): BrowserWindow {
  const isMac = process.platform === 'darwin';
  const colors = themeColors();

  const window = new BrowserWindow({
    title: 'UltimateLLM',
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: colors.background,
    // Draw our own title bar like the Claude and ChatGPT apps. macOS keeps its
    // traffic lights; Windows/Linux get native window buttons drawn over the UI.
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 16, y: 13 } }
      : {
          titleBarOverlay: {
            color: colors.background,
            symbolColor: colors.foreground,
            height: TITLE_BAR_HEIGHT,
          },
        }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: !app.isPackaged,
      spellcheck: true,
    },
  });

  const syncNativeColors = () => {
    const next = themeColors();
    window.setBackgroundColor(next.background);
    if (!isMac) {
      window.setTitleBarOverlay({
        color: next.background,
        symbolColor: next.foreground,
        height: TITLE_BAR_HEIGHT,
      });
    }
  };
  nativeTheme.on('updated', syncNativeColors);
  window.on('closed', () => nativeTheme.off('updated', syncNativeColors));

  window.once('ready-to-show', () => window.show());
  window.loadURL(url).catch((error: unknown) => {
    console.error(`Failed to load ${url}:`, error);
  });
  return window;
}
