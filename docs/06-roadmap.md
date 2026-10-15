# 06 – Roadmap

Each phase ends with something usable. No dates; quality over speed.

## Phase 0 – Foundations & research ✅
- ✅ **Spike 1: subscription sign-in vs API keys:** [report](spikes/01-subscription-auth.md). OpenAI plan sign-in is possible (UltimateLLM is now open source under Apache-2.0, which makes it eligible). Anthropic, Google and xAI need API keys for now (plan-included API credits where available).
- ✅ **Spike 2: SDK choice:** [report](spikes/02-sdk-choice.md). Vercel AI SDK v7.
- ✅ Monorepo scaffold (pnpm + Turborepo), electron-vite + electron-builder, React + Tailwind + shadcn-style components ([D-002](decisions.md)).
- ✅ Secure Electron baseline: sandbox, `app://` protocol + strict CSP, typed and validated IPC, navigation/permission lockdown, fuses ([D-001](decisions.md)).
- ✅ Local SQLite (`node:sqlite`) + Drizzle with migrations; the theme setting is stored in it ([D-003](decisions.md)).
- ✅ App shell: sidebar (New chat / Chats / Projects / Library), custom title bar, composer with output-mode and plan-mode pickers, settings dialog with System/Light/Dark theme, native menu with shortcuts.
- ✅ CI: format, lint, typecheck, unit tests, migration drift check, end-to-end tests on Linux; build + end-to-end tests + unsigned installers + packaged-app smoke test on Windows and macOS.
- **Exit:** an empty app shell that builds and runs on Windows and macOS, with CI green.

## Phase 1 – v1 MVP: multi-provider chat with the manager

Delivered in milestones, each one testable on its own.

### 1a – Chat with your own accounts ✅
- API-key accounts for **xAI, Anthropic, OpenAI, Google**: checked against the provider when added, encrypted with the OS keychain, several per provider with a priority order.
- Account health: rate-limited / out-of-credit accounts pause and come back on their own; rejected keys wait for "Check again".
- Manager order setting (default xAI → Anthropic → OpenAI → Google) and a "Manager: …" indicator ([D-009](decisions.md)).
- **Direct answers:** the manager provider answers each prompt itself, with its model picked by output mode (fast / balanced / best tier + reasoning effort). Failover goes to the next model, then the next account, then the next provider in the manager order.
- Streaming chat UI: conversation with Markdown, live activity strip, Stop, local chat history in the sidebar.
- **Mock providers** for development and tests (`pnpm dev:mock`): offline models with scripted replies ([D-010](decisions.md)).

### 1b – The workflow manager
- ✅ Model registry v1 (`packages/registry`): prices, speed, per-task scores, manager models, `@mention` names; routing rules per output mode.
- Registry updates: the app downloads newer versions of the registry file from the repository.
- **Triage:** the manager either answers directly (picking the model and effort) or plans a **workflow**. `@mentions` pin a model and skip planning.
- **Workflows:** a shared **spec** (file layout, interfaces, data formats) plus a task graph, each task assigned to the best usable model for it. Independent tasks run in parallel, with account and model failover.
- **Workspace:** every chat has versioned files. Tasks write them with tools (`list_files`, `read_file`, `write_file`); follow-up prompts edit them. Files panel with viewer and export to a folder.
- **Wrap-up:** the manager's closing message lists what was made and how to use it, without rewriting the files.
- Both **plan modes**: Auto, and Review (a plan card to edit the spec, tasks, models and effort, then Run). Activity strip with one status bar per task, Sources view and cost per message.

### 1c – Tools: research and media
- Provider **web search** for research tasks, with sources.
- **Image generation** (Gemini, Grok Imagine, OpenAI) writing images into the workspace, routed by output mode.
- Registry **capability flags**: a task that needs a tool goes to a provider that has it.

### 1d – Integrate and preview
- An **integration** step assembles the project from the workspace.
- A **sandboxed preview** window for web results (HTML/JS games and apps).
- Errors from the preview feed **one automatic fix round**.

### 1e – Plans, limits and usage
- **Continue with ChatGPT** (plan usage) for OpenAI, with opt-in plan → API-key fallback.
- Spend caps per account, health checks, usage page per account.

### 1f – UltimateLLM accounts and sync
- UltimateLLM sign-in (Supabase Auth). Chat kinds: cloud, local, private.

### 1g – Library and polish
- Library: auto-save images and files, tags + search, cloud sync.
- Command palette and more keyboard shortcuts.

**Phase 1 exit:** daily use as the main AI app.

## Phase 2 – Local projects & coding agent
- Local projects: folder, instructions, memory, files. The workspace tools from 1b and the integrate/preview loop from 1d work on a real folder.
- Coding agent tool loop, diff viewer, integrated terminal.
- Plan-funded agent backends where allowed: **Codex app-server** with the ChatGPT-plan token, and an optional **Claude Code bridge** that runs the user's own signed-in Claude Code (confirm with Anthropic before shipping publicly; see [Spike 1](spikes/01-subscription-auth.md)).
- Approval / Auto permission modes, deny list, action timeline, checkpoints.
- Feedback (👍/👎) → preference profile → personalized routing.
- Library editing + version history. Voice input.
- **Exit:** the app can replace Claude Code / Codex desktop for local work.

## Phase 3 – Cloud projects
- GitHub App integration. Cloud projects tied to repos, synced across devices (3a).
- Remote sandbox execution (3b), if still wanted.
- Video/audio generation in the library.
- Parallel agents with git worktrees.

## Phase 4 – Expansion
- More providers (Mistral, DeepSeek, OpenRouter, Meta/Llama hosts, local Ollama/LM Studio).
- Linux build. Web and mobile clients (reusing `packages/core` + `packages/ui`).
- "Compare models side by side."
- Distribution/monetization decisions.

## Phase 5 – Release readiness (if going public)
- Code signing + notarization, auto-update channels, crash reporting (opt-in), privacy policy and terms, provider ToS review, onboarding polish.
