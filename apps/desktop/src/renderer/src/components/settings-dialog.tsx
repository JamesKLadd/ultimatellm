import type { ThemePreference } from '@ultimatellm/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  SegmentedControl,
  type SegmentedControlOption,
} from '@ultimatellm/ui';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAppInfo, useSetTheme, useTheme } from '../lib/queries';
import { useUiStore } from '../state/ui-store';

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

export function SettingsDialog() {
  const open = useUiStore((state) => state.settingsOpen);
  const setOpen = useUiStore((state) => state.setSettingsOpen);
  const theme = useTheme();
  const setTheme = useSetTheme();
  const appInfo = useAppInfo();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Saved on this device.</DialogDescription>
        </DialogHeader>

        <Section title="Appearance">
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
        </Section>

        <Section title="About">
          {appInfo.data && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Version</dt>
              <dd>{appInfo.data.version}</dd>
              <dt className="text-muted-foreground">Electron</dt>
              <dd>{appInfo.data.versions.electron}</dd>
              <dt className="text-muted-foreground">Chromium</dt>
              <dd>{appInfo.data.versions.chrome}</dd>
              <dt className="text-muted-foreground">Node.js</dt>
              <dd>{appInfo.data.versions.node}</dd>
            </dl>
          )}
        </Section>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}
