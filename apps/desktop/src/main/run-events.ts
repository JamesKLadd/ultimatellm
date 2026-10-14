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
  const pending = new Map<string, { chatId: string; text: string }>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    for (const [runId, { chatId, text }] of pending) {
      send({ type: 'text', runId, chatId, delta: text });
    }
    pending.clear();
  };

  return (event) => {
    if (event.type === 'text') {
      const buffered = pending.get(event.runId);
      if (buffered) buffered.text += event.delta;
      else pending.set(event.runId, { chatId: event.chatId, text: event.delta });
      timer ??= setTimeout(flush, FLUSH_MS);
      return;
    }
    flush();
    send(event);
  };
}
