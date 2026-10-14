# Spike 2 – Which SDK talks to the providers?

**Date:** 2026-10-14 · **Status:** complete · **Answers:** [07 – Spike 2](../07-open-questions.md#spike-2--sdk-choice)

## Recommendation

Use the **Vercel AI SDK v7** (`ai` + `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/xai`, all Apache-2.0) as the single transport in `packages/providers`. **Don't** add the official SDKs for v1. Keep two escape hatches:

1. **A custom `fetch` per account.** It injects or refreshes OAuth tokens (ChatGPT plan), records rate-limit headers, and adds request logging.
2. **Plain HTTP** for the few management endpoints the AI SDK doesn't cover (listing models, key info).

Add an official SDK only if we hit a real gap. Nothing found so far needs one.

## How it was evaluated

Packages were installed at the newest versions at least 7 days old (`ai@7.0.131`, `@ai-sdk/openai@4.0.87`, `@ai-sdk/anthropic@4.0.75`, `@ai-sdk/google@4.0.90`, `@ai-sdk/xai@5.0.18`, plus `openai@7.30.0`, `@anthropic-ai/sdk@0.132.0`, `@google/genai@2.28.0` for comparison). Each claim below was checked against the packages' type definitions. The key ones were then checked by **capturing the actual HTTP request** the AI SDK builds (a custom `fetch` that records and aborts).

## Capability check

| Need (from the design docs) | AI SDK v7 | Notes |
| --- | --- | --- |
| One streaming interface for all 4 providers | ✅ `streamText` / `generateText` | Same event stream (text, reasoning, tool calls, sources, finish + usage). |
| **Effort / thinking levels** | ✅ `providerOptions` | See the effort mapping below. All four verified on the outgoing request. |
| Built-in **web search** | ✅ all four | `openai.tools.webSearch`, `anthropic.tools.webSearch_20260318`, `google.tools.googleSearch`, `xai.tools.webSearch` (+ `xSearch`). |
| Built-in **code execution** | ✅ all four | `openai.tools.codeInterpreter`, `anthropic.tools.codeExecution_20260120`, `google.tools.codeExecution`, `xai.tools.codeExecution`. |
| **Structured output** (the manager's plan as JSON, checked with Zod) | ✅ `generateObject` / `Output.object` | Zod 4 schemas accepted directly. |
| **Image generation** | ✅ `generateImage` | OpenAI `gpt-image-*`, Google `gemini-*-image` / "nano banana", xAI `grok-imagine-image*`. Anthropic has none. |
| **Video generation** (phase 3) | ✅ `experimental_generateVideo` | Google Veo 3.x, xAI `grok-imagine-video*`. |
| **Voice input** (transcription) | ✅ `transcribe` | OpenAI, Google, xAI transcription models. |
| **Token usage** incl. cached + reasoning tokens | ✅ `usage` | `inputTokenDetails.cacheReadTokens/cacheWriteTokens`, `outputTokenDetails` (reasoning). |
| **Rate-limit headers** (for the account pool) | ✅ `response.headers` + custom `fetch` | Headers are on the result. The account's `fetch` wrapper also reads them for 429 handling. |
| **ChatGPT plan sign-in** request rules ([Spike 1](01-subscription-auth.md)) | ✅ verified | See below. |
| Agent loop for local projects (phase 2) | ✅ `ToolLoopAgent`, tool approval hooks | Our own permission engine wraps tool execution. |
| Testing without API keys | ✅ `ai/test` mocks | `MockLanguageModelV4`, `simulateReadableStream`, mock image/transcription models. |
| Model IDs up to date | ✅ | Typed IDs already list GPT-6.x, Claude 5.5, Gemini 3.x, Grok 4.7. Any string is still accepted. |

### Verified: ChatGPT-plan request rules
With `createOpenAI({ apiKey: <OAuth access token>, fetch })`, `.responses(model)` and `providerOptions.openai = { store: false, systemMessageMode: "developer" }`, the captured request was:

- `POST https://api.openai.com/v1/responses` with `Authorization: Bearer <token>`
- `store: false`, `stream: true`. No `temperature` and no `max_output_tokens` (as long as we don't set them).
- The system prompt is sent as a `developer` item. That's required, because system items are rejected.
- Function tools with `providerOptions.openai.namespace` are sent as `{"type":"namespace", …}`. That's required for plan usage.

So the ChatGPT-plan account type needs **no separate code path**, just a different `apiKey`/`fetch` plus a few forced options.

### Effort mapping (UltimateLLM scale → provider parameter)

Parameter names and request shapes were verified on captured requests (at `high`). The other levels use the same fields:

| Our level | OpenAI `reasoningEffort` | Anthropic | Google (Gemini 3+) `thinkingLevel` | xAI `reasoningEffort` |
| --- | --- | --- | --- | --- |
| `none` | `none` | `thinking: {type: "disabled"}` | `minimal` | `none` |
| `low` | `low` | `effort: "low"` + adaptive thinking | `low` | `low` |
| `medium` | `medium` | `effort: "medium"` + adaptive | `medium` | `medium` |
| `high` | `high` | `effort: "high"` + adaptive | `high` | `high` |
| `max` | `xhigh` / `max` (per model) | `effort: "max"` + adaptive | `high` | `xhigh` |

Supported levels differ per model, so the **model registry** stores which levels each model accepts. `mapEffort()` picks the nearest supported one. Older Gemini 2.5 models use `thinkingBudget` (tokens) instead of levels.

## Why not the official SDKs?

| | AI SDK v7 | Official SDKs |
| --- | --- | --- |
| Packages for our 4 providers | 5 packages + 3 shared helpers (about 23 MB installed) | 3 SDKs (about 64 MB). **xAI has no official TypeScript SDK**, so we'd use OpenAI's SDK pointed at xAI. |
| Unified streaming/tools/usage | Built in | We'd write and maintain 4 normalizers |
| Structured output, agents, image/video/voice | Same API across providers | Different per SDK |
| New provider features | Usually within days | Same day |
| Provider-specific extras | `providerOptions` / custom `fetch` | Native |

The one real advantage of the official SDKs is getting new features on day one. `providerOptions` and the `fetch` hook cover nearly all of that gap.

## Risks & mitigations

- **Very fast release pace:** 140 patch releases of `ai@7` in under four months. → Pin exact versions. Update on purpose, after the 7-day minimum release age, with the provider contract tests (phase 1) as a gate.
- **Abstraction leaks:** some provider-only features may lag. → `providerOptions`, raw `fetch`, and an official SDK as a last resort, kept inside that provider's adapter only.
- **Lock-in:** low. The Apache-2.0 license, and our own `ProviderAdapter` interface sits in front of it, so the orchestrator never imports `ai` directly.
