# 07 – Open questions & spikes

## Decisions made

| # | Decision | Outcome |
| --- | --- | --- |
| D1 | Make UltimateLLM open source? (OpenAI's ChatGPT plan sign-in is open to *open-source and locally hosted* apps.) | ✅ **Yes, Apache-2.0** (2026-10-14). The repository is to be made public. See [D-008](decisions.md). |
| D2 | Should the manager answer directly when one model is enough, or always delegate? How are workflow results combined? | ✅ Direct answers for ordinary prompts; workflows write files that the manager presents without rewriting (2026-10-15). See [D-011](decisions.md). |

## Spike 1 – Subscription sign-in vs API keys

✅ **Resolved (2026-10-14):** see the [Spike 1 report](spikes/01-subscription-auth.md).
- **OpenAI:** *Sign in with ChatGPT* plan usage is available to open-source/local apps. UltimateLLM qualifies now that it is open source (D1).
- **Anthropic:** third-party plan login is prohibited. Max plans include $100–200/month of API credits.
- **Google:** reusing Gemini CLI OAuth is prohibited. AI Pro/Ultra include $10/$100 per month of Cloud credits.
- **xAI:** SuperGrok OAuth exists for partners only. API key for now.

## Spike 2 – SDK choice

✅ **Resolved (2026-10-14):** Vercel AI SDK v7 behind our own `ProviderAdapter`. See the [Spike 2 report](spikes/02-sdk-choice.md).

## Open product questions

| # | Question | Current leaning |
| --- | --- | --- |
| Q1 | Should provider credentials sync across devices (end-to-end encrypted) or be entered on each device? | Per device in v1. Optional E2E-encrypted sync later. |
| Q4 | Should library artifacts from **local** (non-private) chats sync to the cloud by default? | Yes (R24). Private chats never sync. |
| Q5 | Offline behavior: what works without internet beyond reading local chats? | Read-only + local models later. |
| Q6 | Who maintains registry scores? Manual curation vs automated eval runs? | Manual + a small eval suite at first. |
| Q7 | Should Review mode remember edits ("always use X for coding") as preferences? | Yes, with a prompt to confirm. |
| Q8 | Cloud agent execution provider and cost model (phase 3b). | Defer. |
| Q9 | App name/branding/logo. Trademark check on "UltimateLLM". Final app ID (currently `com.ultimatellm.desktop`, which can't change after public release). | Before Phase 5. |
| Q10 | Telemetry: none, or opt-in crash reports only? | Opt-in crash reports only. |
