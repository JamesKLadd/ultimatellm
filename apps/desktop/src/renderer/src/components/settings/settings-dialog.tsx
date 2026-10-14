import type { ThemePreference } from '@ultimatellm/shared';
import {
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  SegmentedControl,
  type SegmentedControlOption,
} from '@ultimatellm/ui';
import { Crown, Info, KeyRound, Monitor, Moon, Palette, Sun, type LucideIcon } from 'lucide-react';
import { useAppInfo, useSetTheme, useTheme } from '../../lib/queries';
import { useUiStore, type SettingsTab } from '../../state/ui-store';
import { AccountsSettings } from './accounts-settings';
import { ManagerSettings } from './manager-settings';

const TABS: readonly { id: SettingsTab; label: string; icon: LucideIcon }[] = [
  { id: 'accounts', label: 'Accounts', icon: KeyRound },
  { id: 'manager', label: 'Manager', icon: Crown },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'about', label: 'About', icon: Info },
];

export function SettingsDialog() {
  const open = useUiStore((state) => state.settingsOpen);
  const setOpen = useUiStore((state) => state.setSettingsOpen);
  const tab = useUiStore((state) => state.settingsTab);
  const setTab = useUiStore((state) => state.setSettingsTab);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[min(680px,85vh)] gap-0 p-0 sm:max-w-3xl">
        <nav
          aria-label="Settings sections"
          className="flex w-44 shrink-0 flex-col gap-0.5 border-r bg-muted/40 p-3"
        >
          <DialogTitle className="px-2 pt-1 pb-3 text-base">Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Accounts, manager order, appearance and app information.
          </DialogDescription>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
              className={cn(
                'flex h-8 items-center gap-2 rounded-lg px-2 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4',
                tab === id && 'bg-accent font-medium',
              )}
            >
              <Icon /> {label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto p-6 pt-12">
          {tab === 'accounts' && <AccountsSettings />}
          {tab === 'manager' && <ManagerSettings />}
          {tab === 'appearance' && <AppearanceSettings />}
          {tab === 'about' && <AboutSettings />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const THEME_OPTIONS: readonly SegmentedControlOption<ThemePreference>[] = [
  {
    value: 'system',
    label: (
      <>
        <Monitor /> System
      </>
    ),
  },
  {
    value: 'light',
    label: (
      <>
        <Sun /> Light
      </>
    ),
  },
  {
    value: 'dark',
    label: (
      <>
        <Moon /> Dark
      </>
    ),
  },
];

function AppearanceSettings() {
  const theme = useTheme();
  const setTheme = useSetTheme();
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">Theme</span>
      {theme.data && (
        <SegmentedControl
          aria-label="Theme"
          value={theme.data}
          onValueChange={(next) => setTheme.mutate(next)}
          options={THEME_OPTIONS}
        />
      )}
    </div>
  );
}

function AboutSettings() {
  const appInfo = useAppInfo();
  if (!appInfo.data) return null;
  const { version, versions, mockProviders } = appInfo.data;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Version</dt>
        <dd>{version}</dd>
        <dt className="text-muted-foreground">Electron</dt>
        <dd>{versions.electron}</dd>
        <dt className="text-muted-foreground">Chromium</dt>
        <dd>{versions.chrome}</dd>
        <dt className="text-muted-foreground">Node.js</dt>
        <dd>{versions.node}</dd>
      </dl>
      {mockProviders && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          Mock providers are on: replies come from offline test models, and any key that doesn’t
          start with “invalid” is accepted.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        UltimateLLM is open source under the Apache License 2.0.
      </p>
    </div>
  );
}
