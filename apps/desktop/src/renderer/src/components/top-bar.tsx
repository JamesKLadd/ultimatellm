import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@ultimatellm/ui';
import { PanelLeftOpen } from 'lucide-react';
import { shortcut } from '../lib/platform';
import { useUiStore } from '../state/ui-store';

/** The draggable title bar above the main content. */
export function TopBar({ title }: { title: string }) {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

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
      <h1 className="truncate px-2 text-sm font-medium text-muted-foreground">{title}</h1>
    </header>
  );
}
