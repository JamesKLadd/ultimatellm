import { z } from 'zod';
import { ProviderId } from './providers';

/** What the manager optimizes for when it picks models (see docs/03-orchestration.md). */
export const OutputMode = z.enum(['cheapest', 'balanced', 'best', 'fastest']);
export type OutputMode = z.infer<typeof OutputMode>;

/** Whether the manager's plan runs immediately or waits for the user to review it. */
export const PlanMode = z.enum(['auto', 'review']);
export type PlanMode = z.infer<typeof PlanMode>;

/**
 * Default order for choosing the manager: Grok bot (xAI) first, then Claude,
 * ChatGPT and Gemini. No provider is required; the first one the user has a
 * usable account for manages, and the rest are fallbacks in the same order.
 */
export const DEFAULT_MANAGER_PRIORITY: readonly ProviderId[] = Object.freeze([
  'xai',
  'anthropic',
  'openai',
  'google',
]);

/** The user's manager order, as saved in settings. Each provider appears at most once. */
export const ManagerPriority = z
  .array(ProviderId)
  .refine((order) => new Set(order).size === order.length, {
    message: 'Each provider can appear only once',
  });

/**
 * The complete manager order: the saved order, followed by any providers it
 * doesn't mention (e.g. ones added in a later version) in default order.
 */
export function resolveManagerPriority(saved: readonly ProviderId[]): ProviderId[] {
  const order = [...new Set(saved)];
  for (const provider of DEFAULT_MANAGER_PRIORITY) {
    if (!order.includes(provider)) order.push(provider);
  }
  return order;
}

/**
 * Ranks the providers that can act as manager right now. The first entry is
 * the manager; the others take over, in order, if it fails. Returns an empty
 * list when no provider has a usable account.
 */
export function rankManagers(
  saved: readonly ProviderId[],
  usableProviders: Iterable<ProviderId>,
): ProviderId[] {
  const usable = new Set(usableProviders);
  return resolveManagerPriority(saved).filter((provider) => usable.has(provider));
}
