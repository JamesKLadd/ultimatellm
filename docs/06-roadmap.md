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
- UltimateLLM account sign-in (Supabase Auth).
- Provider accounts for **xAI, OpenAI, Anthropic, Google**: API keys for all four, plus **Continue with ChatGPT** (plan usage) for OpenAI. Priority list UI. Failover, with opt-in plan → API-key fallback. Spend caps. Health checks.
- Onboarding: connect at least one provider (any). Explain plan-included API credits (Claude Max, Google AI Pro/Ultra) and the free Gemini API tier.
- Manager order setting (default xAI → Anthropic → OpenAI → Google) and a "Manager: …" indicator ([D-009](decisions.md)).
- **Development mock provider** (dev builds only): fake models with scripted responses, so the whole flow can be tried without any accounts. The end-to-end tests use it too.
- Model registry v1 (bundled snapshot + remote update) for the four providers.
- The manager: triage → plan → DAG executor → compile, with all **4 output modes** and both **plan modes** (Auto / Review), user overrides, fallback to the next provider in the manager order.
- Chat UI: sidebar, conversation, composer with mode pickers, **live model activity strip**, plan card, sources panel, cost/token display.
- Chat kinds: cloud, local, private.
- Usage page per account.
- Basic library: auto-save generated images. Save docs. List + tags + search. Cloud sync.
- Image generation through the planner.
- Command palette and more keyboard shortcuts (light/dark theme and basic shortcuts shipped in Phase 0).
- **Exit:** daily use as the main AI app.

## Phase 2 – Local projects & coding agent
- Local projects: folder, instructions, memory, files.
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
