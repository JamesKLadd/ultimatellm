import type { AccountService } from '@ultimatellm/accounts';
import type { ChatStore, MessageRow, WorkspaceStore } from '@ultimatellm/db';
import {
  classifyError,
  generateStructured,
  ProviderError,
  streamChat,
  type ChatTurn,
  type ProviderAdapters,
} from '@ultimatellm/providers';
import { pricesAt, type ModelRegistry } from '@ultimatellm/registry';
import {
  ApprovePlanInput,
  EMPTY_USAGE,
  MANAGER_NAMES,
  PROVIDER_NAMES,
  rankManagers,
  SendMessageInput,
  type ChatRunEvent,
  type ChatSummary,
  type ChatWithMessages,
  type DataScope,
  type MessageStatus,
  type ModelOption,
  type ModelRef,
  type ProviderId,
  type SendMessageResult,
  type TokenUsage,
  type WorkspaceFile,
  type WorkspaceFileContent,
} from '@ultimatellm/shared';
import { estimatePlan } from './estimate';
import { NO_ACCOUNTS_ERROR, StopFailover, withFailover, type Attempt } from './failover';
import { runGraph, type GraphStatus } from './graph';
import { parseMentions, type Pin } from './mentions';
import {
  DIRECT_KEY,
  directTask,
  draftToRaw,
  modelsForPrompt,
  OUTPUT_MODE_SETTINGS,
  PlanDraft,
  recommendations,
  recommendedModel,
  repairPlan,
  type Plan,
  type PlannedTask,
  type PlanningContext,
  type RawPlan,
} from './planner';
import { ModelPool } from './pool';
import {
  directSystem,
  plannerRequest,
  plannerSystem,
  WRAPUP_SYSTEM,
  workerSystem,
  workerTask,
  wrapupRequest,
} from './prompts';
import { RunRecorder } from './recorder';
import { modelRef, planView, toChatMessage } from './views';
import { mimeFor, workspaceTools, type WorkspaceAccess } from './workspace';

const PLAN_KEY = 'plan';
const WRAPUP_KEY = 'wrapup';
/** Model calls a task may make in its tool loop. */
const TASK_MAX_STEPS = 16;
/** Model calls a direct answer may make when it can use the workspace. */
const DIRECT_MAX_STEPS = 8;

export interface ChatEngineOptions {
  accounts: AccountService;
  adapters: ProviderAdapters;
  chats: ChatStore;
  workspace: WorkspaceStore;
  /** The model registry in use (bundled or downloaded). */
  registry: () => ModelRegistry;
  /** The user's saved manager order. */
  managerOrder: () => readonly ProviderId[];
  /** Streams reply progress to the UI. */
  emit: (event: ChatRunEvent) => void;
  /** Tells the UI to refresh data that changed (chat list, account health). */
  changed?: (scope: DataScope) => void;
  now?: () => number;
  /** Most workflow tasks running at the same time. */
  concurrency?: number;
}

interface Run {
  runId: string;
  chatId: string;
  messageId: string;
  controller: AbortController;
  recorder: RunRecorder;
  done: Promise<void>;
  /** Set while a plan waits for the user to review it. */
  approve?: (input: ApprovePlanInput) => void;
}

interface Outcome {
  status: Exclude<MessageStatus, 'running'>;
  content: string;
  error?: string;
  /** Who wrote `content`. */
  writer?: Attempt | undefined;
}

/**
 * Answers chat messages: the manager either answers directly with the best
 * model for the request or runs a workflow of tasks that write files, then
 * wraps up (docs/03-orchestration.md). Saves everything as it goes.
 */
export class ChatEngine {
  private readonly runs = new Map<string, Run>();
  private readonly now: () => number;
  private readonly pool: ModelPool;

  constructor(private readonly options: ChatEngineOptions) {
    this.now = options.now ?? Date.now;
    this.pool = new ModelPool(options.accounts, options.registry, this.now);
  }

  // --- Chats ------------------------------------------------------------------

  listChats(): ChatSummary[] {
    return this.options.chats.listChats().map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    }));
  }

  getChat(id: string): ChatWithMessages | null {
    const { chats, workspace } = this.options;
    const chat = chats.getChat(id);
    if (!chat) return null;
    const registry = this.options.registry();
    const rows = chats.getMessages(id);
    const ids = rows.map((row) => row.id);
    const plans = new Map(chats.getPlans(ids).map((plan) => [plan.messageId, plan]));
    const steps = chats.getSteps(ids);
    const files = new Map<string, string[]>();
    for (const { messageId, stepKey, path } of workspace.writtenBy(ids)) {
      const key = `${messageId}\n${stepKey}`;
      files.set(key, [...(files.get(key) ?? []), path].sort());
    }
    return {
      chat: {
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt.getTime(),
        updatedAt: chat.updatedAt.getTime(),
      },
      messages: rows.map((row) =>
        toChatMessage(
          row,
          registry,
          plans.get(row.id),
          steps.filter((step) => step.messageId === row.id),
          files,
        ),
      ),
    };
  }

  removeChat(id: string): void {
    for (const run of this.runs.values()) {
      if (run.chatId === id) run.controller.abort();
    }
    this.options.chats.removeChat(id);
    this.options.changed?.('chats');
  }

  /** Marks replies interrupted by a crash or forced quit. Call once at startup. */
  recoverInterrupted(): void {
    this.options.chats.interruptRunning();
  }

  // --- Workspace --------------------------------------------------------------

  listFiles(chatId: string): WorkspaceFile[] {
    const { chats, workspace } = this.options;
    const entries = workspace.list(chatId);
    const registry = this.options.registry();
    const steps = chats.getSteps([...new Set(entries.map((entry) => entry.messageId))]);
    return entries.map((entry) => {
      const step = steps.find((s) => s.messageId === entry.messageId && s.key === entry.stepKey);
      return {
        path: entry.path,
        size: entry.size,
        mime: entry.mime,
        updatedAt: entry.updatedAt.getTime(),
        versions: entry.versions,
        writtenBy: step
          ? { title: step.title, modelName: step.model ? registry.name(step.model) : null }
          : null,
      };
    });
  }

  readFile(chatId: string, path: string): WorkspaceFileContent | null {
    const row = this.options.workspace.read(chatId, path);
    if (!row) return null;
    return {
      path: row.path,
      content: row.content,
      mime: row.mime,
      size: row.size,
      updatedAt: row.createdAt.getTime(),
    };
  }

  /** The latest version of every file, for exporting. */
  filesForExport(chatId: string): { path: string; content: string }[] {
    return this.options.workspace
      .list(chatId)
      .map((entry) => this.options.workspace.read(chatId, entry.path))
      .filter((row) => row !== undefined)
      .map((row) => ({ path: row.path, content: row.content }));
  }

  // --- Models -----------------------------------------------------------------

  modelOptions(): ModelOption[] {
    const usable = new Set(this.pool.usableModels().map((model) => model.id));
    const at = new Date(this.now());
    return this.options.registry().models.map((model) => {
      const prices = pricesAt(model, at);
      return {
        id: model.id,
        name: model.name,
        provider: model.provider,
        tier: model.tier,
        efforts: model.efforts,
        usable: usable.has(model.id),
        inputPerM: prices.inputPerM,
        outputPerM: prices.outputPerM,
        contextTokens: model.contextTokens,
        notes: model.notes,
      };
    });
  }

  // --- Replies ----------------------------------------------------------------

  /** Saves the user's message and starts the reply. Progress arrives through `emit`. */
  send(rawInput: SendMessageInput): SendMessageResult {
    const input = SendMessageInput.parse(rawInput);
    const { chats } = this.options;
    const now = new Date(this.now());

    let chatId = input.chatId;
    if (chatId) {
      if (!chats.getChat(chatId)) throw new Error('Chat not found');
      if (this.isRunning(chatId)) {
        throw new Error(
          'Wait for the current reply to finish, or stop it, before sending another.',
        );
      }
    } else {
      chatId = chats.createChat(titleFrom(input.text), now).id;
    }
    const history = toTurns(chats.getMessages(chatId));
    chats.addMessage({ chatId, role: 'user', content: input.text, status: 'complete' }, now);
    const message = chats.addMessage(
      {
        chatId,
        role: 'assistant',
        content: '',
        status: 'running',
        outputMode: input.outputMode,
      },
      now,
    );
    this.options.changed?.('chats');

    const runId = crypto.randomUUID();
    const run: Run = {
      runId,
      chatId,
      messageId: message.id,
      controller: new AbortController(),
      recorder: new RunRecorder(
        runId,
        chatId,
        message.id,
        chats,
        this.options.registry(),
        this.options.emit,
        this.now,
      ),
      done: Promise.resolve(),
    };
    this.runs.set(runId, run);
    this.options.emit({ type: 'started', runId, chatId, messageId: message.id });
    run.done = this.reply(run, input, history)
      .catch((error: unknown): Outcome => {
        // A bug or a user-facing problem: still end the reply cleanly so the UI doesn't hang.
        const message = error instanceof Error ? error.message : String(error);
        return { status: 'error', content: '', error: message };
      })
      .then((outcome) => this.finish(run, outcome))
      .finally(() => this.runs.delete(runId));
    return { chatId, runId };
  }

  /** Runs a plan that's waiting for review, with the user's edits. */
  approvePlan(rawInput: ApprovePlanInput): void {
    const input = ApprovePlanInput.parse(rawInput);
    const run = this.runs.get(input.runId);
    if (!run?.approve) throw new Error('This plan is no longer waiting for review.');
    const approve = run.approve;
    delete run.approve;
    approve(input);
  }

  stop(runId: string): void {
    this.runs.get(runId)?.controller.abort();
  }

  stopAll(): void {
    for (const run of this.runs.values()) run.controller.abort();
  }

  /** Resolves when a reply has finished (for tests and shutdown). */
  async waitForRun(runId: string): Promise<void> {
    await this.runs.get(runId)?.done;
  }

  hasRuns(): boolean {
    return this.runs.size > 0;
  }

  /** Resolves when every reply has finished, or after `timeoutMs`. */
  async waitForAll(timeoutMs: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => (timer = setTimeout(resolve, timeoutMs)));
    await Promise.race([Promise.allSettled([...this.runs.values()].map((r) => r.done)), timeout]);
    clearTimeout(timer);
  }

  private isRunning(chatId: string): boolean {
    return [...this.runs.values()].some((run) => run.chatId === chatId);
  }

  private async reply(
    run: Run,
    input: ReturnType<typeof SendMessageInput.parse>,
    history: ChatTurn[],
  ): Promise<Outcome> {
    const registry = this.options.registry();
    const signal = run.controller.signal;
    const { recorder } = run;
    const context: PlanningContext = {
      registry,
      usable: this.pool.usableModels(),
      mode: input.outputMode,
      at: new Date(this.now()),
    };
    if (context.usable.length === 0)
      return { status: 'error', content: '', error: NO_ACCOUNTS_ERROR };

    const { text: request, pin } = parseMentions(input.text, registry);
    const files = this.workspaceFiles(run.chatId);

    // 1. Plan (or take the model the user mentioned).
    let plan: Plan;
    let manager: Attempt | undefined;
    if (pin) {
      plan = this.pinnedPlan(pin, request, context);
    } else {
      const planned = await this.plan(recorder, request, history, files, context, signal);
      if (planned === 'stopped') return { status: 'stopped', content: '' };
      ({ plan, manager } = planned);
    }

    // 2. Show it; in Review mode wait for the user.
    const contextTokens = Math.round(
      history.reduce((sum, turn) => sum + turn.content.length, 0) / 4,
    );
    const managerRef = manager
      ? modelRef(registry, manager.model.provider, manager.model.id)
      : null;
    const publish = (awaitingApproval: boolean) => {
      const estimate = estimatePlan(plan, registry, context.at, contextTokens);
      this.savePlan(recorder, run, plan, managerRef, pin, input.planMode, estimate);
      this.options.emit({
        type: 'plan',
        runId: run.runId,
        chatId: run.chatId,
        plan: planView(plan, registry, managerRef, pin?.mention ?? null, estimate),
        awaitingApproval,
      });
    };
    publish(input.planMode === 'review');
    if (input.planMode === 'review') {
      let edits: ApprovePlanInput;
      try {
        edits = await this.waitForApproval(run);
      } catch {
        for (const task of plan.tasks) recorder.finished(task.key, 'skipped');
        if (plan.kind === 'workflow') recorder.finished(WRAPUP_KEY, 'skipped');
        return { status: 'stopped', content: '' };
      }
      plan = this.applyEdits(plan, edits, { ...context, usable: this.pool.usableModels() });
      publish(false);
    }

    // 3. Run it.
    if (plan.kind === 'direct') {
      const [task] = plan.tasks;
      if (!task) return { status: 'error', content: '', error: 'The plan has no tasks.' };
      return this.runDirect(recorder, run, task, history, files, signal);
    }
    return this.runWorkflow(recorder, run, plan, request, history, manager, context, signal);
  }

  /** Asks the manager for a plan; falls back to a direct answer if planning fails. */
  private async plan(
    recorder: RunRecorder,
    request: string,
    history: ChatTurn[],
    files: { path: string; size: number }[],
    context: PlanningContext,
    signal: AbortSignal,
  ): Promise<{ plan: Plan; manager: Attempt | undefined } | 'stopped'> {
    const { registry } = context;
    recorder.plan(PLAN_KEY, 'plan', 0, 'Planning');
    const managers = this.managers(context);
    const role = context.mode === 'best' ? 'strong' : 'fast';
    const modelIds = managers.flatMap((provider) =>
      registry.managerModels(provider, role).slice(0, 2),
    );
    const system = plannerSystem({
      mode: context.mode,
      defaultEffort: OUTPUT_MODE_SETTINGS[context.mode].effort,
      models: modelsForPrompt(context),
      recommended: recommendations(context),
      files,
    });
    const messages: ChatTurn[] = [
      { role: 'user', content: plannerRequest(history.slice(-6), request) },
    ];

    try {
      const { value, attempt } = await withFailover(
        this.failoverDeps(),
        modelIds,
        (attempt) => {
          recorder.started(PLAN_KEY, attempt);
          return generateStructured(this.options.adapters[attempt.model.provider], {
            modelId: attempt.apiId,
            credential: attempt.credential,
            system,
            messages,
            schema: PlanDraft,
            name: 'plan',
            effort: registry.supportedEffort(
              attempt.model.id,
              role === 'strong' ? 'medium' : 'low',
            ),
            signal,
          });
        },
        { signal, onRetry: (attempt, failure) => recorder.retrying(PLAN_KEY, attempt, failure) },
      );
      const plan = repairPlan(draftToRaw(value.object, request), context);
      recorder.finished(PLAN_KEY, 'done', { usage: value.usage, report: plan.summary });
      return { plan, manager: attempt };
    } catch (error) {
      const failure = classifyError(error);
      if (signal.aborted || failure.kind === 'aborted') {
        recorder.finished(PLAN_KEY, 'stopped');
        return 'stopped';
      }
      // Planning failed: the manager's own model answers directly instead.
      recorder.finished(PLAN_KEY, 'failed', { error: failure.message });
      const provider = managers[0];
      const usableIds = new Set(context.usable.map((model) => model.id));
      const model =
        (provider &&
          registry
            .tierCandidates(provider, OUTPUT_MODE_SETTINGS[context.mode].tier)
            .find((id) => usableIds.has(id))) ??
        recommendedModel(context, 'chat') ??
        '';
      const raw: RawPlan = {
        kind: 'direct',
        summary: `Planning failed (${failure.message}), so the manager's model answers directly.`,
        spec: '',
        tasks: [directTask(request, 'chat', model, null)],
      };
      return { plan: repairPlan(raw, context), manager: undefined };
    }
  }

  /** A direct answer by the provider or model the user mentioned. */
  private pinnedPlan(pin: Pin, request: string, context: PlanningContext): Plan {
    const { registry } = context;
    const usableIds = new Set(context.usable.map((model) => model.id));
    let models: string[];
    if (pin.kind === 'provider') {
      models = registry
        .tierCandidates(pin.provider, OUTPUT_MODE_SETTINGS[context.mode].tier)
        .filter((id) => usableIds.has(id));
      if (models.length === 0) {
        throw new Error(
          `${MANAGER_NAMES[pin.provider]} isn't available: add an ${PROVIDER_NAMES[pin.provider]} account in Settings → Accounts, or wait for a paused one to reset.`,
        );
      }
    } else {
      if (!usableIds.has(pin.modelId)) {
        throw new Error(
          `${registry.name(pin.modelId)} isn't available with your accounts right now.`,
        );
      }
      models = [pin.modelId];
    }
    const [model = '', ...fallbacks] = models;
    const task: PlannedTask = {
      key: DIRECT_KEY,
      title: 'Answer',
      instructions: request,
      category: 'chat',
      model,
      effort: registry.supportedEffort(model, OUTPUT_MODE_SETTINGS[context.mode].effort),
      dependsOn: [],
      outputs: [],
      rationale: `You asked for ${pin.mention}.`,
      fallbacks,
    };
    return {
      kind: 'direct',
      summary: `Answered by ${registry.name(model)}`,
      spec: '',
      tasks: [task],
    };
  }

  private applyEdits(plan: Plan, edits: ApprovePlanInput, context: PlanningContext): Plan {
    const raw: RawPlan = {
      kind: plan.kind,
      summary: plan.summary,
      spec: edits.spec,
      tasks: edits.tasks.map((task) => ({ ...task, rationale: this.rationale(plan, task.key) })),
    };
    return repairPlan(raw, context);
  }

  private rationale(plan: Plan, key: string): string {
    return plan.tasks.find((task) => task.key === key)?.rationale ?? 'Added in review.';
  }

  private waitForApproval(run: Run): Promise<ApprovePlanInput> {
    return new Promise((resolve, reject) => {
      if (run.controller.signal.aborted) return reject(new ProviderError('aborted', 'Cancelled'));
      run.approve = resolve;
      run.controller.signal.addEventListener(
        'abort',
        () => {
          delete run.approve;
          reject(new ProviderError('aborted', 'Cancelled'));
        },
        { once: true },
      );
    });
  }

  private savePlan(
    recorder: RunRecorder,
    run: Run,
    plan: Plan,
    manager: ModelRef | null,
    pin: Pin | null,
    planMode: 'auto' | 'review',
    estimate: { costUsd: number | null; seconds: number | null },
  ): void {
    this.options.chats.savePlan({
      messageId: run.messageId,
      kind: plan.kind,
      summary: plan.summary,
      spec: plan.spec,
      managerProvider: manager?.provider ?? null,
      managerModel: manager?.model ?? null,
      pinned: pin?.mention ?? null,
      planMode,
      estimatedCostUsd: estimate.costUsd,
      estimatedSeconds: estimate.seconds,
      createdAt: new Date(this.now()),
    });
    const keys = [PLAN_KEY, ...plan.tasks.map((task) => task.key)];
    plan.tasks.forEach((task, index) =>
      recorder.plan(task.key, 'task', index + 1, task.title, task),
    );
    if (plan.kind === 'workflow') {
      recorder.plan(WRAPUP_KEY, 'wrapup', plan.tasks.length + 1, 'Wrap-up');
      keys.push(WRAPUP_KEY);
    }
    recorder.keepOnly(keys);
  }

  private async runDirect(
    recorder: RunRecorder,
    run: Run,
    task: PlannedTask,
    history: ChatTurn[],
    files: { path: string; size: number }[],
    signal: AbortSignal,
  ): Promise<Outcome> {
    const tools =
      files.length > 0 ? workspaceTools(this.workspaceAccess(recorder, run, task.key)) : undefined;
    let text = '';
    try {
      const { value: usage, attempt } = await withFailover(
        this.failoverDeps(),
        [task.model, ...task.fallbacks],
        async (attempt) => {
          recorder.started(task.key, attempt);
          text = '';
          let usage: TokenUsage = EMPTY_USAGE;
          try {
            for await (const event of streamChat(this.options.adapters[attempt.model.provider], {
              modelId: attempt.apiId,
              credential: attempt.credential,
              system: directSystem(files),
              messages: mergeTurns([...history, { role: 'user', content: task.instructions }]),
              effort: this.effortFor(attempt, task),
              signal,
              tools,
              maxSteps: DIRECT_MAX_STEPS,
            })) {
              if (event.type === 'text') {
                text += event.text;
                recorder.text(task.key, event.text);
              } else if (event.type === 'finish') {
                usage = event.usage;
              }
            }
          } catch (error) {
            // Never silently restart an answer the user has already started reading.
            if (text) throw new StopFailover(classifyError(error));
            throw error;
          }
          return usage;
        },
        { signal, onRetry: (attempt, failure) => recorder.retrying(task.key, attempt, failure) },
      );
      recorder.finished(task.key, 'done', { usage, report: text });
      return { status: 'complete', content: text, writer: attempt };
    } catch (error) {
      const failure = classifyError(error);
      const writer = recorder.attempt(task.key);
      if (signal.aborted || failure.kind === 'aborted') {
        recorder.finished(task.key, 'stopped', { report: text });
        return { status: 'stopped', content: text, writer };
      }
      recorder.finished(task.key, 'failed', { report: text, error: failure.message });
      const message =
        failure.message === NO_ACCOUNTS_ERROR || text
          ? failure.message
          : `Every available account failed. Last error: ${failure.message}`;
      return { status: 'error', content: text, error: message, writer };
    }
  }

  private async runWorkflow(
    recorder: RunRecorder,
    run: Run,
    plan: Plan,
    request: string,
    history: ChatTurn[],
    manager: Attempt | undefined,
    context: PlanningContext,
    signal: AbortSignal,
  ): Promise<Outcome> {
    const owners = new Map<string, PlannedTask>();
    for (const task of plan.tasks) for (const path of task.outputs) owners.set(path, task);
    const written = new Map<string, Set<string>>();
    const recentHistory = mergeTurns(
      history.slice(-6).map((turn) => ({ ...turn, content: clipTurn(turn.content, 4000) })),
    );

    const runTask = async (task: PlannedTask): Promise<GraphStatus> => {
      const files = new Set<string>();
      written.set(task.key, files);
      const ownedByOthers = new Map(
        [...owners]
          .filter(([, owner]) => owner.key !== task.key)
          .map(([path, o]) => [path, o.title]),
      );
      const tools = workspaceTools(this.workspaceAccess(recorder, run, task.key, files), {
        ownedByOthers,
      });
      const dependencies = task.dependsOn.map((key) => {
        const dep = plan.tasks.find((t) => t.key === key);
        return {
          title: dep?.title ?? key,
          modelName: this.options
            .registry()
            .name(recorder.attempt(key)?.model.id ?? dep?.model ?? ''),
          files: [...(written.get(key) ?? [])].sort(),
          report: recorder.report(key),
        };
      });
      let text = '';
      try {
        const { value: usage } = await withFailover(
          this.failoverDeps(),
          [task.model, ...task.fallbacks],
          async (attempt) => {
            recorder.started(task.key, attempt);
            text = '';
            let usage: TokenUsage = EMPTY_USAGE;
            for await (const event of streamChat(this.options.adapters[attempt.model.provider], {
              modelId: attempt.apiId,
              credential: attempt.credential,
              system: workerSystem(plan.spec),
              messages: mergeTurns([
                ...recentHistory,
                {
                  role: 'user',
                  content: workerTask({
                    title: task.title,
                    instructions: task.instructions,
                    outputs: task.outputs,
                    dependencies,
                    files: this.workspaceFiles(run.chatId),
                    request,
                  }),
                },
              ]),
              effort: this.effortFor(attempt, task),
              signal,
              tools,
              maxSteps: TASK_MAX_STEPS,
            })) {
              if (event.type === 'text') {
                text += event.text;
                recorder.text(task.key, event.text);
              } else if (event.type === 'finish') {
                usage = event.usage;
              }
            }
            return usage;
          },
          { signal, onRetry: (attempt, failure) => recorder.retrying(task.key, attempt, failure) },
        );
        const missing = task.outputs.filter((path) => !files.has(path));
        const report =
          text.trim() + (missing.length > 0 ? `\n\n(Missing files: ${missing.join(', ')})` : '');
        recorder.finished(task.key, 'done', { usage, report });
        return 'done';
      } catch (error) {
        const failure = classifyError(error);
        if (signal.aborted || failure.kind === 'aborted') {
          recorder.finished(task.key, 'stopped', { report: text });
          return 'stopped';
        }
        recorder.finished(task.key, 'failed', { report: text, error: failure.message });
        return 'failed';
      }
    };

    const statuses = await runGraph(plan.tasks, runTask, {
      concurrency: this.options.concurrency ?? 4,
      signal,
      onSkip: (task) =>
        recorder.finished(task.key, 'skipped', {
          error: signal.aborted ? null : 'A task it depends on did not finish.',
        }),
    });

    const done = plan.tasks.filter((task) => statuses.get(task.key) === 'done');
    const summary = () => this.filesSummary(run.chatId, plan, statuses);
    if (signal.aborted) {
      recorder.finished(WRAPUP_KEY, 'skipped');
      return { status: 'stopped', content: summary() };
    }
    if (done.length === 0) {
      recorder.finished(WRAPUP_KEY, 'skipped');
      return { status: 'error', content: summary(), error: 'Every task failed.' };
    }
    return this.wrapUp(recorder, run, plan, request, statuses, manager, context, signal);
  }

  /** The manager's closing message for a workflow. */
  private async wrapUp(
    recorder: RunRecorder,
    run: Run,
    plan: Plan,
    request: string,
    statuses: ReadonlyMap<string, GraphStatus>,
    manager: Attempt | undefined,
    context: PlanningContext,
    signal: AbortSignal,
  ): Promise<Outcome> {
    const registry = this.options.registry();
    const providers = [
      ...new Set([
        ...(manager ? [manager.model.provider] : []),
        ...this.managers({ ...context, usable: this.pool.usableModels() }),
      ]),
    ];
    const modelIds = providers.flatMap((provider) =>
      registry.managerModels(provider, 'fast').slice(0, 2),
    );
    const files = this.options.workspace.list(run.chatId);
    const content = wrapupRequest({
      request,
      summary: plan.summary,
      tasks: plan.tasks.map((task) => ({
        title: task.title,
        modelName: registry.name(recorder.attempt(task.key)?.model.id ?? task.model),
        status: statuses.get(task.key) ?? 'skipped',
        report: recorder.report(task.key),
      })),
      files: files.map((file) => ({
        path: file.path,
        size: file.size,
        by: plan.tasks.find((task) => task.key === file.stepKey)?.title ?? 'an earlier request',
      })),
    });

    let text = '';
    try {
      const { value: usage, attempt } = await withFailover(
        this.failoverDeps(),
        modelIds,
        async (attempt) => {
          recorder.started(WRAPUP_KEY, attempt);
          text = '';
          let usage: TokenUsage = EMPTY_USAGE;
          try {
            for await (const event of streamChat(this.options.adapters[attempt.model.provider], {
              modelId: attempt.apiId,
              credential: attempt.credential,
              system: WRAPUP_SYSTEM,
              messages: [{ role: 'user', content }],
              effort: registry.supportedEffort(attempt.model.id, 'low'),
              signal,
            })) {
              if (event.type === 'text') {
                text += event.text;
                recorder.text(WRAPUP_KEY, event.text);
              } else if (event.type === 'finish') {
                usage = event.usage;
              }
            }
          } catch (error) {
            if (text) throw new StopFailover(classifyError(error));
            throw error;
          }
          return usage;
        },
        { signal, onRetry: (attempt, failure) => recorder.retrying(WRAPUP_KEY, attempt, failure) },
      );
      recorder.finished(WRAPUP_KEY, 'done', { usage, report: text });
      return { status: 'complete', content: text, writer: attempt };
    } catch (error) {
      const failure = classifyError(error);
      const stopped = signal.aborted || failure.kind === 'aborted';
      recorder.finished(WRAPUP_KEY, stopped ? 'stopped' : 'failed', {
        report: text,
        ...(stopped ? {} : { error: failure.message }),
      });
      // The files are what matters; list them even without the manager's summary.
      return {
        status: stopped ? 'stopped' : 'complete',
        content: text || this.filesSummary(run.chatId, plan, statuses),
        writer: text ? recorder.attempt(WRAPUP_KEY) : undefined,
      };
    }
  }

  /** A plain list of what a workflow produced, written without a model. */
  private filesSummary(
    chatId: string,
    plan: Plan,
    statuses: ReadonlyMap<string, GraphStatus>,
  ): string {
    const files = this.options.workspace.list(chatId);
    const lines = files.map((file) => `- \`${file.path}\``);
    const problems = plan.tasks
      .filter((task) => statuses.get(task.key) !== 'done')
      .map((task) => `- ${task.title}: ${statuses.get(task.key) ?? 'skipped'}`);
    return [
      files.length > 0 ? `Files in this chat:\n\n${lines.join('\n')}` : 'No files were written.',
      ...(problems.length > 0 ? [`Tasks that didn't finish:\n\n${problems.join('\n')}`] : []),
    ].join('\n\n');
  }

  private finish(run: Run, outcome: Outcome): void {
    const totals = run.recorder.totals();
    const writer = outcome.writer;
    this.options.chats.updateMessage(run.messageId, {
      content: outcome.content,
      status: outcome.status,
      error: outcome.error ?? null,
      provider: writer?.model.provider ?? null,
      model: writer?.model.id ?? null,
      accountId: writer?.account.id ?? null,
      accountLabel: writer?.account.label ?? null,
      inputTokens: totals.inputTokens,
      cachedInputTokens: totals.cachedInputTokens,
      outputTokens: totals.outputTokens,
      reasoningTokens: totals.reasoningTokens,
      costUsd: totals.costUsd,
    });
    this.options.changed?.('chats');
    this.options.emit({
      type: 'finished',
      runId: run.runId,
      chatId: run.chatId,
      status: outcome.status,
      ...(outcome.error ? { error: outcome.error } : {}),
    });
  }

  private managers(context: PlanningContext): ProviderId[] {
    const usableProviders = new Set(context.usable.map((model) => model.provider));
    return rankManagers(this.options.managerOrder(), usableProviders);
  }

  private effortFor(attempt: Attempt, task: PlannedTask) {
    // A fallback model may support different levels than the planned one.
    return this.options
      .registry()
      .supportedEffort(attempt.model.id, task.effort ?? OUTPUT_MODE_SETTINGS.balanced.effort);
  }

  private failoverDeps() {
    return {
      accounts: this.options.accounts,
      pool: this.pool,
      registry: this.options.registry,
      changed: this.options.changed,
    };
  }

  private workspaceFiles(chatId: string): { path: string; size: number }[] {
    return this.options.workspace
      .list(chatId)
      .map((file) => ({ path: file.path, size: file.size }));
  }

  private workspaceAccess(
    recorder: RunRecorder,
    run: Run,
    stepKey: string,
    written?: Set<string>,
  ): WorkspaceAccess {
    const { workspace } = this.options;
    return {
      list: () => this.workspaceFiles(run.chatId),
      read: (path) => workspace.read(run.chatId, path)?.content,
      write: (path, content) => {
        workspace.write(
          {
            chatId: run.chatId,
            messageId: run.messageId,
            stepKey,
            path,
            content,
            mime: mimeFor(path),
          },
          new Date(this.now()),
        );
        written?.add(path);
        recorder.file(stepKey, path);
      },
    };
  }
}

/** A chat's title: the first line of its first message, shortened. */
export function titleFrom(text: string): string {
  const firstLine = text.trim().split('\n')[0]?.trim() ?? '';
  if (!firstLine) return 'New chat';
  return firstLine.length > 60 ? `${firstLine.slice(0, 57).trimEnd()}…` : firstLine;
}

/** Saved messages as conversation turns for the models. */
function toTurns(rows: readonly MessageRow[]): ChatTurn[] {
  return mergeTurns(
    rows
      .filter((row) => row.content.trim() !== '' && row.status !== 'running')
      .map((row) => ({ role: row.role, content: row.content })),
  );
}

/** Joins consecutive turns from the same side (e.g. after a reply that failed). */
function mergeTurns(turns: readonly ChatTurn[]): ChatTurn[] {
  const merged: ChatTurn[] = [];
  for (const turn of turns) {
    const last = merged.at(-1);
    if (last?.role === turn.role) last.content = `${last.content}\n\n${turn.content}`;
    else merged.push({ ...turn });
  }
  return merged;
}

function clipTurn(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
