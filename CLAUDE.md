# UltimateLLM: notes for AI coding sessions

Electron desktop app (Windows/macOS first) that routes prompts across AI providers, managed by "Grok bot". Product and design docs are in `docs/` (start with `docs/06-roadmap.md` for the current phase and `docs/decisions.md` for why the stack is what it is).

## Commands (run from the repo root)

- `pnpm install`: install dependencies (pnpm 10; only versions published ≥7 days ago, see `pnpm-workspace.yaml`)
- `pnpm check`: format check + lint + typecheck + unit tests. **Run before every push.**
- `pnpm build`, then `pnpm test:e2e`: Playwright end-to-end tests against the built app. On a headless Linux machine, wrap with `xvfb-run -a`.
- `pnpm dev`: run the app with hot reload
- `pnpm db:generate`: after editing `packages/db/src/schema.ts`; commit the generated migration (CI fails if the schema and migrations drift)
- `pnpm format`: fix formatting (Prettier + Tailwind class sorting)

## Layout

- `apps/desktop/src/main`: Electron main process (window, `app://` protocol, security, IPC handlers, DB)
- `apps/desktop/src/preload`: exposes `window.ull` (sandboxed; imports only `@ultimatellm/shared/ipc-channels` at runtime)
- `apps/desktop/src/renderer`: React UI (Zustand for UI state, TanStack Query for data from main)
- `packages/shared`: IPC contract (`ipc.ts`), settings definitions, orchestration types
- `packages/db`: `node:sqlite` + Drizzle 1.0 RC; schema, migrations, stores
- `packages/ui`: shadcn-style components + design tokens (`src/styles/globals.css`)

## Conventions

- **Adding an IPC call:**
  1. Add a channel name in `packages/shared/src/ipc-channels.ts`.
  2. Add its Zod schemas to `invokeContract` and a method to `UllApi` in `packages/shared/src/ipc.ts`.
  3. Add a handler with `handle()` in `apps/desktop/src/main/ipc.ts`.
  4. Add the method to the preload `api`.

  Inputs are validated in main, and only the app's own top-level frame may call.
- **Adding a setting:** add it to `settingDefinitions` (schema + default) in `packages/shared/src/settings.ts`. `createSettingsStore` validates on read and write.
- Security baseline (see `docs/decisions.md` D-001):
  - Never enable `nodeIntegration`, turn off `sandbox`/`contextIsolation`, or loosen the production CSP.
  - Provider calls and secrets live in the main process only.
- Code that doesn't need Electron goes in a package so it can be unit-tested in plain Node.
- Style: Prettier (single quotes, width 100), type-aware ESLint, no floating promises, `import type` for types.

## Gotchas

- TypeScript is pinned to 6.0 (typescript-eslint doesn't support TS 7 yet). Drizzle is pinned to `1.0.0-rc.4` for its `node:sqlite` driver.
- `node:sqlite` is marked external in `electron.vite.config.ts`; migrations are copied to `out/main/migrations` at build time.
- Playwright's Electron launcher disables Chromium's sandbox and forces a light color scheme unless told otherwise. The e2e helper passes `chromiumSandbox` and `colorScheme: null`.
- Code run directly inside `page.evaluate` is exempt from the page's `unsafe-eval` CSP check. Test CSP behavior on a later task (e.g. inside `setTimeout`).
- Chromium refuses to start sandboxed as root; pass `--no-sandbox` only in that case (the app then skips `app.enableSandbox()`).
- `--smoke-test` (e.g. `pnpm exec electron . --smoke-test` in `apps/desktop` after a build, or the packaged binary with that flag) starts the app with a throwaway data folder, checks the UI rendered, and exits with code 0 or 1.
