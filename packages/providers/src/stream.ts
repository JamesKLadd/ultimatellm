import { streamText } from 'ai';
import { classifyError } from './errors';
import type { Credential, Effort, ProviderAdapter } from './types';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
}

export type ChatStreamEvent =
  { type: 'text'; text: string } | { type: 'finish'; usage: TokenUsage };

export interface StreamChatOptions {
  modelId: string;
  credential: Credential;
  system: string;
  messages: readonly ChatTurn[];
  effort: Effort;
  signal: AbortSignal;
}

/**
 * Streams a chat reply from one model. Yields text as it arrives, then the
 * token usage. Every failure is thrown as a classified `ProviderError` (an
 * abort ends the stream quietly; check `signal.aborted`).
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
      providerOptions: adapter.effortOptions(options.modelId, options.effort),
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
      } else if (part.type === 'error') {
        throw part.error;
      } else if (part.type === 'finish') {
        yield {
          type: 'finish',
          usage: {
            inputTokens: part.totalUsage.inputTokens ?? null,
            outputTokens: part.totalUsage.outputTokens ?? null,
            reasoningTokens: part.totalUsage.outputTokenDetails.reasoningTokens ?? null,
          },
        };
      }
    }
  } catch (error) {
    throw classifyError(error);
  }
}
