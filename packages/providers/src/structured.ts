import type { Effort, TokenUsage } from '@ultimatellm/shared';
import { generateText, NoObjectGeneratedError, Output, type FlexibleSchema } from 'ai';
import { classifyError, ProviderError } from './errors';
import { toTokenUsage, type ChatTurn } from './stream';
import type { Credential, ProviderAdapter } from './types';

export interface GenerateStructuredOptions<T> {
  modelId: string;
  credential: Credential;
  system: string;
  messages: readonly ChatTurn[];
  /** The shape of the answer, sent to the provider as a JSON schema. */
  schema: FlexibleSchema<T>;
  /** A short name for the output, e.g. "plan". Some providers show it to the model. */
  name: string;
  effort?: Effort | undefined;
  signal: AbortSignal;
}

/**
 * Asks a model for a JSON object matching `schema`, using the provider's
 * structured-output mode. Throws a `ProviderError`: `invalid_output` if the
 * model's answer doesn't match the schema.
 */
export async function generateStructured<T>(
  adapter: ProviderAdapter,
  options: GenerateStructuredOptions<T>,
): Promise<{ object: T; usage: TokenUsage }> {
  try {
    const result = await generateText({
      model: adapter.languageModel(options.modelId, options.credential),
      system: options.system,
      messages: options.messages.map((turn) => ({ role: turn.role, content: turn.content })),
      ...(options.effort
        ? { providerOptions: adapter.effortOptions(options.modelId, options.effort) }
        : {}),
      output: Output.object({ schema: options.schema, name: options.name }),
      abortSignal: options.signal,
      maxRetries: 0,
    });
    return { object: result.output, usage: toTokenUsage(result.totalUsage) };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      throw new ProviderError(
        'invalid_output',
        `The model's answer didn't match the expected format.`,
        {
          cause: error,
          ...(error.usage ? { usage: toTokenUsage(error.usage) } : {}),
        },
      );
    }
    throw classifyError(error);
  }
}
