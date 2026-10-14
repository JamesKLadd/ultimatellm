import { z } from 'zod';

/** What Grok bot optimizes for when it picks models (see docs/03-orchestration.md). */
export const OutputMode = z.enum(['cheapest', 'balanced', 'best', 'fastest']);
export type OutputMode = z.infer<typeof OutputMode>;

/** Whether Grok bot's plan runs immediately or waits for the user to review it. */
export const PlanMode = z.enum(['auto', 'review']);
export type PlanMode = z.infer<typeof PlanMode>;
