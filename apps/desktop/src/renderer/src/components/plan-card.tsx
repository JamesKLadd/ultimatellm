import type { Effort, ModelOption, PlanView, ProviderId, TaskCategory } from '@ultimatellm/shared';
import { PROVIDER_NAMES } from '@ultimatellm/shared';
import { Button, cn, Input, NativeSelect, Textarea } from '@ultimatellm/ui';
import { ChevronRight, ListChecks, Play, Plus, Trash, X } from 'lucide-react';
import { useState } from 'react';
import { formatCost, formatSeconds } from '../lib/format';
import { errorMessage, PROVIDER_LIST } from '../lib/providers';
import { useApprovePlan, useModelsInfo } from '../lib/queries';
import { Markdown } from './markdown';

interface EditableTask {
  key: string;
  title: string;
  instructions: string;
  category: TaskCategory;
  model: string;
  effort: Effort | null;
  dependsOn: string[];
  /** Comma-separated while editing. */
  outputs: string;
}

/** The plan, waiting for the user to review it (plan mode "Review"). */
export function PlanReview({ runId, plan }: { runId: string; plan: PlanView }) {
  const models = useModelsInfo();
  const approve = useApprovePlan();
  const [spec, setSpec] = useState(plan.spec);
  const [tasks, setTasks] = useState<EditableTask[]>(() =>
    plan.tasks.map((task) => ({
      key: task.key,
      title: task.title,
      instructions: task.instructions,
      category: task.category ?? 'chat',
      model: task.model ?? '',
      effort: task.effort,
      dependsOn: task.dependsOn,
      outputs: task.outputs.join(', '),
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const workflow = plan.kind === 'workflow';
  const options = models.data?.models.filter((model) => model.usable) ?? [];
  const valid = tasks.every((task) => task.title.trim() && task.instructions.trim() && task.model);

  const update = (key: string, patch: Partial<EditableTask>) =>
    setTasks((current) => current.map((task) => (task.key === key ? { ...task, ...patch } : task)));

  const remove = (key: string) =>
    setTasks((current) =>
      current
        .filter((task) => task.key !== key)
        .map((task) => ({ ...task, dependsOn: task.dependsOn.filter((dep) => dep !== key) })),
    );

  const add = () =>
    setTasks((current) => {
      let n = current.length + 1;
      while (current.some((task) => task.key === `t${n}`)) n++;
      return [
        ...current,
        {
          key: `t${n}`,
          title: 'New task',
          instructions: '',
          category: 'chat',
          model: current[0]?.model ?? options[0]?.id ?? '',
          effort: null,
          dependsOn: [],
          outputs: '',
        },
      ];
    });

  const run = async () => {
    setError(null);
    try {
      await approve.mutateAsync({
        runId,
        spec,
        tasks: tasks.map((task) => ({
          ...task,
          outputs: task.outputs
            .split(',')
            .map((path) => path.trim())
            .filter(Boolean),
        })),
      });
    } catch (runError) {
      setError(errorMessage(runError));
    }
  };

  return (
    <section
      data-testid="plan-review"
      aria-label="Review the plan"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm"
    >
      <header className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <ListChecks className="mt-0.5 size-5 text-brand" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">
            {workflow ? `Review the plan: ${tasks.length} tasks` : 'Review the answer plan'}
          </h3>
          <p className="text-sm text-muted-foreground">{plan.summary}</p>
        </div>
        <Estimate plan={plan} />
      </header>

      {workflow && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Spec (every task receives it)
          </span>
          <Textarea
            aria-label="Spec"
            value={spec}
            onChange={(event) => setSpec(event.target.value)}
            className="max-h-64 rounded-lg border px-3 py-2 font-mono text-[13px]"
          />
        </label>
      )}

      <ol className="flex flex-col gap-3">
        {tasks.map((task, index) => (
          <li
            key={task.key}
            data-testid="plan-task"
            className="flex flex-col gap-2 rounded-lg border bg-background p-3"
          >
            <div className="flex items-center gap-2">
              {workflow ? (
                <Input
                  aria-label={`Task ${index + 1} title`}
                  value={task.title}
                  onChange={(event) => update(task.key, { title: event.target.value })}
                  className="h-8 flex-1 font-medium"
                />
              ) : (
                <span className="flex-1 text-sm font-medium">Answer</span>
              )}
              {workflow && tasks.length > 1 && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${task.title}`}
                  onClick={() => remove(task.key)}
                >
                  <Trash />
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ModelSelect
                label={`Model for ${task.title}`}
                value={task.model}
                options={options}
                onChange={(model) => {
                  const efforts = options.find((option) => option.id === model)?.efforts ?? [];
                  update(task.key, {
                    model,
                    effort: task.effort && efforts.includes(task.effort) ? task.effort : null,
                  });
                }}
              />
              <EffortSelect
                label={`Effort for ${task.title}`}
                value={task.effort}
                efforts={options.find((option) => option.id === task.model)?.efforts ?? []}
                onChange={(effort) => update(task.key, { effort })}
              />
            </div>
            <Textarea
              aria-label={`Instructions for ${task.title}`}
              value={task.instructions}
              placeholder="What should this model do?"
              onChange={(event) => update(task.key, { instructions: event.target.value })}
              className="max-h-48 min-h-12 rounded-lg border px-3 py-2 text-sm"
            />
            {workflow && (
              <div className="flex flex-col gap-2 text-xs">
                <label className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-muted-foreground">Files</span>
                  <Input
                    aria-label={`Files for ${task.title}`}
                    value={task.outputs}
                    placeholder="e.g. src/game.js, README.md"
                    onChange={(event) => update(task.key, { outputs: event.target.value })}
                    className="h-7 font-mono text-xs"
                  />
                </label>
                {index > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="w-12 shrink-0 text-muted-foreground">After</span>
                    {tasks.slice(0, index).map((earlier) => {
                      const on = task.dependsOn.includes(earlier.key);
                      return (
                        <button
                          key={earlier.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            update(task.key, {
                              dependsOn: on
                                ? task.dependsOn.filter((dep) => dep !== earlier.key)
                                : [...task.dependsOn, earlier.key],
                            })
                          }
                          className={cn(
                            'rounded-full border px-2 py-0.5 transition-colors',
                            on ? 'border-brand bg-brand/10 text-brand' : 'text-muted-foreground',
                          )}
                        >
                          {earlier.title}
                        </button>
                      );
                    })}
                  </div>
                )}
                {plan.tasks.find((t) => t.key === task.key)?.rationale && (
                  <p className="text-muted-foreground italic">
                    {plan.tasks.find((t) => t.key === task.key)?.rationale}
                  </p>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <footer className="flex flex-wrap items-center gap-2">
        {workflow && tasks.length < 12 && (
          <Button size="sm" variant="outline" onClick={add}>
            <Plus /> Add task
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void window.ull.chats.stop(runId)}>
            <X /> Cancel
          </Button>
          <Button size="sm" disabled={!valid || approve.isPending} onClick={() => void run()}>
            <Play /> Run
          </Button>
        </div>
      </footer>
    </section>
  );
}

function Estimate({ plan }: { plan: PlanView }) {
  const cost = formatCost(plan.estimate.costUsd);
  const time = formatSeconds(plan.estimate.seconds);
  if (!cost && !time) return null;
  return (
    <span className="text-xs text-muted-foreground" title="Rough estimate at list prices">
      ≈ {[cost, time && `~${time}`].filter(Boolean).join(' · ')}
    </span>
  );
}

function ModelSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly ModelOption[];
  onChange: (model: string) => void;
}) {
  const known = options.some((option) => option.id === value);
  return (
    <NativeSelect aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {!known && value && <option value={value}>{value}</option>}
      {PROVIDER_LIST.map((provider: ProviderId) => {
        const group = options.filter((option) => option.provider === provider);
        if (group.length === 0) return null;
        return (
          <optgroup key={provider} label={PROVIDER_NAMES[provider]}>
            {group.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} (${option.inputPerM}/${option.outputPerM})
              </option>
            ))}
          </optgroup>
        );
      })}
    </NativeSelect>
  );
}

function EffortSelect({
  label,
  value,
  efforts,
  onChange,
}: {
  label: string;
  value: Effort | null;
  efforts: readonly Effort[];
  onChange: (effort: Effort | null) => void;
}) {
  if (efforts.length === 0) {
    return <span className="text-xs text-muted-foreground">Default reasoning</span>;
  }
  return (
    <NativeSelect
      aria-label={label}
      value={value ?? ''}
      onChange={(event) => onChange((event.target.value || null) as Effort | null)}
    >
      <option value="">Default effort</option>
      {efforts.map((effort) => (
        <option key={effort} value={effort}>
          {effort[0]!.toUpperCase() + effort.slice(1)} effort
        </option>
      ))}
    </NativeSelect>
  );
}

/** The workflow's spec, collapsed. */
export function SpecDetails({ spec }: { spec: string }) {
  if (!spec.trim()) return null;
  return (
    <details className="group rounded-lg border bg-card text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground select-none">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" /> Spec
      </summary>
      <div className="border-t px-3 py-2">
        <Markdown text={spec} />
      </div>
    </details>
  );
}
