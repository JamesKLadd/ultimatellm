import type { ProviderId, StepKind, StepStatus } from '@ultimatellm/shared';
import { cn } from '@ultimatellm/ui';
import { RotateCw } from 'lucide-react';
import { formatCost } from '../lib/format';
import { STEP_STATUS } from '../lib/step-status';
import { PROVIDER_UI } from '../lib/providers';

export function StepStatusIcon({ status, className }: { status: StepStatus; className?: string }) {
  const { icon: Icon, className: tone, label } = STEP_STATUS[status];
  return <Icon aria-label={label} className={cn('size-4 shrink-0', tone, className)} />;
}

/** What a step row needs, from a live run or a saved message. */
export interface DisplayStep {
  key: string;
  kind: StepKind;
  title: string;
  status: StepStatus;
  provider: ProviderId | null;
  modelName: string | null;
  accountLabel: string | null;
  files: string[];
  error: string | null;
  costUsd: number | null;
  notice?: string | null;
  /** Streamed text so far, for live steps. */
  text?: string;
}

/**
 * One status bar per step (R15): who is working on what, and how far along
 * it is. Used while a reply runs and, collapsed, for saved workflow replies.
 */
export function StepList({ steps }: { steps: readonly DisplayStep[] }) {
  return (
    <ol data-testid="activity-strip" className="flex flex-col gap-1.5">
      {steps.map((step) => (
        <li
          key={step.key}
          data-testid="step-row"
          data-step={step.key}
          data-status={step.status}
          className="flex flex-col gap-1 rounded-lg border bg-card px-3 py-2"
        >
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <StepStatusIcon status={step.status} />
            <span className="truncate font-medium">{step.title}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              {step.provider && (
                <span className={cn('size-2 rounded-full', PROVIDER_UI[step.provider].dotClass)} />
              )}
              {step.modelName && <span className="text-foreground/80">{step.modelName}</span>}
              {step.accountLabel && <span>· {step.accountLabel}</span>}
              {step.files.length > 0 && (
                <span>
                  · {step.files.length} file{step.files.length === 1 ? '' : 's'}
                </span>
              )}
              {formatCost(step.costUsd) && <span>· {formatCost(step.costUsd)}</span>}
            </span>
          </div>
          <StatusBar status={step.status} />
          {step.notice && step.status === 'running' && (
            <p
              className="flex items-center gap-1 text-xs text-muted-foreground"
              title={step.notice}
            >
              <RotateCw className="size-3" /> Switched after an error
            </p>
          )}
          {step.error && (step.status === 'failed' || step.status === 'skipped') && (
            <p className="text-xs text-destructive">{step.error}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

function StatusBar({ status }: { status: StepStatus }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
      <div
        className={cn(
          'h-full rounded-full transition-all duration-500',
          status === 'queued' && 'w-0',
          status === 'running' && 'w-2/3 animate-pulse bg-brand',
          status === 'done' && 'w-full bg-emerald-500',
          status === 'failed' && 'w-full bg-destructive',
          (status === 'stopped' || status === 'skipped') && 'w-full bg-muted-foreground/30',
        )}
      />
    </div>
  );
}

/** A compact line of pills for direct answers: planning, then the answering model. */
export function StepPills({ steps }: { steps: readonly DisplayStep[] }) {
  return (
    <div data-testid="activity-strip" className="flex flex-wrap items-center gap-2 text-xs">
      {steps.map((step) => (
        <span
          key={step.key}
          data-testid="step-pill"
          data-status={step.status}
          className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-muted-foreground"
        >
          <StepStatusIcon status={step.status} className="size-3.5" />
          <span>{step.kind === 'plan' ? 'Planning' : step.title}</span>
          {step.modelName && <span className="font-medium text-foreground">{step.modelName}</span>}
          {step.accountLabel && <span>· {step.accountLabel}</span>}
          {step.notice && step.status === 'running' && (
            <span title={step.notice} className="inline-flex items-center gap-1">
              · <RotateCw className="size-3" /> switched
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
