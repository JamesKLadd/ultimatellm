# Decision log

Short records of technical decisions: what was chosen, why, and what would make us revisit it. Newest first.

---

### D-009 · Any provider can manage; xAI is optional (2026-10-14)
**Decision:** No provider is required. The manager is the first provider in the user's **manager order** that has a usable account. The default order is xAI (Grok bot) → Anthropic (Claude) → OpenAI (ChatGPT) → Google (Gemini), and the user can change it. The same list is the fallback order when the active manager fails. This replaces the separate "backup manager".
**Where:** `rankManagers()` and `DEFAULT_MANAGER_PRIORITY` in `packages/shared/src/orchestration.ts`. The setting is `orchestration.managerPriority`.
**Why:**
- Lets people use and test the app without an xAI API account. A SuperGrok subscription doesn't include API access.
- All four providers' current models handle planning (instruction-following + structured JSON).
- One list is simpler than a manager plus a separately configured backup.

**Revisit if:** the eval suite ([03 §3](03-orchestration.md#3-model-knowledge-base-registry)) shows a provider plans noticeably worse. The registry can then steer which of its models manage.

### D-008 · Open source under Apache-2.0 (2026-10-14)
**Decision:** UltimateLLM is open source under the [Apache License 2.0](../LICENSE), and the GitHub repository is public. `main` is the default branch.
**Why:**
- OpenAI's *Sign in with ChatGPT* plan usage is open to open-source, locally hosted apps, so users can spend their ChatGPT plan in UltimateLLM.
- It fits the plan to offer the app for free.
- xAI has said more open-source integrations of SuperGrok sign-in are coming.

Apache-2.0 (rather than MIT) adds an explicit patent grant and a requirement to note changes in modified copies.
**Implications:**
- Never commit secrets: provider keys and OAuth tokens only ever live in the user's OS keychain.
- Contributions are accepted under the same license (Apache-2.0 §5).
- A paid or hosted edition would need OpenAI's interest-form approval for plan usage.

### D-007 · Supply-chain guard: 7-day minimum package age (2026-10-14)
**Decision:** `minimumReleaseAge: 10080` in `pnpm-workspace.yaml`. pnpm only installs versions that have been public for at least 7 days. Dependency install scripts are also blocked except for an explicit allowlist (`onlyBuiltDependencies`).
**Why:** Most malicious npm releases are caught and pulled within hours or days. The cost is getting fixes up to a week later.
**Revisit if:** we urgently need a fresh security fix. Add that one package to `minimumReleaseAgeExclude`.

### D-006 · TypeScript 6.0, not 7 (2026-10-14)
**Decision:** Pin `typescript@~6.0`.
**Why:** TypeScript 7 (the native Go port) is out, but `typescript-eslint` still supports only `<6.1`, and we rely on type-aware lint rules (e.g. `no-floating-promises`).
**Revisit when:** `typescript-eslint` supports TS 7. Faster type checks make it worth switching.

### D-005 · Vercel AI SDK v7 for all provider calls (2026-10-14)
**Decision:** `ai` + `@ai-sdk/{openai,anthropic,google,xai}` behind our own `ProviderAdapter` interface. No official SDKs for now.
**Why:** One streaming/tools/usage API for all four providers, verified to cover effort levels, built-in tools, images, and ChatGPT-plan request rules. Details: [Spike 2](spikes/02-sdk-choice.md).
**Revisit if:** a provider feature we need isn't reachable through `providerOptions` or a custom `fetch`.

### D-004 · Use plan sign-in where providers allow it (2026-10-14)
**Decision:** OpenAI accounts support *Sign in with ChatGPT* plan usage. Anthropic, Google and xAI use API keys for now (with plan-included API credits where they exist).
**Why:** Only OpenAI currently permits third-party apps to use a consumer plan. Details: [Spike 1](spikes/01-subscription-auth.md).
**Follow-up:** made eligible for OpenAI's open-source path by D-008.

### D-003 · `node:sqlite` + Drizzle 1.0 RC for the local database (2026-10-14)
**Decision:** Use Node's built-in SQLite (in Electron 44's Node 24) with `drizzle-orm@1.0.0-rc.4` (exact pin), instead of `better-sqlite3`.
**Why:** No native module means:
- no rebuilding for Electron's ABI
- the same driver in unit tests (plain Node) and the app
- trivial macOS universal builds later

Tested in Electron 44: works in the main process, with FTS5 (library search) and JSON1. Stable Drizzle (0.45) has no `node:sqlite` driver; the 1.0 RC has one and has been out since June 2026.
**Revisit when:** Drizzle 1.0 is final (upgrade), or if `node:sqlite` misbehaves (fall back to `better-sqlite3`; only `packages/db/src/client.ts` changes).

### D-002 · electron-vite + electron-builder instead of Electron Forge (2026-10-14)
**Decision:** `electron-vite@5` (with Vite 7) for dev/build and `electron-builder@26` for installers, signing and (later) auto-update.
**Why:**
- Forge's Vite plugin has long-standing problems packaging external modules, and Forge recommends `node-linker=hoisted` when used with pnpm.
- electron-vite bundles everything (the packaged app has no `node_modules` at all), gives hot reload for the UI and quick restarts for the main process.
- electron-builder has mature NSIS/DMG output, notarization, Azure Trusted Signing and `electron-updater`.

**Revisit when:** `electron-vite@6` (Vite 8 support, released 2026-10-14) has matured. Upgrade both together.

### D-001 · Security baseline for the desktop app (2026-10-14)
**Decision:**
- Every renderer is sandboxed, with context isolation and no Node integration.
- The UI is served from a custom `app://ultimatellm` protocol with a strict CSP (no inline scripts, no `eval`, no network).
- Navigation, new windows and `<webview>` are blocked, and all permissions are denied by default.
- IPC calls are only accepted from the app's own top-level frame and are validated with Zod.
- Electron fuses disable RunAsNode, `NODE_OPTIONS`, inspector flags and loading code outside the signed `app.asar`.

**Why:** The renderer will display model output (untrusted text, markdown, code). If something in it ever escapes, it should find nothing useful to attack.
**Tests:** `apps/desktop/src/main/security/policy.test.ts` and `apps/desktop/e2e/app.spec.ts`.
