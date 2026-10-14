import { MANAGER_NAMES } from '@ultimatellm/shared';
import { Badge, Button, cn, Tooltip, TooltipContent, TooltipTrigger } from '@ultimatellm/ui';
import { FlaskConical, PanelLeftOpen } from 'lucide-react';
import { shortcut } from '../lib/platform';
import { PROVIDER_UI } from '../lib/providers';
import { useAppInfo, useManagerStatus } from '../lib/queries';
import { useUiStore } from '../state/ui-store';

/** The draggable title bar above the main content. */
export function TopBar({ title }: { title: string }) {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const appInfo = useAppInfo();

  return (
    <header className="flex h-10 shrink-0 items-center gap-1 px-2 app-drag wco:pr-[150px]">
      {!sidebarOpen && (
        // With the sidebar hidden, the macOS traffic lights sit over this bar.
        <div className="mac:pl-[72px]">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="app-no-drag"
                aria-label="Show sidebar"
                onClick={toggleSidebar}
              >
                <PanelLeftOpen />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Show sidebar ({shortcut('B')})</TooltipContent>
          </Tooltip>
        </div>
      )}
      <h1 className="min-w-0 flex-1 truncate px-2 text-sm font-medium text-muted-foreground">
        {title}
      </h1>
      <div className="flex items-center gap-2 app-no-drag">
        {appInfo.data?.mockProviders && (
          <Badge variant="warning" title="Replies come from offline mock models, not real AIs.">
            <FlaskConical /> Mock providers
          </Badge>
        )}
        <ManagerChip />
      </div>
    </header>
  );
}

function ManagerChip() {
  const status = useManagerStatus();
  const openSettings = useUiStore((state) => state.openSettings);
  if (!status.data) return null;
  const manager = status.data.manager;

  return (
    <button
      type="button"
      data-testid="manager-chip"
      onClick={() => openSettings(manager ? 'manager' : 'accounts')}
      className="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs text-muted-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span
        className={cn(
          'size-2 rounded-full',
          manager ? PROVIDER_UI[manager].dotClass : 'bg-muted-foreground/40',
        )}
      />
      {manager ? (
        <>
          Manager: <span className="font-medium text-foreground">{MANAGER_NAMES[manager]}</span>
        </>
      ) : (
        'No manager yet'
      )}
    </button>
  );
}
