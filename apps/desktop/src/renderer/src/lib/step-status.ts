import type { StepStatus } from '@ultimatellm/shared';
import {
  Circle,
  CircleCheck,
  CircleMinus,
  CircleSlash,
  CircleX,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react';

export const STEP_STATUS: Record<
  StepStatus,
  { icon: LucideIcon; className: string; label: string }
> = {
  queued: { icon: Circle, className: 'text-muted-foreground/50', label: 'Waiting' },
  running: { icon: LoaderCircle, className: 'animate-spin text-brand', label: 'Working' },
  done: { icon: CircleCheck, className: 'text-emerald-600 dark:text-emerald-400', label: 'Done' },
  failed: { icon: CircleX, className: 'text-destructive', label: 'Failed' },
  stopped: { icon: CircleSlash, className: 'text-muted-foreground', label: 'Stopped' },
  skipped: { icon: CircleMinus, className: 'text-muted-foreground/70', label: 'Skipped' },
};

export function statusLabel(status: StepStatus): string {
  return STEP_STATUS[status].label;
}
