import type { OutputMode, PlanMode } from '@ultimatellm/shared';
import {
  Button,
  SegmentedControl,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type SegmentedControlOption,
} from '@ultimatellm/ui';
import { ArrowUp, ListChecks, PiggyBank, Play, Scale, Sparkles, Square, Zap } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { errorMessage } from '../lib/providers';
import { useManagerStatus, useSendMessage } from '../lib/queries';
import { useRunsStore } from '../state/runs-store';
import { useUiStore } from '../state/ui-store';

const OUTPUT_MODES: readonly SegmentedControlOption<OutputMode>[] = [
  {
    value: 'cheapest',
    label: (
      <>
        <PiggyBank /> Cheapest
      </>
    ),
    description: 'The least expensive models that can do the job well',
  },
  {
    value: 'balanced',
    label: (
      <>
        <Scale /> Balanced
      </>
    ),
    description: 'Good quality at a sensible cost',
  },
  {
    value: 'best',
    label: (
      <>
        <Sparkles /> Best
      </>
    ),
    description: 'Top models and deeper thinking, whatever the cost',
  },
  {
    value: 'fastest',
    label: (
      <>
        <Zap /> Fastest
      </>
    ),
    description: 'The quickest models, with little or no thinking time',
  },
];

const PLAN_MODES: readonly SegmentedControlOption<PlanMode>[] = [
  {
    value: 'auto',
    label: (
      <>
        <Play /> Auto
      </>
    ),
    description: 'The manager starts working as soon as it has a plan',
  },
  {
    value: 'review',
    label: (
      <>
        <ListChecks /> Review
      </>
    ),
    description:
      'Review and edit the manager’s plan before it runs (plans arrive with multi-model planning)',
  },
];

interface ComposerProps {
  /** The chat to continue; omit to start a new one. */
  chatId?: string;
  autoFocus?: boolean;
}

export function Composer({ chatId, autoFocus = false }: ComposerProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const outputMode = useUiStore((state) => state.outputMode);
  const setOutputMode = useUiStore((state) => state.setOutputMode);
  const planMode = useUiStore((state) => state.planMode);
  const setPlanMode = useUiStore((state) => state.setPlanMode);
  const openChat = useUiStore((state) => state.openChat);
  const run = useRunsStore((state) => (chatId ? state.byChat[chatId] : undefined));
  const manager = useManagerStatus();
  const send = useSendMessage();

  const running = run !== undefined && !run.finished;
  const noManager = manager.data !== undefined && manager.data.manager === null;
  const canSend = draft.trim() !== '' && !running && !noManager && !send.isPending;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    setError(null);
    try {
      const result = await send.mutateAsync({
        text: draft,
        outputMode,
        planMode,
        ...(chatId ? { chatId } : {}),
      });
      useRunsStore.getState().track(result.chatId, result.runId);
      setDraft('');
      if (!chatId) openChat(result.chatId);
    } catch (sendError) {
      setError(errorMessage(sendError));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter adds a line. Never send mid-composition (e.g. Japanese input).
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="rounded-2xl border bg-card shadow-sm transition-shadow focus-within:shadow-md"
    >
      <Textarea
        aria-label="Message"
        placeholder={
          noManager
            ? 'No AI account is available. Add one in Settings → Accounts.'
            : 'Ask anything. The manager will pick the best models for it.'
        }
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        className="max-h-64 px-4 pt-3.5"
      />
      <div className="flex flex-wrap items-center gap-2 px-3 pt-1 pb-3">
        <SegmentedControl
          size="sm"
          aria-label="Output mode"
          value={outputMode}
          onValueChange={setOutputMode}
          options={OUTPUT_MODES}
        />
        <SegmentedControl
          size="sm"
          aria-label="Plan mode"
          value={planMode}
          onValueChange={setPlanMode}
          options={PLAN_MODES}
        />
        <div className="ml-auto flex items-center gap-2">
          {running ? (
            <Button
              type="button"
              size="icon-sm"
              aria-label="Stop"
              onClick={() => void window.ull.chats.stop(run.runId)}
            >
              <Square className="fill-current" />
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Disabled buttons don't receive pointer events, so the wrapper shows the tooltip. */}
                <span tabIndex={canSend ? -1 : 0} className="inline-flex rounded-lg outline-none">
                  <Button type="submit" size="icon-sm" disabled={!canSend} aria-label="Send">
                    <ArrowUp />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {noManager ? 'No AI account is available' : 'Send (Enter)'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="border-t px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
