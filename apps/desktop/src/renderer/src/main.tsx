import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@ultimatellm/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import './styles.css';

// Lets styles adapt to each platform's window buttons (`mac:` / `wco:` variants).
document.documentElement.dataset.platform = window.ull.platform;

const queryClient = new QueryClient({
  defaultOptions: {
    // Data comes from the local main process, so there's nothing to retry or refetch.
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
