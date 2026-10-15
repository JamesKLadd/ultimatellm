import { z } from 'zod';
import { Effort, OutputMode, PlanMode, TaskCategory } from './orchestration';
import type { ProviderId } from './providers';

export interface ChatSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

/** `running` while a reply is being made; it ends as one of the others. */
export type MessageStatus = 'running' | 'complete' | 'stopped' | 'error';

/** How the manager handles a prompt (docs/03-orchestration.md). */
export type PlanKind = 'direct' | 'workflow';

/** One unit of work in a reply: planning, a task, or the manager's wrap-up. */
export type StepKind = 'plan' | 'task' | 'wrapup';
export type StepStatus = 'queued' | 'running' | 'done' | 'failed' | 'stopped' | 'skipped';

export interface ModelRef {
  provider: ProviderId;
  model: string;
  modelName: string;
}

/** A step as planned. */
export interface PlanStep {
  /** Unique within the reply: "plan", "wrapup", or a task ID like "t1" ("answer" for direct answers). */
  key: string;
  kind: StepKind;
  title: string;
  instructions: string;
  category: TaskCategory | null;
  dependsOn: string[];
  /** Files the task is meant to write. */
  outputs: string[];
  /** Why the manager chose this model. */
  rationale: string;
  provider: ProviderId | null;
  model: string | null;
  modelName: string | null;
  effort: Effort | null;
}

/** What happened when a step ran. */
export interface StepResult {
  status: StepStatus;
  accountLabel: string | null;
  /** The model's text: the answer for direct answers, otherwise a short report. */
  report: string;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** Files the step wrote. */
  files: string[];
}

export type MessageStep = PlanStep & StepResult;

export interface PlanView {
  kind: PlanKind;
  /** One line describing the plan. */
  summary: string;
  /** The shared contract every task receives (Markdown). Empty for direct answers. */
  spec: string;
  /** Who planned, or null if planning was skipped (e.g. an @mention). */
  manager: ModelRef | null;
  /** The @mention that chose the model, if any. */
  pinned: string | null;
  tasks: PlanStep[];
  /** Rough cost and time before running; null when unknown. */
  estimate: { costUsd: number | null; seconds: number | null };
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  /** Markdown text. May be partial if the reply was stopped or failed. */
  content: string;
  status: MessageStatus;
  error: string | null;
  /** The model that wrote `content`: the answering model, or the manager for a wrap-up. */
  provider: ProviderId | null;
  model: string | null;
  modelName: string | null;
  accountLabel: string | null;
  /** Totals for the whole reply, planning and every task included. */
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  outputMode: OutputMode | null;
  createdAt: number;
  plan: PlanView | null;
  steps: MessageStep[];
}

export interface ChatWithMessages {
  chat: ChatSummary;
  messages: ChatMessage[];
}

export const SendMessageInput = z.object({
  /** Omit to start a new chat. */
  chatId: z.string().min(1).max(100).optional(),
  text: z.string().trim().min(1).max(100_000),
  outputMode: OutputMode,
  planMode: PlanMode,
});
export type SendMessageInput = z.input<typeof SendMessageInput>;

export interface SendMessageResult {
  chatId: string;
  runId: string;
}

export const ChatIdInput = z.object({ id: z.string().min(1).max(100) });
export const RunIdInput = z.object({ runId: z.string().min(1).max(100) });

/** A plan as edited on the Review card, sent back to run it. */
export const ApprovePlanInput = z.object({
  runId: z.string().min(1).max(100),
  spec: z.string().max(50_000),
  tasks: z
    .array(
      z.object({
        key: z.string().min(1).max(40),
        title: z.string().trim().min(1).max(200),
        instructions: z.string().trim().min(1).max(50_000),
        category: TaskCategory,
        model: z.string().min(1).max(200),
        effort: Effort.nullable(),
        dependsOn: z.array(z.string().min(1).max(40)).max(20),
        outputs: z.array(z.string().min(1).max(300)).max(50),
      }),
    )
    .min(1)
    .max(12),
});
export type ApprovePlanInput = z.infer<typeof ApprovePlanInput>;

/** Progress of one reply, streamed from the main process to the UI. */
export type ChatRunEvent =
  | { type: 'started'; runId: string; chatId: string; messageId: string }
  /** The plan is ready. In Review mode it waits for `approvePlan` before running. */
  | { type: 'plan'; runId: string; chatId: string; plan: PlanView; awaitingApproval: boolean }
  /** A step started (again, after a failover) on a model and account. */
  | ({
      type: 'step-started';
      runId: string;
      chatId: string;
      step: string;
      kind: StepKind;
      title: string;
      accountLabel: string;
    } & ModelRef)
  | { type: 'text'; runId: string; chatId: string; step: string; delta: string }
  /** The step's model or account failed; another one is tried next. */
  | { type: 'step-retrying'; runId: string; chatId: string; step: string; reason: string }
  | { type: 'file'; runId: string; chatId: string; step: string; path: string }
  | {
      type: 'step-finished';
      runId: string;
      chatId: string;
      step: string;
      status: StepStatus;
      error?: string;
      costUsd: number | null;
    }
  | {
      type: 'finished';
      runId: string;
      chatId: string;
      status: Exclude<MessageStatus, 'running'>;
      error?: string;
    };

/** Which data changed in the main process, so the UI can refresh it. */
export type DataScope = 'accounts' | 'chats' | 'models';

/** A file in a chat's workspace (its latest version). */
export interface WorkspaceFile {
  path: string;
  size: number;
  mime: string;
  updatedAt: number;
  versions: number;
  /** The step that wrote the latest version. */
  writtenBy: { title: string; modelName: string | null } | null;
}

export const WorkspaceFileInput = z.object({
  chatId: z.string().min(1).max(100),
  path: z.string().min(1).max(300),
});

export interface WorkspaceFileContent {
  path: string;
  content: string;
  mime: string;
  size: number;
  updatedAt: number;
}

export interface ExportFilesResult {
  folder: string;
  count: number;
}

/** A model as the UI sees it (registry data plus whether the user can use it now). */
export interface ModelOption {
  id: string;
  name: string;
  provider: ProviderId;
  tier: 'fast' | 'balanced' | 'best';
  efforts: Effort[];
  usable: boolean;
  /** Current list prices in US dollars per million tokens. */
  inputPerM: number;
  outputPerM: number;
  contextTokens: number;
  notes: string;
}

export interface ModelsInfo {
  models: ModelOption[];
  registry: {
    version: number;
    /** When the model information was last published (YYYY-MM-DD). */
    updatedAt: string;
    source: 'bundled' | 'downloaded';
    autoUpdate: boolean;
    /** When the app last looked for newer information (ms since epoch). */
    lastChecked: number | null;
    lastError: string | null;
  };
}
