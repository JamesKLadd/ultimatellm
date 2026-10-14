import type { OutputMode, PlanMode } from '@ultimatellm/shared';
import {
  Button,
  SegmentedControl,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type SegmentedControlOption,
} from '@ultimatellm/ui';
import { ArrowUp, ListChecks, PiggyBank, Play, Scale, Sparkles, Zap } from 'lucide-react';
import { useState } from 'react';
import { useUiStore } from '../state/ui-store';

const OUTPUT_MODES: readonly SegmentedControlOption<OutputMode>[] = [
  {
    value: 'cheapest',
    label: (
      <>
        <PiggyBank /> Cheapest
      </>
    ),
    description: 'The least expensive models that can do the job well',
  },
  {
    value: 'balanced',
    label: (
      <>
        <Scale /> Balanced
      </>
    ),
    description: 'Good quality at a sensible cost',
  },
  {
    value: 'best',
    label: (
      <>
        <Sparkles /> Best
      </>
    ),
    description: 'Top models and deeper thinking, whatever the cost',
  },
  {
    value: 'fastest',
    label: (
      <>
        <Zap /> Fastest
      </>
    ),
    description: 'The quickest models, with little or no thinking time',
  },
];

const PLAN_MODES: readonly SegmentedControlOption<PlanMode>[] = [
  {
    value: 'auto',
    label: (
      <>
        <Play /> Auto
      </>
    ),
    description: 'The manager starts working as soon as it has a plan',
  },
  {
    value: 'review',
    label: (
      <>
        <ListChecks /> Review
      </>
    ),
    description: 'Review and edit the manager’s plan before it runs',
  },
];

export function Composer() {
  const [draft, setDraft] = useState('');
  const outputMode = useUiStore((state) => state.outputMode);
  const setOutputMode = useUiStore((state) => state.setOutputMode);
  const planMode = useUiStore((state) => state.planMode);
  const setPlanMode = useUiStore((state) => state.setPlanMode);

  return (
    <div className="rounded-2xl border bg-card shadow-sm transition-shadow focus-within:shadow-md">
      <Textarea
        aria-label="Message"
        placeholder="Ask anything. The manager will pick the best models for it."
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="max-h-64 px-4 pt-3.5"
      />
      <div className="flex flex-wrap items-center gap-2 px-3 pt-1 pb-3">
        <SegmentedControl
          size="sm"
          aria-label="Output mode"
          value={outputMode}
          onValueChange={setOutputMode}
          options={OUTPUT_MODES}
        />
        <SegmentedControl
          size="sm"
          aria-label="Plan mode"
          value={planMode}
          onValueChange={setPlanMode}
          options={PLAN_MODES}
        />
        <div className="ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Disabled buttons don't receive pointer events, so the wrapper shows the tooltip. */}
              <span tabIndex={0} className="inline-flex rounded-lg outline-none">
                <Button size="icon-sm" disabled aria-label="Send">
                  <ArrowUp />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Connect an AI account to start chatting</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
