/** Tokens used by one model call, as reported by the provider (null when unknown). */
export interface TokenUsage {
  /** All input tokens, cached ones included. */
  inputTokens: number | null;
  /** Input tokens served from the provider's prompt cache (billed at a lower rate). */
  cachedInputTokens: number | null;
  /** All output tokens, reasoning included. */
  outputTokens: number | null;
  /** Output tokens spent on reasoning, if the provider reports them. */
  reasoningTokens: number | null;
}

export const EMPTY_USAGE: Readonly<TokenUsage> = Object.freeze({
  inputTokens: null,
  cachedInputTokens: null,
  outputTokens: null,
  reasoningTokens: null,
});

/** Adds token counts; a total stays null only if every part is null. */
export function addUsage(...usages: readonly TokenUsage[]): TokenUsage {
  const sum = (key: keyof TokenUsage) =>
    usages.reduce<number | null>((total, usage) => {
      const value = usage[key];
      return value === null ? total : (total ?? 0) + value;
    }, null);
  return {
    inputTokens: sum('inputTokens'),
    cachedInputTokens: sum('cachedInputTokens'),
    outputTokens: sum('outputTokens'),
    reasoningTokens: sum('reasoningTokens'),
  };
}
