import type { ChatMessage } from '@ultimatellm/shared';
import { Badge, cn } from '@ultimatellm/ui';
import { AlertCircle, CircleSlash, MessageSquareOff, RotateCw } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { Composer } from '../components/composer';
import { EmptyState } from '../components/empty-state';
import { Markdown } from '../components/markdown';
import { PROVIDER_UI } from '../lib/providers';
import { useChat } from '../lib/queries';
import { useRunsStore, type ActiveRun } from '../state/runs-store';

/** Scrolls to the bottom as content grows, unless the user scrolled up to read. */
function useStickToBottom(dependency: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [dependency]);

  const onScroll = () => {
    const element = ref.current;
    if (!element) return;
    pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  };
  return { ref, onScroll };
}

export function ChatView({ chatId }: { chatId: string }) {
  const chat = useChat(chatId);
  const run = useRunsStore((state) => state.byChat[chatId]);
  const { ref, onScroll } = useStickToBottom([chat.data?.messages.length, run?.text]);

  if (chat.data === null) {
    return (
      <EmptyState
        icon={MessageSquareOff}
        title="Chat not found"
        description="It may have been deleted."
      />
    );
  }

  const messages = chat.data?.messages ?? [];
  // Once the reply is saved, the live copy is hidden even if it lingers for a moment.
  const showRun = run !== undefined && !(run.finished && messages.at(-1)?.role === 'assistant');

  return (
    <div className="flex h-full flex-col">
      <div ref={ref} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6">
          {messages.map((message) =>
            message.role === 'user' ? (
              <UserMessage key={message.id} text={message.content} />
            ) : (
              <AssistantMessage key={message.id} message={message} />
            ),
          )}
          {showRun && <LiveReply run={run} />}
        </div>
      </div>
      <div className="shrink-0 px-6 pb-4">
        <div className="mx-auto w-full max-w-3xl">
          <Composer chatId={chatId} autoFocus />
        </div>
      </div>
    </div>
  );
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div
        data-testid="user-message"
        className="max-w-[80%] rounded-2xl bg-secondary px-4 py-2.5 text-[15px] whitespace-pre-wrap select-text"
      >
        {text}
      </div>
    </div>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  return (
    <div data-testid="assistant-message" className="flex flex-col gap-2 select-text">
      {message.content && <Markdown text={message.content} />}
      {message.status === 'error' && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {message.error}
        </p>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground select-none">
        {message.provider && (
          <span className={cn('size-2 rounded-full', PROVIDER_UI[message.provider].dotClass)} />
        )}
        {message.modelName && <span>{message.modelName}</span>}
        {message.accountLabel && <span>· {message.accountLabel}</span>}
        {message.status === 'stopped' && (
          <Badge variant="outline">
            <CircleSlash /> Stopped
          </Badge>
        )}
      </div>
    </div>
  );
}

function LiveReply({ run }: { run: ActiveRun }) {
  return (
    <div data-testid="live-reply" className="flex flex-col gap-2" aria-live="polite">
      <ActivityStrip run={run} />
      {run.text ? (
        <Markdown text={run.text} />
      ) : (
        <div className="flex gap-1 py-2" aria-label="Thinking">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60"
              style={{ animationDelay: `${dot * 150}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Which model is answering right now, and whether a fallback happened. */
function ActivityStrip({ run }: { run: ActiveRun }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span
        data-testid="activity-strip"
        className="inline-flex items-center gap-2 rounded-full border bg-card px-2.5 py-1"
      >
        <span
          className={cn(
            'size-2 rounded-full',
            run.provider ? PROVIDER_UI[run.provider].dotClass : 'bg-muted-foreground',
            !run.finished && 'animate-pulse',
          )}
        />
        <span className="font-medium text-foreground">{run.modelName ?? 'Starting…'}</span>
        {run.accountLabel && <span>· {run.accountLabel}</span>}
        <span>{run.finished ? 'Done' : run.text ? 'Writing…' : 'Thinking…'}</span>
      </span>
      {run.notice && (
        <span className="inline-flex items-center gap-1" title={run.notice}>
          <RotateCw className="size-3" /> Switched after an error
        </span>
      )}
    </div>
  );
}
