import type { ChatStore, NewStep } from '@ultimatellm/db';
import type { ProviderError } from '@ultimatellm/providers';
import { costUsd, type ModelRegistry } from '@ultimatellm/registry';
import {
  addUsage,
  type ChatRunEvent,
  type StepKind,
  type StepStatus,
  type TokenUsage,
} from '@ultimatellm/shared';
import type { Attempt } from './failover';
import type { PlannedTask } from './planner';

/**
 * Keeps one reply's steps, saves them as they change and streams progress
 * to the UI. Also adds up tokens and cost for the message.
 */
export class RunRecorder {
  private readonly steps = new Map<string, NewStep>();
  private readonly attempts = new Map<string, Attempt>();
  private readonly usages: TokenUsage[] = [];
  private cost = 0;
  private costKnown = false;

  constructor(
    readonly runId: string,
    readonly chatId: string,
    readonly messageId: string,
    private readonly chats: ChatStore,
    private readonly registry: ModelRegistry,
    private readonly emit: (event: ChatRunEvent) => void,
    private readonly now: () => number,
  ) {}

  /** Adds a step that hasn't started yet (or replaces it after a review edit). */
  plan(key: string, kind: StepKind, position: number, title: string, task?: PlannedTask): void {
    const entry = task ? this.registry.get(task.model) : undefined;
    this.save({
      messageId: this.messageId,
      key,
      kind,
      position,
      title,
      instructions: task?.instructions ?? '',
      category: task?.category ?? null,
      dependsOn: task?.dependsOn ?? [],
      outputs: task?.outputs ?? [],
      rationale: task?.rationale ?? '',
      provider: entry?.provider ?? null,
      model: task?.model ?? null,
      effort: task?.effort ?? null,
      status: 'queued',
      report: '',
    });
  }

  /** Forgets steps that aren't in `keys` (tasks deleted in review). */
  keepOnly(keys: readonly string[]): void {
    for (const key of [...this.steps.keys()]) if (!keys.includes(key)) this.steps.delete(key);
    this.chats.pruneSteps(this.messageId, keys);
  }

  started(key: string, attempt: Attempt): void {
    const step = this.require(key);
    this.attempts.set(key, attempt);
    this.save({
      ...step,
      status: 'running',
      provider: attempt.model.provider,
      model: attempt.model.id,
      accountId: attempt.account.id,
      accountLabel: attempt.account.label,
      startedAt: step.startedAt ?? new Date(this.now()),
      error: null,
    });
    this.send({
      type: 'step-started',
      step: key,
      kind: step.kind,
      title: step.title,
      provider: attempt.model.provider,
      model: attempt.model.id,
      modelName: attempt.model.name,
      accountLabel: attempt.account.label,
    });
  }

  retrying(key: string, attempt: Attempt, failure: ProviderError): void {
    this.charge(attempt, failure.details.usage);
    this.send({
      type: 'step-retrying',
      step: key,
      reason: `${attempt.model.name} (${attempt.account.label}): ${failure.message}`,
    });
  }

  text(key: string, delta: string): void {
    this.send({ type: 'text', step: key, delta });
  }

  file(key: string, path: string): void {
    this.send({ type: 'file', step: key, path });
  }

  finished(
    key: string,
    status: Exclude<StepStatus, 'queued' | 'running'>,
    result: { usage?: TokenUsage; report?: string; error?: string | null } = {},
  ): void {
    const step = this.require(key);
    const attempt = this.attempts.get(key);
    const cost = attempt && result.usage ? this.charge(attempt, result.usage) : null;
    this.save({
      ...step,
      status,
      report: result.report ?? step.report,
      error: result.error ?? null,
      inputTokens: result.usage?.inputTokens ?? null,
      cachedInputTokens: result.usage?.cachedInputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
      reasoningTokens: result.usage?.reasoningTokens ?? null,
      costUsd: cost,
      finishedAt: step.startedAt ? new Date(this.now()) : null,
    });
    this.send({
      type: 'step-finished',
      step: key,
      status,
      costUsd: cost,
      ...(result.error ? { error: result.error } : {}),
    });
  }

  status(key: string): StepStatus | undefined {
    return this.steps.get(key)?.status;
  }

  report(key: string): string {
    return this.steps.get(key)?.report ?? '';
  }

  /** The attempt a step last ran on. */
  attempt(key: string): Attempt | undefined {
    return this.attempts.get(key);
  }

  /** Totals for the message: all steps, failed attempts included. */
  totals(): TokenUsage & { costUsd: number | null } {
    return { ...addUsage(...this.usages), costUsd: this.costKnown ? this.cost : null };
  }

  /** Records usage and returns its cost. */
  private charge(attempt: Attempt, usage: TokenUsage | undefined): number | null {
    if (!usage) return null;
    this.usages.push(usage);
    const cost = costUsd(attempt.model, usage, new Date(this.now()));
    if (cost !== null) {
      this.cost += cost;
      this.costKnown = true;
    }
    return cost;
  }

  private require(key: string): NewStep {
    const step = this.steps.get(key);
    if (!step) throw new Error(`Unknown step "${key}"`);
    return step;
  }

  private save(step: NewStep): void {
    this.steps.set(step.key, step);
    this.chats.saveStep(step);
  }

  private send(event: DistributiveOmit<ChatRunEvent, 'runId' | 'chatId'>): void {
    this.emit({ ...event, runId: this.runId, chatId: this.chatId });
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
