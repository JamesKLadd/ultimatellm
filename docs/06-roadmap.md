# 06 – Roadmap

Each phase ends with something usable. No dates; quality over speed.

## Phase 0 – Foundations & research
- **Spike 1: subscription sign-in vs API keys** (must finish before building account flows). See [07](07-open-questions.md).
- Spike 2: Vercel AI SDK vs official SDKs (effort mapping, usage headers, built-in tools, image gen).
- Monorepo scaffold (pnpm + Turborepo), Electron Forge + Vite + React + Tailwind + shadcn/ui.
- Secure Electron baseline (context isolation, typed preload IPC, CSP).
- SQLite + Drizzle setup, CI (lint, typecheck, tests) on Windows + macOS runners.
- **Exit:** an empty app shell that builds and runs on both OSes, with CI green.

## Phase 1 – v1 MVP: multi-provider chat with Grok bot
- UltimateLLM account sign-in (Supabase Auth).
- Provider accounts for **xAI, OpenAI, Anthropic, Google** (API keys and/or whatever Spike 1 allows). Priority list UI. Failover. Spend caps. Health checks.
- xAI-required onboarding.
- Model registry v1 (bundled snapshot + remote update) for the four providers.
- Grok bot: triage → plan → DAG executor → compile, with all **4 output modes** and both **plan modes** (Auto / Review), user overrides, backup manager.
- Chat UI: sidebar, conversation, composer with mode pickers, **live model activity strip**, plan card, sources panel, cost/token display.
- Chat kinds: cloud, local, private.
- Usage page per account.
- Basic library: auto-save generated images. Save docs. List + tags + search. Cloud sync.
- Image generation through the planner.
- Light/dark theme, command palette, core keyboard shortcuts.
- **Exit:** daily use as the main AI app.

## Phase 2 – Local projects & coding agent
- Local projects: folder, instructions, memory, files.
- Coding agent tool loop, diff viewer, integrated terminal.
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
