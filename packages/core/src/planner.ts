import {
  blendedPrice,
  rankModels,
  type ModelEntry,
  type ModelRegistry,
} from '@ultimatellm/registry';
import { Effort, TaskCategory, type OutputMode, type PlanKind } from '@ultimatellm/shared';
import { z } from 'zod';
import { normalizePath } from './workspace';

/** How each output mode sets effort and, for direct fallbacks, the model tier. */
export const OUTPUT_MODE_SETTINGS = {
  cheapest: { tier: 'fast', effort: 'low' },
  fastest: { tier: 'fast', effort: 'none' },
  balanced: { tier: 'balanced', effort: 'medium' },
  best: { tier: 'best', effort: 'high' },
} as const satisfies Record<OutputMode, { tier: string; effort: Effort }>;

export const MAX_TASKS = 8;

/**
 * The plan as the manager writes it (structured output). Every field is
 * required and unconstrained so the schema works with each provider's strict
 * JSON mode; limits are enforced afterwards by `repairPlan`.
 */
export const PlanDraft = z.object({
  kind: z
    .enum(['direct', 'workflow'])
    .describe('"direct": one model answers in the chat. "workflow": tasks write files.'),
  summary: z.string().describe('One short sentence describing how the request will be handled.'),
  category: TaskCategory.describe('The kind of request (for a workflow: of its main task).'),
  model: z.string().describe('For a direct answer: the ID of the model that answers.'),
  effort: Effort.describe('For a direct answer: how much the model should reason.'),
  spec: z.string().describe('For a workflow: the shared spec in Markdown. Empty otherwise.'),
  tasks: z
    .array(
      z.object({
        id: z.string().describe('Short unique ID such as "t1".'),
        title: z.string().describe('A few words, e.g. "Write the game code".'),
        instructions: z.string().describe('Exactly what to do, referring to the spec.'),
        category: TaskCategory,
        model: z.string().describe('The ID of the model that does this task.'),
        effort: Effort,
        dependsOn: z.array(z.string()).describe('IDs of earlier tasks whose files it needs.'),
        outputs: z.array(z.string()).describe('Paths of the files it writes, from the spec.'),
        rationale: z.string().describe('Why this model suits the task, in one sentence.'),
      }),
    )
    .describe('For a workflow: the tasks, in order. Empty for a direct answer.'),
});
export type PlanDraft = z.infer<typeof PlanDraft>;

export interface PlannedTask {
  /** "answer" for a direct answer, otherwise a task ID like "t1". */
  key: string;
  title: string;
  instructions: string;
  category: TaskCategory;
  model: string;
  /** A level the model supports; undefined if the app doesn't control its reasoning. */
  effort: Effort | undefined;
  dependsOn: string[];
  outputs: string[];
  rationale: string;
  /** Models to try, in order, if `model` fails on every account. */
  fallbacks: string[];
}

export interface Plan {
  kind: PlanKind;
  summary: string;
  spec: string;
  tasks: PlannedTask[];
}

export interface PlanningContext {
  registry: ModelRegistry;
  /** Models the user can run right now. */
  usable: readonly ModelEntry[];
  mode: OutputMode;
  at: Date;
}

/** A plan in loose form, before checking: from the manager or the Review card. */
export interface RawPlan {
  kind: PlanKind;
  summary: string;
  spec: string;
  tasks: {
    key: string;
    title: string;
    instructions: string;
    category: TaskCategory;
    model: string;
    effort: Effort | null;
    dependsOn: string[];
    outputs: string[];
    rationale: string;
  }[];
}

export const DIRECT_KEY = 'answer';

/** The best usable model for a category in this mode, the usable list's first model, or undefined. */
export function recommendedModel(
  context: PlanningContext,
  category: TaskCategory,
): string | undefined {
  return rankModels(context.usable, category, context.mode, context.at)[0]?.id;
}

/** The model the manager should use for each category, for the planner prompt. */
export function recommendations(context: PlanningContext): Record<string, string> {
  const result: Record<string, string> = {};
  for (const category of TaskCategory.options) {
    const model = recommendedModel(context, category);
    if (model) result[category] = model;
  }
  return result;
}

/** The usable models as the planner sees them. */
export function modelsForPrompt(context: PlanningContext): unknown[] {
  return context.usable.map((model) => ({
    id: model.id,
    name: model.name,
    provider: model.provider,
    tier: model.tier,
    price: `$${round(blendedPrice(model, context.at))} per 1M tokens (blended)`,
    speed: `~${model.speed.tokensPerSec} tokens/s`,
    context: `${Math.round(model.contextTokens / 1000)}k tokens`,
    efforts: model.efforts,
    notes: model.notes,
  }));
}

export function draftToRaw(draft: PlanDraft, request: string): RawPlan {
  if (draft.kind === 'direct' || draft.tasks.length === 0) {
    return {
      kind: 'direct',
      summary: draft.summary,
      spec: '',
      tasks: [directTask(request, draft.category, draft.model, draft.effort, draft.summary)],
    };
  }
  return {
    kind: 'workflow',
    summary: draft.summary,
    spec: draft.spec,
    tasks: draft.tasks.map((task) => ({ ...task, key: task.id })),
  };
}

export function directTask(
  request: string,
  category: TaskCategory,
  model: string,
  effort: Effort | null,
  rationale = '',
): RawPlan['tasks'][number] {
  return {
    key: DIRECT_KEY,
    title: 'Answer',
    instructions: request,
    category,
    model,
    effort,
    dependsOn: [],
    outputs: [],
    rationale,
  };
}

/**
 * Checks a plan and repairs what it can (docs/03-orchestration.md §2):
 * unknown or unusable models are replaced by the best usable model for the
 * task, effort is moved to a level the model supports, dependencies may only
 * point at earlier tasks, output paths must be safe and unique, and there are
 * at most `MAX_TASKS` tasks. Each task gets fallback models.
 */
export function repairPlan(raw: RawPlan, context: PlanningContext): Plan {
  const usableIds = new Set(context.usable.map((model) => model.id));
  const keys = new Map<string, string>();
  const tasks: PlannedTask[] = [];
  const claimed = new Set<string>();
  const direct = raw.kind === 'direct';

  for (const [index, task] of raw.tasks.slice(0, direct ? 1 : MAX_TASKS).entries()) {
    // Only earlier tasks count, which also rules out cycles. Resolved before this
    // task's own ID joins the map, since IDs may repeat.
    const earlier = new Set(tasks.map((t) => t.key));
    const dependsOn = [
      ...new Set(
        task.dependsOn.map((dep) => keys.get(dep) ?? dep).filter((dep) => earlier.has(dep)),
      ),
    ];
    const key = direct ? DIRECT_KEY : uniqueKey(task.key, index, keys);
    keys.set(task.key, key);

    const resolved = context.registry.get(task.model.trim())?.id;
    const model =
      resolved && usableIds.has(resolved)
        ? resolved
        : (recommendedModel(context, task.category) ?? resolved ?? task.model);
    const effort =
      context.registry.supportedEffort(
        model,
        task.effort ?? OUTPUT_MODE_SETTINGS[context.mode].effort,
      ) ?? undefined;

    const outputs: string[] = [];
    for (const path of task.outputs) {
      const normalized = normalizePath(path);
      if (normalized && !claimed.has(normalized)) {
        claimed.add(normalized);
        outputs.push(normalized);
      }
    }

    tasks.push({
      key,
      title: clean(task.title, 200) || `Task ${index + 1}`,
      instructions: task.instructions.trim(),
      category: task.category,
      model,
      effort,
      dependsOn: direct ? [] : dependsOn,
      outputs: direct ? [] : outputs,
      rationale: clean(task.rationale, 500),
      fallbacks: rankModels(context.usable, task.category, context.mode, context.at)
        .map((entry) => entry.id)
        .filter((id) => id !== model)
        .slice(0, 3),
    });
  }

  return {
    kind: direct ? 'direct' : 'workflow',
    summary: clean(raw.summary, 300),
    spec: direct ? '' : raw.spec.trim(),
    tasks,
  };
}

function uniqueKey(wanted: string, index: number, used: Map<string, string>): string {
  const taken = new Set(used.values());
  const candidate = wanted
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 20);
  if (candidate && candidate !== DIRECT_KEY && !taken.has(candidate)) return candidate;
  let n = index + 1;
  while (taken.has(`t${n}`)) n++;
  return `t${n}`;
}

function clean(text: string, max: number): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

function round(value: number): number {
  return value >= 1 ? Math.round(value * 100) / 100 : Math.round(value * 1000) / 1000;
}
