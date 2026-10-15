import type { MessageRow, PlanRow, StepRow } from '@ultimatellm/db';
import type { ModelRegistry } from '@ultimatellm/registry';
import type {
  ChatMessage,
  MessageStep,
  ModelRef,
  PlanStep,
  PlanView,
  ProviderId,
} from '@ultimatellm/shared';
import type { Plan } from './planner';
import type { PlanEstimate } from './estimate';

export function modelRef(
  registry: ModelRegistry,
  provider: ProviderId | null | undefined,
  model: string | null | undefined,
): ModelRef | null {
  if (!provider || !model) return null;
  return { provider, model, modelName: registry.name(model) };
}

/** A freshly made plan as the UI shows it. */
export function planView(
  plan: Plan,
  registry: ModelRegistry,
  manager: ModelRef | null,
  pinned: string | null,
  estimate: PlanEstimate,
): PlanView {
  return {
    kind: plan.kind,
    summary: plan.summary,
    spec: plan.spec,
    manager,
    pinned,
    estimate,
    tasks: plan.tasks.map((task): PlanStep => {
      const entry = registry.get(task.model);
      return {
        key: task.key,
        kind: 'task',
        title: task.title,
        instructions: task.instructions,
        category: task.category,
        dependsOn: task.dependsOn,
        outputs: task.outputs,
        rationale: task.rationale,
        provider: entry?.provider ?? null,
        model: task.model,
        modelName: registry.name(task.model),
        effort: task.effort ?? null,
      };
    }),
  };
}

/** A saved message with its plan, steps and the files each step wrote. */
export function toChatMessage(
  row: MessageRow,
  registry: ModelRegistry,
  plan: PlanRow | undefined,
  steps: readonly StepRow[],
  filesByStep: ReadonlyMap<string, string[]>,
): ChatMessage {
  const messageSteps = steps.map((step) => toMessageStep(step, registry, filesByStep));
  return {
    id: row.id,
    chatId: row.chatId,
    role: row.role,
    content: row.content,
    status: row.status,
    error: row.error,
    provider: row.provider,
    model: row.model,
    modelName: row.model ? registry.name(row.model) : null,
    accountLabel: row.accountLabel,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    costUsd: row.costUsd,
    outputMode: row.outputMode,
    createdAt: row.createdAt.getTime(),
    plan: plan
      ? {
          kind: plan.kind,
          summary: plan.summary,
          spec: plan.spec,
          manager: modelRef(registry, plan.managerProvider, plan.managerModel),
          pinned: plan.pinned,
          estimate: { costUsd: plan.estimatedCostUsd, seconds: plan.estimatedSeconds },
          tasks: messageSteps.filter((step) => step.kind === 'task'),
        }
      : null,
    steps: messageSteps,
  };
}

function toMessageStep(
  step: StepRow,
  registry: ModelRegistry,
  filesByStep: ReadonlyMap<string, string[]>,
): MessageStep {
  return {
    key: step.key,
    kind: step.kind,
    title: step.title,
    instructions: step.instructions,
    category: step.category,
    dependsOn: step.dependsOn,
    outputs: step.outputs,
    rationale: step.rationale,
    provider: step.provider,
    model: step.model,
    modelName: step.model ? registry.name(step.model) : null,
    effort: step.effort,
    status: step.status,
    accountLabel: step.accountLabel,
    report: step.report,
    error: step.error,
    inputTokens: step.inputTokens,
    outputTokens: step.outputTokens,
    costUsd: step.costUsd,
    startedAt: step.startedAt?.getTime() ?? null,
    finishedAt: step.finishedAt?.getTime() ?? null,
    files: filesByStep.get(`${step.messageId}\n${step.key}`) ?? [],
  };
}
