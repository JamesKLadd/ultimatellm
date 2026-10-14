# 01 – Product spec

## Vision

Most people who use AI heavily pay for several providers but use them one at a time. UltimateLLM treats every model you have access to as one pool. A manager model (Grok bot) decides which model handles each part of a request, based on your quality/cost/speed preference.

Personal project for now. It may be released later, likely free because users bring their own model access. Pricing will be decided later.

## Core concepts

| Concept | Definition |
| --- | --- |
| **UltimateLLM account** | The app's own user account. Stored in the cloud. Holds cloud chats, cloud projects, the library and settings across devices. |
| **Provider** | An AI company: xAI, OpenAI, Anthropic, Google (v1). More later. |
| **Provider account** | One set of credentials for a provider. A user can have **any number per provider**. |
| **Priority list** | Per provider, the order in which accounts are used. The next one takes over on a usage limit or an account problem. |
| **Grok bot** | The manager. Plans, routes, monitors and compiles. Requires an xAI API key. |
| **Output mode** | `Cheapest` · `Balanced` · `Best` · `Fastest`. Chosen per prompt. Tells Grok bot what to optimize for. |
| **Plan mode** | `Auto` (Grok bot plans and starts immediately) or `Review` (the user sees the plan, can edit models/effort/subtasks, then approves). |
| **Chat** | `Cloud` (synced), `Local` (on the device), or `Private` (local only, never synced, never uploaded). |
| **Project** | `Local` (a folder on this machine) or `Cloud` (linked to a GitHub repo, available on every signed-in device). Has its own instructions, files and memory. |
| **Library** | Saved artifacts: documents, images, video/audio. Synced to the cloud, versioned, editable, organized by project + tags + search. |

## Requirements

### Accounts & providers
- R1. Sign in to xAI, OpenAI, Anthropic and Google in v1, with multiple accounts per provider.
- R2. Prefer a **real sign-in / plan-based** connection where it is legitimately possible. Otherwise use API keys. Per [Spike 1](spikes/01-subscription-auth.md): OpenAI supports ChatGPT plan sign-in. Anthropic, Google and xAI need API keys for now, though Claude Max and Google AI Pro/Ultra include monthly API credits.
- R3. A per-provider priority list that the user can reorder.
- R4. Automatic failover to the next account when an account hits a usage limit **or** has a problem (bad auth, billing failure, repeated errors).
- R5. Optional user-set spend caps per account (only applies to API-key accounts).
- R6. A usage view per account: tokens used, spend, rate-limit/usage status.
- R7. **An xAI API key is required** before the app can be used, because it powers Grok bot. (A SuperGrok subscription alone doesn't include API access; see [Spike 1](spikes/01-subscription-auth.md).)

### Prompting & orchestration
- R8. Output mode selector next to the composer: Cheapest / Balanced / Best / Fastest.
- R9. Plan mode selector: Auto / Review. In Review, the user can change any subtask's model, effort level or wording, add/remove subtasks, then run.
- R10. The user can also force a specific model ("use Claude for this") as an override.
- R11. Grok bot splits work into subtasks and runs independent ones **in parallel** across providers.
- R12. Grok bot **compiles** the outputs into the final answer. It assembles and connects them but does not rewrite their content. Raw per-model outputs stay viewable.
- R13. Grok bot uses a maintained **model knowledge base** (strengths, cost, speed, context, modalities) and **learns the user's preferences** from feedback.
- R14. If Grok bot fails, a backup manager takes over automatically.
- R15. A live **activity strip** shows each active model with a small status bar (queued / working / done / failed).
- R16. A cost and token estimate before running (shown in Review mode). A per-message breakdown after. Running totals.
- R17. Models use the **providers' built-in tools** (web search, code execution, etc.). The exception is local projects, where the app itself must perform file and shell actions.

### Projects
- R18. Local projects: a coding agent that works in a folder on disk, like Claude Code / Codex desktop.
- R19. Cloud projects: tied to a GitHub repo and available on any device signed into the user's UltimateLLM account.
- R20. Per-project instructions, files and memory.
- R21. Agent permission modes: **Auto** (acts freely within the project) and **Approval** (asks before edits/commands).

### Library
- R22. Stores documents, images, video and audio produced by the AIs.
- R23. Image (and later video/audio) generation goes to whichever signed-in providers support it.
- R24. Cloud-synced. Organized by project, tags and full-text search. Editable, with version history.

### App & UX
- R25. Electron desktop app. Windows + macOS first, Linux later. Mobile/web later.
- R26. Look and feel similar to Claude and ChatGPT/Codex: left sidebar (chats, projects, library), central conversation, composer at the bottom.
- R27. Light/dark themes, keyboard-first navigation (command palette, shortcuts), voice input.

## Non-goals for v1
- Side-by-side "ask several models and compare". Later.
- Mobile/web clients.
- Linux builds.
- Monetization.
- Cloud project execution (cloud projects arrive in a later phase; see [06](06-roadmap.md)).
