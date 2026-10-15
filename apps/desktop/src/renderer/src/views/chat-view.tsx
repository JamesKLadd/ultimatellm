import type { ChatMessage } from '@ultimatellm/shared';
import { Badge, Button, cn } from '@ultimatellm/ui';
import {
  AlertCircle,
  ChevronDown,
  CircleSlash,
  Files,
  MessageSquareOff,
  Receipt,
  Workflow,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Composer } from '../components/composer';
import { EmptyState } from '../components/empty-state';
import { FilesPanel } from '../components/files-panel';
import { Markdown } from '../components/markdown';
import { MessageDetails } from '../components/message-details';
import { PlanReview, SpecDetails } from '../components/plan-card';
import { StepList, StepPills, type DisplayStep } from '../components/steps';
import { formatCost } from '../lib/format';
import { PROVIDER_UI } from '../lib/providers';
import { useChat, useWorkspaceFiles } from '../lib/queries';
import { orderedSteps, useRunsStore, type ActiveRun } from '../state/runs-store';
import { useUiStore } from '../state/ui-store';

/**
 * Scrolls to the bottom as content grows, unless the user scrolled up to
 * read. A new message always scrolls into view.
 */
function useStickToBottom(messageCount: number, growth: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useLayoutEffect(() => {
    pinned.current = true;
  }, [messageCount]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [messageCount, growth]);

  const onScroll = () => {
    const element = ref.current;
    if (!element) return;
    pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  };
  return { ref, onScroll };
}

export function ChatView({ chatId }: { chatId: string }) {
  const chat = useChat(chatId);
  const files = useWorkspaceFiles(chatId);
  const run = useRunsStore((state) => state.byChat[chatId]);
  const filesOpen = useUiStore((state) => state.filesOpen);
  const setFilesOpen = useUiStore((state) => state.setFilesOpen);
  const fileCount = files.data?.length ?? 0;
  const liveText = run ? Object.values(run.steps).reduce((n, step) => n + step.text.length, 0) : 0;
  const { ref, onScroll } = useStickToBottom(chat.data?.messages.length ?? 0, [
    liveText,
    run?.plan,
  ]);

  // Open the files panel when a reply starts writing files.
  const hadFiles = useRef(fileCount > 0);
  useEffect(() => {
    if (fileCount > 0 && !hadFiles.current && run && !run.finished) setFilesOpen(true);
    hadFiles.current = fileCount > 0;
  }, [fileCount, run, setFilesOpen]);

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

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {fileCount > 0 && !filesOpen && (
          <div className="flex justify-end px-4 pt-2">
            <Button size="sm" variant="outline" onClick={() => setFilesOpen(true)}>
              <Files /> Files · {fileCount}
            </Button>
          </div>
        )}
        <div ref={ref} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6">
            {messages.map((message) =>
              message.role === 'user' ? (
                <UserMessage key={message.id} text={message.content} />
              ) : message.status === 'running' ? (
                <LiveReply key={message.id} run={run} />
              ) : (
                <AssistantMessage
                  key={message.id}
                  message={message}
                  onShowFiles={() => setFilesOpen(true)}
                />
              ),
            )}
          </div>
        </div>
        <div className="shrink-0 px-6 pb-4">
          <div className="mx-auto w-full max-w-3xl">
            <Composer chatId={chatId} autoFocus />
          </div>
        </div>
      </div>
      {filesOpen && <FilesPanel chatId={chatId} onClose={() => setFilesOpen(false)} />}
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

function AssistantMessage({
  message,
  onShowFiles,
}: {
  message: ChatMessage;
  onShowFiles: () => void;
}) {
  const [details, setDetails] = useState(false);
  const workflow = message.plan?.kind === 'workflow';
  const tasks = message.steps.filter((step) => step.kind === 'task');
  const fileCount = new Set(tasks.flatMap((task) => task.files)).size;
  const tokens = (message.inputTokens ?? 0) + (message.outputTokens ?? 0);
  const models = new Set(message.steps.map((step) => step.modelName).filter(Boolean)).size;

  return (
    <div data-testid="assistant-message" className="flex flex-col gap-3 select-text">
      {workflow && message.plan && (
        <div className="flex flex-col gap-2 select-none">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Workflow className="size-4 text-brand" /> {message.plan.summary}
          </p>
          <StepList steps={tasks.map(toDisplay)} />
        </div>
      )}
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
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground select-none">
        {message.provider && (
          <span className={cn('size-2 rounded-full', PROVIDER_UI[message.provider].dotClass)} />
        )}
        {message.modelName && <span>{message.modelName}</span>}
        {message.accountLabel && <span>· {message.accountLabel}</span>}
        {workflow && models > 1 && <span>· {models} models</span>}
        {tokens > 0 && <span>· {tokens.toLocaleString()} tokens</span>}
        {formatCost(message.costUsd) && (
          <span data-testid="message-cost">· {formatCost(message.costUsd)}</span>
        )}
        {message.status === 'stopped' && (
          <Badge variant="outline">
            <CircleSlash /> Stopped
          </Badge>
        )}
        {fileCount > 0 && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onShowFiles}>
            <Files className="size-3.5" /> {fileCount} file{fileCount === 1 ? '' : 's'}
          </Button>
        )}
        {message.steps.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            aria-expanded={details}
            onClick={() => setDetails(!details)}
          >
            <Receipt className="size-3.5" /> Sources
            <ChevronDown className={cn('size-3 transition-transform', details && 'rotate-180')} />
          </Button>
        )}
      </div>
      {details && <MessageDetails message={message} />}
    </div>
  );
}

function toDisplay(step: ChatMessage['steps'][number]): DisplayStep {
  return {
    key: step.key,
    kind: step.kind,
    title: step.title,
    status: step.status,
    provider: step.provider,
    modelName: step.modelName,
    accountLabel: step.accountLabel,
    files: step.files,
    error: step.error,
    costUsd: step.costUsd,
  };
}

/** A reply that's still being made: plan, live progress and streamed text. */
function LiveReply({ run }: { run: ActiveRun | undefined }) {
  if (!run) {
    // E.g. the window was reloaded during a reply: it shows up once it's saved.
    return <Thinking label="Working…" />;
  }
  const steps = orderedSteps(run);
  const plan = run.plan;

  if (plan && run.awaitingApproval && !run.finished) {
    return (
      <div data-testid="live-reply" className="flex flex-col gap-3">
        <StepPills steps={steps.filter((step) => step.kind === 'plan')} />
        <PlanReview key={run.runId} runId={run.runId} plan={plan} />
      </div>
    );
  }

  if (plan?.kind === 'workflow') {
    const wrapup = run.steps.wrapup;
    return (
      <div data-testid="live-reply" className="flex flex-col gap-3" aria-live="polite">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Workflow className="size-4 text-brand" /> {plan.summary}
        </p>
        <SpecDetails spec={plan.spec} />
        <StepList steps={steps} />
        {wrapup?.text ? <Markdown text={wrapup.text} /> : null}
      </div>
    );
  }

  const answer = steps.find((step) => step.kind === 'task');
  return (
    <div data-testid="live-reply" className="flex flex-col gap-2" aria-live="polite">
      <StepPills steps={steps} />
      {answer?.text ? <Markdown text={answer.text} /> : <Thinking label="Thinking" />}
    </div>
  );
}

function Thinking({ label }: { label: string }) {
  return (
    <div className="flex gap-1 py-2" aria-label={label}>
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${dot * 150}ms` }}
        />
      ))}
    </div>
  );
}
