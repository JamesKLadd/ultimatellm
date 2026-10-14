# UltimateLLM

A desktop app (Windows and macOS first) that brings all of your AI providers into one place. A **manager** AI splits each prompt into subtasks, sends each one to the best model you have access to, runs them in parallel and combines the results into one answer. The manager is **Grok bot** by default. Without an xAI account, Claude, ChatGPT or Gemini takes the role, in that order. No particular provider is required.

> **Status:** Phase 1, milestone 1a is done: add your API keys, and chat with streamed answers from the manager provider, with automatic failover between accounts and providers. Planning across several models comes next (1b). See the [roadmap](docs/06-roadmap.md).

## Getting started

**You need:** [Node.js 24](https://nodejs.org) (22.12+ works) and pnpm 10. The easiest way to get pnpm is `corepack enable`, which picks up the exact version from `package.json`.

```bash
pnpm install        # install dependencies
pnpm dev            # run the app with hot reload
```

| Command | What it does |
| --- | --- |
| `pnpm dev` | Starts the app in development mode. UI changes reload instantly; main-process changes restart the app. |
| `pnpm dev:mock` | Same, but with offline **mock providers** instead of the real AIs: any key works (except ones starting with `invalid`), nothing is billed. |
| `pnpm build` | Builds the app into `apps/desktop/out/`. |
| `pnpm test` | Unit tests (Vitest) for all packages. |
| `pnpm test:e2e` | End-to-end tests (Playwright) against the built app. Run `pnpm build` first. |
| `pnpm check` | Everything CI checks quickly: formatting, lint, typecheck, unit tests. |
| `pnpm package` | Builds an unsigned installer for your OS into `apps/desktop/release/`. |
| `pnpm db:generate` | After changing `packages/db/src/schema.ts`, generates the SQL migration. Commit it. |
| `pnpm format` | Fixes formatting with Prettier. |

**Trying it with real AIs:** open *Settings → Accounts* and add an API key. A free [Google AI Studio](https://aistudio.google.com/app/apikey) key is enough to start; Gemini then acts as the manager until you add keys for providers higher in the manager order (Grok, Claude, ChatGPT).

Development builds keep their data in a separate folder (`UltimateLLM-dev` in your OS's app-data directory), so they never touch an installed copy's data.

**Trying a CI build:** each CI run on a pull request or the default branch uploads unsigned installers (`UltimateLLM-Windows` / `UltimateLLM-macOS`) under *Actions → the run → Artifacts*. They aren't code-signed yet:
- **Windows:** in the SmartScreen prompt, choose *More info → Run anyway*.
- **macOS:** right-click the app → *Open*. Or allow it in *System Settings → Privacy & Security*.

## Repository layout

```
apps/desktop/        Electron app: main process, preload, React UI, e2e tests, packaging config
packages/shared/     IPC contract, Zod schemas, settings definitions (shared by main + UI)
packages/providers/  AI provider adapters (Vercel AI SDK), error classification, model registry, mock provider
packages/accounts/   Provider accounts: encrypted keys, validation, priority, health
packages/core/       The orchestrator: picks the manager and models, streams replies with failover
packages/db/         Local SQLite database: Drizzle schema, migrations, data access
packages/ui/         Shared React components (shadcn/ui style) and design tokens
docs/                Product and design docs
```

## Design docs

| Doc | What's in it |
| --- | --- |
| [01 – Product spec](docs/01-product-spec.md) | What the app does, from the user's side. All decisions made so far. |
| [02 – Architecture](docs/02-architecture.md) | Tech stack, process model, data storage, sync, security. |
| [03 – Orchestration (the manager)](docs/03-orchestration.md) | Planning, routing modes, the model knowledge base, execution, compilation, fallback. |
| [04 – Providers & accounts](docs/04-providers-and-accounts.md) | Provider adapters, sign-in types, account pools, priority and failover, usage tracking. |
| [05 – Projects & library](docs/05-projects-and-library.md) | Local and cloud projects, the coding agent, permission modes, artifacts. |
| [06 – Roadmap](docs/06-roadmap.md) | Phased delivery plan. |
| [07 – Open questions](docs/07-open-questions.md) | Decisions still needed and unresolved questions. |
| [Decision log](docs/decisions.md) | Technical decisions with their reasoning. |
| [Spike 1 – Plan sign-in vs API keys](docs/spikes/01-subscription-auth.md) | Which providers let you use your paid plan in UltimateLLM. |
| [Spike 2 – SDK choice](docs/spikes/02-sdk-choice.md) | Why the Vercel AI SDK, verified against all four providers. |

## License

UltimateLLM is open source under the [Apache License 2.0](LICENSE). By contributing, you agree that your contributions are licensed under the same terms.
