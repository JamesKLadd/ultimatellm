import type { ChatRunEvent } from '@ultimatellm/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { batchTextEvents } from './run-events';

afterEach(() => vi.useRealTimers());

describe('batchTextEvents', () => {
  it('merges text deltas and keeps event order', () => {
    vi.useFakeTimers();
    const sent: ChatRunEvent[] = [];
    const emit = batchTextEvents((event) => sent.push(event));
    const ids = { runId: 'r1', chatId: 'c1' };

    emit({ type: 'text', ...ids, delta: 'Hel' });
    emit({ type: 'text', ...ids, delta: 'lo' });
    expect(sent).toEqual([]);

    vi.advanceTimersByTime(30);
    expect(sent).toEqual([{ type: 'text', ...ids, delta: 'Hello' }]);

    emit({ type: 'text', ...ids, delta: ' world' });
    emit({ type: 'finished', ...ids, status: 'complete' });
    expect(sent.slice(1)).toEqual([
      { type: 'text', ...ids, delta: ' world' },
      { type: 'finished', ...ids, status: 'complete' },
    ]);
  });
});
