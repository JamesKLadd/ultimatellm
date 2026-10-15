import { costUsd, typicalSeconds, type ModelRegistry } from '@ultimatellm/registry';
import type { Effort, TaskCategory } from '@ultimatellm/shared';
import type { Plan, PlannedTask } from './planner';

/** Reasoning makes models write (and bill) more tokens than the visible answer. */
const EFFORT_FACTOR: Record<Effort, number> = { none: 1, low: 1.3, medium: 1.8, high: 2.6, max: 4 };

/** Typical visible output, in tokens, for a direct answer and for a workflow task. */
function expectedOutput(category: TaskCategory, workflow: boolean): number {
  if (!workflow) return category === 'coding' || category === 'technical_writing' ? 1200 : 700;
  switch (category) {
    case 'coding':
    case 'debugging':
      return 6000;
    case 'creative_writing':
    case 'technical_writing':
    case 'long_context_analysis':
      return 2500;
    default:
      return 1500;
  }
}

export interface PlanEstimate {
  costUsd: number | null;
  seconds: number | null;
}

/**
 * A rough cost and time for running a plan, from registry prices and speeds.
 * `contextTokens` is the conversation sent with a direct answer. Time follows
 * the longest chain of dependent tasks; parallel tasks overlap.
 */
export function estimatePlan(
  plan: Plan,
  registry: ModelRegistry,
  at: Date,
  contextTokens: number,
): PlanEstimate {
  const workflow = plan.kind === 'workflow';
  let cost = 0;
  let known = false;
  const finishAt = new Map<string, number>();

  for (const task of plan.tasks) {
    const model = registry.get(task.model);
    if (!model) continue;
    known = true;
    const output = Math.round(
      expectedOutput(task.category, workflow) * EFFORT_FACTOR[task.effort ?? 'low'],
    );
    const input = workflow ? inputTokens(plan, task) : contextTokens + task.instructions.length / 4;
    cost +=
      costUsd(
        model,
        { inputTokens: input, cachedInputTokens: 0, outputTokens: output, reasoningTokens: null },
        at,
      ) ?? 0;
    const start = Math.max(0, ...task.dependsOn.map((dep) => finishAt.get(dep) ?? 0));
    finishAt.set(task.key, start + typicalSeconds(model, output));
  }
  if (!known) return { costUsd: null, seconds: null };

  let seconds = Math.max(...finishAt.values());
  if (workflow) {
    // The wrap-up: a short message from a fast model, after everything else.
    seconds += 6;
    cost += 0.002;
  }
  return { costUsd: cost, seconds };
}

function inputTokens(plan: Plan, task: PlannedTask): number {
  // Tool loops resend the conversation on every step; files from dependencies are read in.
  const base = 1200 + (plan.spec.length + task.instructions.length) / 4;
  return Math.round(base * 3 + task.dependsOn.length * 3000);
}
