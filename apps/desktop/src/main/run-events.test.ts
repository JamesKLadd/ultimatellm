import type { ChatRunEvent } from '@ultimatellm/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { batchTextEvents } from './run-events';

afterEach(() => vi.useRealTimers());

describe('batchTextEvents', () => {
  it('merges text deltas per step and keeps event order', () => {
    vi.useFakeTimers();
    const sent: ChatRunEvent[] = [];
    const emit = batchTextEvents((event) => sent.push(event));
    const ids = { runId: 'r1', chatId: 'c1' };

    emit({ type: 'text', ...ids, step: 't1', delta: 'Hel' });
    emit({ type: 'text', ...ids, step: 't2', delta: 'Other' });
    emit({ type: 'text', ...ids, step: 't1', delta: 'lo' });
    expect(sent).toEqual([]);

    vi.advanceTimersByTime(30);
    expect(sent).toEqual([
      { type: 'text', ...ids, step: 't1', delta: 'Hello' },
      { type: 'text', ...ids, step: 't2', delta: 'Other' },
    ]);

    emit({ type: 'text', ...ids, step: 't1', delta: ' world' });
    emit({ type: 'finished', ...ids, status: 'complete' });
    expect(sent.slice(2)).toEqual([
      { type: 'text', ...ids, step: 't1', delta: ' world' },
      { type: 'finished', ...ids, status: 'complete' },
    ]);
  });
});
