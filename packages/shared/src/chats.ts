import { z } from 'zod';
import { OutputMode, PlanMode } from './orchestration';
import type { ProviderId } from './providers';

export interface ChatSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export type MessageStatus = 'complete' | 'stopped' | 'error';

export interface ChatMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  /** Markdown text. May be partial if the reply was stopped or failed. */
  content: string;
  status: MessageStatus;
  error: string | null;
  provider: ProviderId | null;
  model: string | null;
  modelName: string | null;
  accountLabel: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: number;
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

/** Progress of one reply, streamed from the main process to the UI. */
export type ChatRunEvent =
  | {
      type: 'started';
      runId: string;
      chatId: string;
      provider: ProviderId;
      model: string;
      modelName: string;
      accountLabel: string;
    }
  | { type: 'text'; runId: string; chatId: string; delta: string }
  /** The current model or account failed before answering; another one is tried next. */
  | { type: 'retrying'; runId: string; chatId: string; reason: string }
  | {
      type: 'finished';
      runId: string;
      chatId: string;
      status: MessageStatus;
      error?: string;
    };

/** Which data changed in the main process, so the UI can refresh it. */
export type DataScope = 'accounts' | 'chats';
