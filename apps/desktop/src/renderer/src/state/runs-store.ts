import type { ChatRunEvent, PlanView, ProviderId, StepKind, StepStatus } from '@ultimatellm/shared';
import { create } from 'zustand';

/** A step of a reply that is still running. */
export interface LiveStep {
  key: string;
  kind: StepKind;
  title: string;
  status: StepStatus;
  provider: ProviderId | null;
  modelName: string | null;
  accountLabel: string | null;
  /** Text streamed by the step's current model. */
  text: string;
  /** Why the previous model or account was skipped, if one was. */
  notice: string | null;
  files: string[];
  error: string | null;
  costUsd: number | null;
}

/** A reply that is still being made. Saved replies come from the chat query instead. */
export interface ActiveRun {
  runId: string;
  chatId: string;
  /** The assistant message being written. */
  messageId: string | null;
  plan: PlanView | null;
  awaitingApproval: boolean;
  steps: Record<string, LiveStep>;
  finished: boolean;
}

interface RunsState {
  byChat: Record<string, ActiveRun>;
  /** Registers a run as soon as `send` returns (its events may arrive first). */
  track: (chatId: string, runId: string) => void;
  apply: (event: ChatRunEvent) => void;
  clear: (chatId: string, runId: string) => void;
}

const emptyRun = (chatId: string, runId: string): ActiveRun => ({
  runId,
  chatId,
  messageId: null,
  plan: null,
  awaitingApproval: false,
  steps: {},
  finished: false,
});

const emptyStep = (key: string, kind: StepKind, title: string): LiveStep => ({
  key,
  kind,
  title,
  status: 'queued',
  provider: null,
  modelName: null,
  accountLabel: null,
  text: '',
  notice: null,
  files: [],
  error: null,
  costUsd: null,
});

/** Steps in display order: planning, the tasks, then the wrap-up. */
export function orderedSteps(run: ActiveRun): LiveStep[] {
  const rank = { plan: 0, task: 1, wrapup: 2 } as const;
  const taskOrder = run.plan?.tasks.map((task) => task.key) ?? [];
  return Object.values(run.steps).sort(
    (a, b) => rank[a.kind] - rank[b.kind] || taskOrder.indexOf(a.key) - taskOrder.indexOf(b.key),
  );
}

function withStep(
  run: ActiveRun,
  key: string,
  update: (step: LiveStep) => LiveStep,
  kind: StepKind = 'task',
): ActiveRun {
  const step = run.steps[key] ?? emptyStep(key, kind, key);
  return { ...run, steps: { ...run.steps, [key]: update(step) } };
}

function applyEvent(run: ActiveRun, event: ChatRunEvent): ActiveRun {
  switch (event.type) {
    case 'started':
      return { ...run, messageId: event.messageId };
    case 'plan': {
      // Tasks deleted in review disappear; new ones start out queued.
      const keep = new Set([...event.plan.tasks.map((task) => task.key), 'plan', 'wrapup']);
      const steps: Record<string, LiveStep> = {};
      for (const [key, step] of Object.entries(run.steps)) if (keep.has(key)) steps[key] = step;
      for (const task of event.plan.tasks) {
        steps[task.key] = {
          ...(steps[task.key] ?? emptyStep(task.key, 'task', task.title)),
          title: task.title,
          provider: steps[task.key]?.provider ?? task.provider,
          modelName: steps[task.key]?.modelName ?? task.modelName,
        };
      }
      if (event.plan.kind === 'workflow') {
        steps.wrapup ??= emptyStep('wrapup', 'wrapup', 'Wrap-up');
      }
      return { ...run, plan: event.plan, awaitingApproval: event.awaitingApproval, steps };
    }
    case 'step-started':
      // A new attempt (first try or failover) starts from scratch.
      return withStep(
        run,
        event.step,
        (step) => ({
          ...step,
          kind: event.kind,
          title: event.title,
          status: 'running',
          provider: event.provider,
          modelName: event.modelName,
          accountLabel: event.accountLabel,
          text: '',
          error: null,
        }),
        event.kind,
      );
    case 'text':
      return withStep(run, event.step, (step) => ({ ...step, text: step.text + event.delta }));
    case 'step-retrying':
      return withStep(run, event.step, (step) => ({ ...step, notice: event.reason }));
    case 'file':
      return withStep(run, event.step, (step) =>
        step.files.includes(event.path) ? step : { ...step, files: [...step.files, event.path] },
      );
    case 'step-finished':
      return withStep(run, event.step, (step) => ({
        ...step,
        status: event.status,
        error: event.error ?? null,
        costUsd: event.costUsd,
      }));
    case 'finished':
      return { ...run, finished: true, awaitingApproval: false };
  }
}

export const useRunsStore = create<RunsState>()((set) => ({
  byChat: {},

  track: (chatId, runId) =>
    set((state) =>
      state.byChat[chatId]?.runId === runId
        ? state
        : { byChat: { ...state.byChat, [chatId]: emptyRun(chatId, runId) } },
    ),

  apply: (event) =>
    set((state) => {
      const current =
        state.byChat[event.chatId]?.runId === event.runId
          ? state.byChat[event.chatId]!
          : emptyRun(event.chatId, event.runId);
      return { byChat: { ...state.byChat, [event.chatId]: applyEvent(current, event) } };
    }),

  clear: (chatId, runId) =>
    set((state) => {
      if (state.byChat[chatId]?.runId !== runId) return state;
      const { [chatId]: _removed, ...rest } = state.byChat;
      return { byChat: rest };
    }),
}));
