import type { Effort, TokenUsage } from '@ultimatellm/shared';
import { stepCountIs, streamText, type LanguageModelUsage, type ToolSet } from 'ai';
import { classifyError, ProviderError } from './errors';
import type { Credential, ProviderAdapter } from './types';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type ChatStreamEvent =
  | { type: 'text'; text: string }
  /** The model started calling a tool; its input is still streaming in. */
  | { type: 'tool-start'; toolName: string }
  | { type: 'finish'; usage: TokenUsage };

export interface StreamChatOptions {
  modelId: string;
  credential: Credential;
  system: string;
  messages: readonly ChatTurn[];
  /** A level the model supports, or undefined for the provider's default. */
  effort?: Effort | undefined;
  signal: AbortSignal;
  /** Tools the model may call. They run locally, in this process. */
  tools?: ToolSet | undefined;
  /** The most model calls in one tool loop. */
  maxSteps?: number | undefined;
}

export function toTokenUsage(usage: LanguageModelUsage): TokenUsage {
  return {
    inputTokens: usage.inputTokens ?? null,
    cachedInputTokens: usage.inputTokenDetails.cacheReadTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    reasoningTokens: usage.outputTokenDetails.reasoningTokens ?? null,
  };
}

/**
 * Streams a reply from one model, running its tool calls (if `tools` are
 * given) until it answers or `maxSteps` model calls have been made. Yields
 * text as it arrives, then the token usage of all steps. Every failure is
 * thrown as a classified `ProviderError`, and stopping (via `signal`) as an
 * `aborted` one.
 */
export async function* streamChat(
  adapter: ProviderAdapter,
  options: StreamChatOptions,
): AsyncGenerator<ChatStreamEvent> {
  try {
    const result = streamText({
      model: adapter.languageModel(options.modelId, options.credential),
      system: options.system,
      messages: options.messages.map((turn) => ({ role: turn.role, content: turn.content })),
      ...(options.effort
        ? { providerOptions: adapter.effortOptions(options.modelId, options.effort) }
        : {}),
      ...(options.tools
        ? { tools: options.tools, stopWhen: stepCountIs(options.maxSteps ?? 10) }
        : {}),
      abortSignal: options.signal,
      // The caller fails over to other models/accounts instead of retrying here.
      maxRetries: 0,
      // Errors are handled below. The SDK's default logs them to the console,
      // request body (the user's prompt) included, which we don't want.
      onError: () => {},
    });
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        yield { type: 'text', text: part.text };
      } else if (part.type === 'tool-input-start') {
        yield { type: 'tool-start', toolName: part.toolName };
      } else if (part.type === 'error') {
        throw part.error;
      } else if (part.type === 'abort') {
        // A stopped stream ends quietly; callers must not mistake it for a full answer.
        throw new ProviderError('aborted', 'Cancelled');
      } else if (part.type === 'finish') {
        yield { type: 'finish', usage: toTokenUsage(part.totalUsage) };
      }
    }
    if (options.signal.aborted) throw new ProviderError('aborted', 'Cancelled');
  } catch (error) {
    throw classifyError(error);
  }
}
