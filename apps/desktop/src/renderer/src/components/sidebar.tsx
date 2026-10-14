import { Button, cn, Tooltip, TooltipContent, TooltipTrigger } from '@ultimatellm/ui';
import {
  FolderKanban,
  Library,
  MessagesSquare,
  PanelLeftClose,
  Settings,
  SquarePen,
  type LucideIcon,
} from 'lucide-react';
import { shortcut } from '../lib/platform';
import { useUiStore, type View } from '../state/ui-store';

const NAV_ITEMS: readonly { view: View; label: string; icon: LucideIcon }[] = [
  { view: 'new-chat', label: 'New chat', icon: SquarePen },
  { view: 'chats', label: 'Chats', icon: MessagesSquare },
  { view: 'projects', label: 'Projects', icon: FolderKanban },
  { view: 'library', label: 'Library', icon: Library },
];

export function Sidebar() {
  const view = useUiStore((state) => state.view);
  const setView = useUiStore((state) => state.setView);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);

  return (
    <aside
      aria-label="Sidebar"
      className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
    >
      {/* Title bar area. On macOS it leaves room for the traffic lights. */}
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 pr-2 pl-3 app-drag mac:pl-20">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span
            aria-hidden
            className="grid size-5 place-items-center rounded-md bg-brand text-[11px] font-bold text-brand-foreground"
          >
            U
          </span>
          UltimateLLM
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="app-no-drag"
              aria-label="Hide sidebar"
              onClick={toggleSidebar}
            >
              <PanelLeftClose />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Hide sidebar ({shortcut('B')})</TooltipContent>
        </Tooltip>
      </div>

      <nav aria-label="Main" className="flex flex-col gap-0.5 px-2 pt-2">
        {NAV_ITEMS.map((item) => (
          <SidebarButton
            key={item.view}
            icon={item.icon}
            label={item.label}
            active={view === item.view}
            onClick={() => setView(item.view)}
          />
        ))}
      </nav>

      <section
        aria-labelledby="recents-heading"
        className="mt-5 min-h-0 flex-1 overflow-y-auto px-2"
      >
        <h2 id="recents-heading" className="px-2 pb-1 text-xs font-medium text-muted-foreground">
          Recents
        </h2>
        <p className="px-2 text-xs text-muted-foreground/80">Your chats will show up here.</p>
      </section>

      <div className="border-t border-sidebar-border p-2">
        <SidebarButton icon={Settings} label="Settings" onClick={() => setSettingsOpen(true)} />
      </div>
    </aside>
  );
}

interface SidebarButtonProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
}

function SidebarButton({ icon: Icon, label, active = false, onClick }: SidebarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-sm transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0',
        active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
      )}
    >
      <Icon />
      {label}
    </button>
  );
}
