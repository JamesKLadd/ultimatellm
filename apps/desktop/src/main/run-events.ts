import type { ChatRunEvent } from '@ultimatellm/shared';

const FLUSH_MS = 30;

/**
 * Wraps an event sender so streamed text is sent in small batches instead of
 * one IPC message per token. Other events flush pending text first, so the
 * order the UI sees never changes.
 */
export function batchTextEvents(
  send: (event: ChatRunEvent) => void,
): (event: ChatRunEvent) => void {
  const pending = new Map<string, Extract<ChatRunEvent, { type: 'text' }>>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    for (const event of pending.values()) send(event);
    pending.clear();
  };

  return (event) => {
    if (event.type === 'text') {
      const key = `${event.runId}\n${event.step}`;
      const buffered = pending.get(key);
      if (buffered) buffered.delta += event.delta;
      else pending.set(key, { ...event });
      timer ??= setTimeout(flush, FLUSH_MS);
      return;
    }
    flush();
    send(event);
  };
}
