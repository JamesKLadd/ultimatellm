import { Button, cn, Tooltip, TooltipContent, TooltipTrigger } from '@ultimatellm/ui';
import {
  FolderKanban,
  Library,
  MessagesSquare,
  PanelLeftClose,
  Settings,
  SquarePen,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { shortcut } from '../lib/platform';
import { useChats, useRemoveChat } from '../lib/queries';
import { useRunsStore } from '../state/runs-store';
import { useUiStore, type View } from '../state/ui-store';

const NAV_ITEMS: readonly { view: View; label: string; icon: LucideIcon }[] = [
  { view: 'chats', label: 'Chats', icon: MessagesSquare },
  { view: 'projects', label: 'Projects', icon: FolderKanban },
  { view: 'library', label: 'Library', icon: Library },
];

export function Sidebar() {
  const view = useUiStore((state) => state.view);
  const setView = useUiStore((state) => state.setView);
  const newChat = useUiStore((state) => state.newChat);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const openSettings = useUiStore((state) => state.openSettings);

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
        <SidebarButton
          icon={SquarePen}
          label="New chat"
          active={view === 'new-chat'}
          onClick={newChat}
        />
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

      <Recents />

      <div className="border-t border-sidebar-border p-2">
        <SidebarButton icon={Settings} label="Settings" onClick={() => openSettings()} />
      </div>
    </aside>
  );
}

function Recents() {
  const chats = useChats();
  const view = useUiStore((state) => state.view);
  const activeChatId = useUiStore((state) => state.activeChatId);
  const openChat = useUiStore((state) => state.openChat);

  return (
    <section aria-labelledby="recents-heading" className="mt-5 min-h-0 flex-1 overflow-y-auto px-2">
      <h2 id="recents-heading" className="px-2 pb-1 text-xs font-medium text-muted-foreground">
        Recents
      </h2>
      {chats.data?.length ? (
        <ul className="flex flex-col gap-0.5">
          {chats.data.map((chat) => (
            <RecentChat
              key={chat.id}
              id={chat.id}
              title={chat.title}
              active={view === 'chat' && activeChatId === chat.id}
              onOpen={() => openChat(chat.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="px-2 text-xs text-muted-foreground/80">Your chats will show up here.</p>
      )}
    </section>
  );
}

function RecentChat(props: { id: string; title: string; active: boolean; onOpen: () => void }) {
  const remove = useRemoveChat();
  const newChat = useUiStore((state) => state.newChat);
  const running = useRunsStore((state) => {
    const run = state.byChat[props.id];
    return run !== undefined && !run.finished;
  });
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const onDelete = () => {
    if (!confirming) return setConfirming(true);
    if (props.active) newChat();
    remove.mutate(props.id);
  };

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={props.onOpen}
        aria-current={props.active ? 'page' : undefined}
        className={cn(
          'flex h-8 w-full items-center gap-2 rounded-lg px-2 pr-8 text-left text-sm transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
          props.active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
        )}
      >
        {running && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-brand" />}
        <span className="truncate">{props.title}</span>
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={confirming ? `Confirm deleting ${props.title}` : `Delete ${props.title}`}
            onClick={onDelete}
            className={cn(
              'absolute top-1 right-1 grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background focus-visible:opacity-100 [&_svg]:size-3.5',
              confirming && 'text-destructive opacity-100',
            )}
          >
            <Trash2 />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {confirming ? 'Click again to delete' : 'Delete'}
        </TooltipContent>
      </Tooltip>
    </li>
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
