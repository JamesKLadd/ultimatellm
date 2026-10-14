# 05 – Projects & library

## Projects (R18–R21)

Modeled after Claude's local vs. cloud projects.

| | Local project | Cloud project |
| --- | --- | --- |
| Backed by | A folder on this machine (git optional) | A **GitHub repository** (required) |
| Available on | This device | Every device signed into the user's UltimateLLM account |
| Chats live | Locally (or private) | In the cloud |
| Agent runs | On this machine, in the folder | See "Cloud execution" below |
| Instructions / memory / files | Stored locally + optional sync of instructions | Synced |

### Project context
- **Instructions:** a project-level system prompt (like `CLAUDE.md`). If the repo contains `CLAUDE.md` / `AGENTS.md`, they are read automatically.
- **Memory:** a short, editable notes file the agent can add to ("user prefers pnpm", "tests live in /spec"). Shown in project settings.
- **Files:** attached reference docs. For code projects, the agent reads the repo itself through tools instead of having everything uploaded.

### Coding agent
The coding agent is an agent loop that uses the app's own tools (providers can't reach the user's disk):

```
tools: read_file, list_dir, search (ripgrep), edit_file (diff-based), write_file,
       run_command (in a terminal per project), git_status/diff/commit/branch,
       + provider built-in web search
```

How it fits with the manager: for a project prompt, the manager plans as usual. Coding subtasks go to an **agent subtask type**. That subtask runs the tool loop with the chosen model (e.g. the best coding model for the mode) instead of a single call. Non-coding subtasks (research, docs, images) run normally in parallel.

**Parallel agents and file conflicts:** two agent subtasks may not edit the same project at once unless each runs in its own **git worktree**. That's the v2 approach. In v1, project agent subtasks run one at a time.

### Permission modes (R21)
- **Approval:** reads/searches run freely. Every edit shows a diff to accept/reject. Every command needs approval (with an "always allow this command" option).
- **Auto:** edits and commands inside the project folder run without asking. A **deny list** still asks or blocks: commands touching paths outside the project, `rm -rf`-style deletes, `git push --force`, network installs (configurable), and anything that reads credential files.
- A per-project allowlist is stored in project settings. All actions are logged in a timeline the user can review and undo (edits are checkpointed, so you can restore to before a turn).

### Cloud execution (phase 3)
Cloud projects should work from any device, and a phone will eventually have no local disk to work in. That means the agent needs somewhere else to run:
1. **Phase 3a (simple):** a cloud project on desktop = an automatic clone of the GitHub repo into a managed folder, plus synced chats/instructions/memory. The agent still runs locally. Pushing branches / opening PRs happens through GitHub.
2. **Phase 3b (full):** the agent runs in a **remote sandbox container** (e.g. Fly.io Machines, Modal, E2B or similar) that clones the repo, so a task can keep running with the laptop closed and be started from mobile later. This adds real infrastructure and cost. Decide when we get there.

GitHub connection: a **GitHub App** (preferred over a personal access token) with OAuth to list repos, clone, push branches and open PRs.

## Library (R22–R24)

### What gets saved
- Any **image / video / audio** output from a generation tool is saved automatically.
- **Documents:** long-form outputs (reports, code files, specs) can be saved with one click ("Save to library"). The manager can mark outputs as artifacts when it's obvious (e.g. "write me a cover letter").

### Structure
```
Artifact        id, title, type(doc|image|video|audio), project_id?, tags[], source chat/message,
                created_by {provider, model}, current_version
ArtifactVersion artifact_id, n, storage_ref, mime, size, created_at, created_by(user|model), note
```

- **Storage:** binary content in object storage (Supabase Storage → S3/R2 later). The local cache is kept in the app data directory. Docs are stored as Markdown.
- **Organization:** filter by project, type and tags. **Full-text search** over titles, tags, doc content and image prompts (SQLite FTS5 locally, Postgres full-text search in the cloud).
- **Editing:**
  - Docs: built-in Markdown editor with a "revise with AI" action.
  - Images: "edit with AI" (inpaint/variation through a provider that supports it) creates a new version. Basic crop/resize locally.
  - Every save creates a version. Version history allows view, compare (for docs) and restore.
- **Generation routing (R23):** image/video/audio requests go through the same planner. The registry knows which signed-in providers can generate which media and at what price/quality, so the output mode applies here too.
- **Private chats:** their artifacts are not uploaded unless the user explicitly saves them to the cloud library.
