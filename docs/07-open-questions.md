# 07 – Open questions & spikes

## Spike 1 – Subscription sign-in vs API keys

**Goal:** before building account flows, find out for each provider whether a user can legitimately connect their **paid consumer plan** (instead of an API key) to a third-party desktop app. Treat API keys as the fallback, not the default, until this is answered.

**Starting point (as of planning, must be re-verified, since policies change often):**
- Consumer plans (ChatGPT Plus/Pro, Claude Pro/Max, Gemini/Google AI plans, SuperGrok/X Premium) are generally licensed for the provider's own apps. API access is usually a separate product billed per token.
- Some providers let you sign in with your plan in **their own** developer tools (e.g. ChatGPT sign-in for Codex, Claude plans in Claude Code, Google account sign-in for Gemini CLI). Whether **third-party apps** may use those sign-ins is the key question. Some providers have explicitly prohibited it, and using tokens against the terms can get accounts banned.
- SuperGrok / X Premium don't include xAI API credits, so Grok bot will likely need an xAI API key either way.

**For each provider (xAI, OpenAI, Anthropic, Google), answer:**
1. Is there an official OAuth / "Sign in with <provider>" for third-party apps that grants model access billed to the user's plan or account?
2. If only first-party tools support plan sign-in: do the terms allow a third-party app to **launch the user's own installed official CLI** (Codex CLI / Claude Code / Gemini CLI) as a subprocess on the user's machine? Is that reliable enough to build on (streaming, model choice, effort control, usage reporting)?
3. Are there partner/developer programs that allow plan-billed access?
4. What does each plan expose about usage limits?

**Deliverable:** a table of provider → supported auth method(s) → limits → ToS links, plus a recommendation. The `ProviderAdapter.authTypes` design already allows mixing methods per provider.

## Spike 2 – SDK choice
Compare the Vercel AI SDK and the official SDKs on: reasoning/effort controls, built-in tools (web search, code execution), image generation, streaming of reasoning summaries, access to usage and rate-limit headers, and how quickly each supports new models. Recommend one, or a hybrid.

## Open product questions

| # | Question | Current leaning |
| --- | --- | --- |
| Q1 | Should provider credentials sync across devices (end-to-end encrypted) or be entered on each device? | Per device in v1. Optional E2E-encrypted sync later. |
| Q2 | Default compile strategy when Grok bot can't tell? | `sectioned` (verbatim outputs + short connecting text). |
| Q3 | Should Grok bot be allowed to **answer directly** when it's the best fit, or always delegate? | Allow it. It's cheaper and faster for simple prompts. |
| Q4 | Should library artifacts from **local** (non-private) chats sync to the cloud by default? | Yes (R24). Private chats never sync. |
| Q5 | Offline behavior: what works without internet beyond reading local chats? | Read-only + local models later. |
| Q6 | Who maintains registry scores? Manual curation vs automated eval runs? | Manual + a small eval suite at first. |
| Q7 | Should Review mode remember edits ("always use X for coding") as preferences? | Yes, with a prompt to confirm. |
| Q8 | Cloud agent execution provider and cost model (phase 3b). | Defer. |
| Q9 | App name/branding/logo. Trademark check on "UltimateLLM". | Later. |
| Q10 | Telemetry: none, or opt-in crash reports only? | Opt-in crash reports only. |
