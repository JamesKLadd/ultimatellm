import { FolderKanban, Library, MessagesSquare } from 'lucide-react';
import { EmptyState } from './components/empty-state';
import { SettingsDialog } from './components/settings-dialog';
import { Sidebar } from './components/sidebar';
import { TopBar } from './components/top-bar';
import { useAppCommands } from './lib/use-app-commands';
import { useUiStore, type View } from './state/ui-store';
import { NewChatView } from './views/new-chat-view';

const VIEW_TITLES: Record<View, string> = {
  'new-chat': 'New chat',
  chats: 'Chats',
  projects: 'Projects',
  library: 'Library',
};

export function App() {
  useAppCommands();
  const view = useUiStore((state) => state.view);
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);

  return (
    <div data-testid="app-shell" className="flex h-full">
      {sidebarOpen && <Sidebar />}
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar title={VIEW_TITLES[view]} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CurrentView view={view} />
        </div>
      </main>
      <SettingsDialog />
    </div>
  );
}

function CurrentView({ view }: { view: View }) {
  switch (view) {
    case 'new-chat':
      return <NewChatView />;
    case 'chats':
      return (
        <EmptyState
          icon={MessagesSquare}
          title="No chats yet"
          description="Start a new chat and it will appear here. Chats can be saved to the cloud, kept on this device, or kept fully private."
        />
      );
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
