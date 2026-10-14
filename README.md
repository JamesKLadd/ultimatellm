# UltimateLLM

A desktop app (Windows and macOS first) that brings all of your AI providers into one place. **Grok bot** acts as the manager: it splits each prompt into subtasks, sends each one to the best model you have access to, runs them in parallel and combines the results into one answer.

> Status: **planning**. No application code yet. The design lives in [`docs/`](docs/).

## Design docs

| Doc | What's in it |
| --- | --- |
| [01 – Product spec](docs/01-product-spec.md) | What the app does, from the user's side. All decisions made so far. |
| [02 – Architecture](docs/02-architecture.md) | Tech stack, process model, data storage, sync, security. |
| [03 – Orchestration (Grok bot)](docs/03-orchestration.md) | Planning, routing modes, the model knowledge base, execution, compilation, fallback. |
| [04 – Providers & accounts](docs/04-providers-and-accounts.md) | Provider adapters, account pools, priority and failover, usage tracking. |
| [05 – Projects & library](docs/05-projects-and-library.md) | Local and cloud projects, the coding agent, permission modes, artifacts. |
| [06 – Roadmap](docs/06-roadmap.md) | Phased delivery plan, starting with the v1 scope. |
| [07 – Open questions & spikes](docs/07-open-questions.md) | Unresolved decisions and the research to do before building, including the subscription sign-in investigation. |
