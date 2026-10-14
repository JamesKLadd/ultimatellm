import type { AccountService } from '@ultimatellm/accounts';
import type { ChatStore, MessageRow, NewMessage } from '@ultimatellm/db';
import {
  modelCandidates,
  modelName,
  ProviderError,
  streamChat,
  type ChatTurn,
  type Effort,
  type ModelTier,
  type ProviderAdapters,
  type TokenUsage,
} from '@ultimatellm/providers';
import {
  rankManagers,
  SendMessageInput,
  type ChatMessage,
  type ChatRunEvent,
  type ChatSummary,
  type ChatWithMessages,
  type DataScope,
  type MessageStatus,
  type OutputMode,
  type ProviderId,
  type SendMessageResult,
} from '@ultimatellm/shared';

/**
 * How each output mode maps to a model tier and reasoning effort for a direct
 * answer (no task splitting yet; planning arrives in milestone 1b).
 */
export const OUTPUT_MODE_SETTINGS: Record<OutputMode, { tier: ModelTier; effort: Effort }> = {
  cheapest: { tier: 'fast', effort: 'low' },
  fastest: { tier: 'fast', effort: 'none' },
  balanced: { tier: 'balanced', effort: 'medium' },
  best: { tier: 'best', effort: 'high' },
};

const SYSTEM_PROMPT =
  'You are the assistant inside UltimateLLM, a desktop app that sends each prompt to the best AI ' +
  'model the user has access to. Answer helpfully, accurately and concisely. Use Markdown when it ' +
  'helps readability (lists, tables, fenced code blocks with a language).';

const NO_ACCOUNTS_ERROR =
  'No AI account is available. Add one in Settings → Accounts, or wait for a rate-limited account to reset.';

export interface ChatEngineOptions {
  accounts: AccountService;
  adapters: ProviderAdapters;
  chats: ChatStore;
  /** The user's saved manager order. */
  managerOrder: () => readonly ProviderId[];
  /** Streams reply progress to the UI. */
  emit: (event: ChatRunEvent) => void;
  /** Tells the UI to refresh data that changed (chat list, account health). */
  changed?: (scope: DataScope) => void;
  now?: () => number;
}

interface Run {
  chatId: string;
  controller: AbortController;
  done: Promise<void>;
}

/** Answers chat messages with the manager provider's models and stores the conversation. */
export class ChatEngine {
  private readonly runs = new Map<string, Run>();
  private readonly now: () => number;

  constructor(private readonly options: ChatEngineOptions) {
    this.now = options.now ?? Date.now;
  }

  listChats(): ChatSummary[] {
    return this.options.chats.listChats().map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    }));
  }

  getChat(id: string): ChatWithMessages | null {
    const chat = this.options.chats.getChat(id);
    if (!chat) return null;
    return {
      chat: {
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt.getTime(),
        updatedAt: chat.updatedAt.getTime(),
      },
      messages: this.options.chats.getMessages(id).map(toChatMessage),
    };
  }

  removeChat(id: string): void {
    for (const run of this.runs.values()) {
      if (run.chatId === id) run.controller.abort();
    }
    this.options.chats.removeChat(id);
    this.options.changed?.('chats');
  }

  /** Saves the user's message and starts the reply. Progress arrives through `emit`. */
  send(rawInput: SendMessageInput): SendMessageResult {
    const input = SendMessageInput.parse(rawInput);
    const now = new Date(this.now());

    let chatId = input.chatId;
    if (chatId) {
      if (!this.options.chats.getChat(chatId)) throw new Error('Chat not found');
      if (this.isRunning(chatId)) {
        throw new Error(
          'Wait for the current reply to finish, or stop it, before sending another.',
        );
      }
    } else {
      chatId = this.options.chats.createChat(titleFrom(input.text), now).id;
    }
    this.options.chats.addMessage(
      { chatId, role: 'user', content: input.text, status: 'complete' },
      now,
    );
    this.options.changed?.('chats');

    const runId = crypto.randomUUID();
    const controller = new AbortController();
    const done = this.reply(runId, chatId, input.outputMode, controller.signal)
      .catch((error: unknown) => {
        // Unexpected bug: still end the run cleanly so the UI doesn't hang.
        const message = error instanceof Error ? error.message : String(error);
        this.options.emit({ type: 'finished', runId, chatId, status: 'error', error: message });
      })
      .finally(() => this.runs.delete(runId));
    this.runs.set(runId, { chatId, controller, done });
    return { chatId, runId };
  }

  stop(runId: string): void {
    this.runs.get(runId)?.controller.abort();
  }

  stopAll(): void {
    for (const run of this.runs.values()) run.controller.abort();
  }

  /** Resolves when a reply has finished (for tests and shutdown). */
  async waitForRun(runId: string): Promise<void> {
    await this.runs.get(runId)?.done;
  }

  hasRuns(): boolean {
    return this.runs.size > 0;
  }

  /** Resolves when every reply has finished, or after `timeoutMs`. */
  async waitForAll(timeoutMs: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => (timer = setTimeout(resolve, timeoutMs)));
    await Promise.race([Promise.allSettled([...this.runs.values()].map((r) => r.done)), timeout]);
    clearTimeout(timer);
  }

  private isRunning(chatId: string): boolean {
    return [...this.runs.values()].some((run) => run.chatId === chatId);
  }

  private async reply(
    runId: string,
    chatId: string,
    mode: OutputMode,
    signal: AbortSignal,
  ): Promise<void> {
    const { accounts, adapters } = this.options;
    const { tier, effort } = OUTPUT_MODE_SETTINGS[mode];
    const history = this.history(chatId);
    const finish = (status: MessageStatus, error?: string) =>
      this.options.emit({ type: 'finished', runId, chatId, status, ...(error ? { error } : {}) });

    const managers = rankManagers(this.options.managerOrder(), accounts.usableProviders());
    let lastFailure: ProviderError | undefined;

    for (const provider of managers) {
      for (const candidate of accounts.candidates(provider)) {
        let accountFailure: ProviderError | undefined;

        for (const modelId of modelCandidates(provider, tier, candidate.models)) {
          if (signal.aborted) {
            this.saveReply(chatId, { content: '', status: 'stopped' });
            return finish('stopped');
          }
          const attempt = {
            provider,
            model: modelId,
            accountId: candidate.account.id,
            accountLabel: candidate.account.label,
          };
          this.options.emit({
            type: 'started',
            runId,
            chatId,
            provider,
            model: modelId,
            modelName: modelName(modelId),
            accountLabel: candidate.account.label,
          });

          let text = '';
          let usage: TokenUsage | undefined;
          try {
            for await (const event of streamChat(adapters[provider], {
              modelId,
              credential: candidate.credential,
              system: SYSTEM_PROMPT,
              messages: history,
              effort,
              signal,
            })) {
              if (event.type === 'text') {
                text += event.text;
                this.options.emit({ type: 'text', runId, chatId, delta: event.text });
              } else {
                usage = event.usage;
              }
            }
          } catch (error) {
            const failure = error instanceof ProviderError ? error : undefined;
            if (signal.aborted || failure?.kind === 'aborted') {
              this.saveReply(chatId, { ...attempt, content: text, status: 'stopped' });
              return finish('stopped');
            }
            const message = failure?.message ?? String(error);
            // Never silently restart an answer the user has already started reading.
            if (text || !failure || failure.kind === 'bad_request' || failure.kind === 'unknown') {
              this.saveReply(chatId, {
                ...attempt,
                content: text,
                status: 'error',
                error: message,
              });
              return finish('error', message);
            }

            lastFailure = failure;
            this.options.emit({
              type: 'retrying',
              runId,
              chatId,
              reason: `${modelName(modelId)} (${candidate.account.label}): ${message}`,
            });
            if (failure.kind === 'auth_invalid') {
              accountFailure = failure;
              break; // The key itself is the problem: no point trying other models.
            }
            if (failure.kind === 'rate_limited') {
              accountFailure = failure;
              break; // Account-wide limit: move on to the next account.
            }
            if (failure.kind === 'quota_exhausted') accountFailure = failure;
            continue; // model_unavailable / quota / server / network: try the next model.
          }

          if (signal.aborted) {
            this.saveReply(chatId, { ...attempt, content: text, status: 'stopped' });
            return finish('stopped');
          }
          if (accounts.recordSuccess(candidate.account.id)) this.options.changed?.('accounts');
          this.saveReply(chatId, {
            ...attempt,
            content: text,
            status: 'complete',
            inputTokens: usage?.inputTokens ?? null,
            outputTokens: usage?.outputTokens ?? null,
            reasoningTokens: usage?.reasoningTokens ?? null,
          });
          return finish('complete');
        }

        if (accountFailure) {
          accounts.recordFailure(candidate.account.id, accountFailure);
          this.options.changed?.('accounts');
        }
      }
    }

    const error = lastFailure
      ? `Every available account failed. Last error: ${lastFailure.message}`
      : NO_ACCOUNTS_ERROR;
    this.saveReply(chatId, { content: '', status: 'error', error });
    finish('error', error);
  }

  private history(chatId: string): ChatTurn[] {
    return this.options.chats
      .getMessages(chatId)
      .filter((message) => message.content.trim() !== '')
      .map((message) => ({ role: message.role, content: message.content }));
  }

  private saveReply(chatId: string, reply: Omit<NewMessage, 'chatId' | 'role'>): void {
    this.options.chats.addMessage({ ...reply, chatId, role: 'assistant' }, new Date(this.now()));
    this.options.changed?.('chats');
  }
}

/** A chat's title: the first line of its first message, shortened. */
export function titleFrom(text: string): string {
  const firstLine = text.trim().split('\n')[0]?.trim() ?? '';
  if (!firstLine) return 'New chat';
  return firstLine.length > 60 ? `${firstLine.slice(0, 57).trimEnd()}…` : firstLine;
}

function toChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    chatId: row.chatId,
    role: row.role,
    content: row.content,
    status: row.status,
    error: row.error,
    provider: row.provider,
    model: row.model,
    modelName: row.model ? modelName(row.model) : null,
    accountLabel: row.accountLabel,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    createdAt: row.createdAt.getTime(),
  };
}
