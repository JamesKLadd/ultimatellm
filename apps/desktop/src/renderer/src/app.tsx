import { FolderKanban, Library, MessagesSquare } from 'lucide-react';
import { EmptyState } from './components/empty-state';
import { SettingsDialog } from './components/settings/settings-dialog';
import { Sidebar } from './components/sidebar';
import { TopBar } from './components/top-bar';
import { useChats } from './lib/queries';
import { useAppCommands } from './lib/use-app-commands';
import { useMainProcessSync } from './lib/use-main-process-sync';
import { useUiStore, type View } from './state/ui-store';
import { ChatView } from './views/chat-view';
import { NewChatView } from './views/new-chat-view';

const VIEW_TITLES: Record<Exclude<View, 'chat'>, string> = {
  'new-chat': 'New chat',
  chats: 'Chats',
  projects: 'Projects',
  library: 'Library',
};

export function App() {
  useAppCommands();
  useMainProcessSync();
  const view = useUiStore((state) => state.view);
  const activeChatId = useUiStore((state) => state.activeChatId);
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const chats = useChats();

  const title =
    view === 'chat'
      ? (chats.data?.find((chat) => chat.id === activeChatId)?.title ?? 'Chat')
      : VIEW_TITLES[view];

  return (
    <div data-testid="app-shell" className="flex h-full">
      {sidebarOpen && <Sidebar />}
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} />
        <div className="min-h-0 flex-1">
          <CurrentView view={view} chatId={activeChatId} />
        </div>
      </main>
      <SettingsDialog />
    </div>
  );
}

function CurrentView({ view, chatId }: { view: View; chatId: string | null }) {
  switch (view) {
    case 'new-chat':
      return <NewChatView />;
    case 'chat':
      return chatId ? <ChatView key={chatId} chatId={chatId} /> : <NewChatView />;
    case 'chats':
      return <ChatsView />;
    case 'projects':
      return (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Projects connect a folder on this computer or a GitHub repository, with their own instructions and memory."
        />
      );
    case 'library':
      return (
        <EmptyState
          icon={Library}
          title="Your library is empty"
          description="Documents, images, audio and video the AIs create for you will be saved here."
        />
      );
  }
}

function ChatsView() {
  const chats = useChats();
  const openChat = useUiStore((state) => state.openChat);
  if (!chats.data?.length) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="No chats yet"
        description="Start a new chat and it will appear here."
      />
    );
  }
  return (
    <div className="h-full overflow-y-auto">
      <ul className="mx-auto flex max-w-3xl flex-col gap-1 px-6 py-6">
        {chats.data.map((chat) => (
          <li key={chat.id}>
            <button
              type="button"
              onClick={() => openChat(chat.id)}
              className="flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
            >
              <span className="truncate text-sm font-medium">{chat.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(chat.updatedAt).toLocaleDateString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
