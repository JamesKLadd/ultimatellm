import type { ChatMessage, MessageStep } from '@ultimatellm/shared';
import { cn } from '@ultimatellm/ui';
import { ChevronRight } from 'lucide-react';
import { formatCost, formatSeconds } from '../lib/format';
import { PROVIDER_UI } from '../lib/providers';
import { Markdown } from './markdown';
import { SpecDetails } from './plan-card';
import { statusLabel } from '../lib/step-status';
import { StepStatusIcon } from './steps';

/**
 * Who did what for a reply: planning, each task and the wrap-up, with model,
 * account, effort, tokens, cost and time, plus each task's instructions and
 * report (R12, R16).
 */
export function MessageDetails({ message }: { message: ChatMessage }) {
  return (
    <div
      data-testid="message-details"
      className="flex flex-col gap-2 rounded-lg border bg-card p-3"
    >
      {message.plan?.manager && (
        <p className="text-xs text-muted-foreground">
          Planned by {message.plan.manager.modelName}
          {message.plan.pinned && ` · you chose ${message.plan.pinned}`}
        </p>
      )}
      {message.plan?.pinned && !message.plan.manager && (
        <p className="text-xs text-muted-foreground">
          You chose {message.plan.pinned}, so no planning was needed.
        </p>
      )}
      {message.plan && <SpecDetails spec={message.plan.spec} />}
      <ol className="flex flex-col gap-1.5">
        {message.steps.map((step) => (
          <StepDetails key={step.key} step={step} isAnswer={message.plan?.kind === 'direct'} />
        ))}
      </ol>
    </div>
  );
}

function StepDetails({ step, isAnswer }: { step: MessageStep; isAnswer: boolean }) {
  const seconds =
    step.startedAt !== null && step.finishedAt !== null
      ? (step.finishedAt - step.startedAt) / 1000
      : null;
  const facts = [
    step.accountLabel,
    step.effort && `${step.effort} effort`,
    step.inputTokens !== null &&
      `${(step.inputTokens ?? 0).toLocaleString()} in / ${(step.outputTokens ?? 0).toLocaleString()} out`,
    formatCost(step.costUsd),
    formatSeconds(seconds),
  ].filter(Boolean);
  // A direct answer's text is the message itself; tasks have instructions and a report.
  const showReport = step.kind === 'task' && !isAnswer && step.report.trim();
  const hasMore =
    Boolean(showReport) || (step.kind === 'task' && !isAnswer) || step.files.length > 0;

  const header = (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
      <StepStatusIcon status={step.status} />
      <span className="font-medium">{step.kind === 'plan' ? 'Planning' : step.title}</span>
      {step.provider && (
        <span className={cn('size-2 rounded-full', PROVIDER_UI[step.provider].dotClass)} />
      )}
      {step.modelName && <span className="text-muted-foreground">{step.modelName}</span>}
      <span className="text-xs text-muted-foreground">{facts.join(' · ')}</span>
      {step.status !== 'done' && (
        <span className="text-xs text-muted-foreground">({statusLabel(step.status)})</span>
      )}
    </div>
  );

  return (
    <li data-testid="source-step" className="rounded-md border bg-background">
      {hasMore ? (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-start gap-1.5 px-2.5 py-2 select-none">
            <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
            {header}
          </summary>
          <div className="flex flex-col gap-2 border-t px-3 py-2 text-sm">
            {step.rationale && (
              <p className="text-xs text-muted-foreground italic">{step.rationale}</p>
            )}
            {step.kind === 'task' && !isAnswer && step.instructions && (
              <section>
                <h4 className="text-xs font-medium text-muted-foreground">Instructions</h4>
                <p className="whitespace-pre-wrap">{step.instructions}</p>
              </section>
            )}
            {step.files.length > 0 && (
              <section>
                <h4 className="text-xs font-medium text-muted-foreground">Files written</h4>
                <p className="font-mono text-xs">{step.files.join(', ')}</p>
              </section>
            )}
            {showReport && (
              <section>
                <h4 className="text-xs font-medium text-muted-foreground">Report</h4>
                <Markdown text={step.report} />
              </section>
            )}
          </div>
        </details>
      ) : (
        <div className="flex items-start gap-1.5 px-2.5 py-2">
          <span className="size-3.5 shrink-0" />
          {header}
        </div>
      )}
      {step.error && <p className="border-t px-3 py-1.5 text-xs text-destructive">{step.error}</p>}
    </li>
  );
}
