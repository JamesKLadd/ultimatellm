# 01 – Product spec

## Vision

Most people who use AI heavily pay for several providers but use them one at a time. UltimateLLM treats every model you have access to as one pool. A manager model (Grok bot by default) decides which model handles each part of a request, based on your quality/cost/speed preference.

Personal project for now. It may be released later, likely free because users bring their own model access. Pricing will be decided later.

## Core concepts

| Concept | Definition |
| --- | --- |
| **UltimateLLM account** | The app's own user account. Stored in the cloud. Holds cloud chats, cloud projects, the library and settings across devices. |
| **Provider** | An AI company: xAI, OpenAI, Anthropic, Google (v1). More later. |
| **Provider account** | One set of credentials for a provider. A user can have **any number per provider**. |
| **Priority list** | Per provider, the order in which accounts are used. The next one takes over on a usage limit or an account problem. |
| **Manager** | The AI that plans, routes, monitors and compiles. By default it's **Grok bot** (xAI). No provider is required: the role goes to the first provider in the manager order that the user has an account for. |
| **Manager order** | Who manages, and who takes over if it fails. Default: xAI (Grok bot) → Anthropic (Claude) → OpenAI (ChatGPT) → Google (Gemini). The user can reorder it. |
| **Output mode** | `Cheapest` · `Balanced` · `Best` · `Fastest`. Chosen per prompt. Tells the manager what to optimize for. |
| **Plan mode** | `Auto` (the manager plans and starts immediately) or `Review` (the user sees the plan, can edit models/effort/subtasks, then approves). |
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
- R7. **At least one provider account is needed; no specific provider is required.** The manager is the first provider in the manager order (default xAI → Anthropic → OpenAI → Google) with a usable account. The order can be changed in settings. (Grok bot needs an xAI **API** key: a SuperGrok subscription alone doesn't include API access; see [Spike 1](spikes/01-subscription-auth.md).)

### Prompting & orchestration
- R8. Output mode selector next to the composer: Cheapest / Balanced / Best / Fastest.
- R9. Plan mode selector: Auto / Review. In Review, the user can edit the workflow's spec, change any task's model, effort level or instructions, add/remove tasks, then run.
- R10. The user can also force a specific model ("@claude explain this") as an override.
- R11. For requests with distinct parts, the manager plans a **workflow**: a shared spec plus tasks, each assigned to the model best suited to it (by capability and strength). Independent tasks run **in parallel** across providers. Simple requests get a direct answer from the best-suited model.
- R12. Workflow results are **files** in the chat's workspace. The manager presents them in a closing message but does not rewrite them. Every task's output and model stay viewable.
- R13. The manager uses a maintained **model knowledge base** (strengths, cost, speed, context, modalities) and **learns the user's preferences** from feedback.
- R14. If the manager fails, the next provider in the manager order takes over automatically.
- R15. A live **activity strip** shows each active model with a small status bar (queued / working / done / failed).
- R16. A cost and token estimate before running (shown in Review mode). A per-message breakdown after. Running totals.
- R17. Models use the **providers' built-in tools** (web search, image generation, code execution, etc.). The app provides its own tools where providers can't: workspace files for workflows, and files and shell for local projects.

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
