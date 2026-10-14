import { describe, expect, it } from 'vitest';
import { eventContract, invokeContract } from './ipc';
import { EventChannel, InvokeChannel } from './ipc-channels';
import { settingDefinitions } from './settings';

describe('invokeContract', () => {
  it('has a schema for every invoke channel', () => {
    expect(Object.keys(invokeContract).sort()).toEqual(Object.values(InvokeChannel).sort());
  });

  it('accepts valid theme input and rejects anything else', () => {
    const { input } = invokeContract[InvokeChannel.settingsSetTheme];
    expect(input.parse('dark')).toBe('dark');
    expect(() => input.parse('purple')).toThrow();
    expect(() => input.parse({ theme: 'dark' })).toThrow();
  });

  it('rejects arguments on channels that take none', () => {
    const { input } = invokeContract[InvokeChannel.appGetInfo];
    expect(input.parse(undefined)).toBeUndefined();
    expect(() => input.parse('unexpected')).toThrow();
  });
});

describe('eventContract', () => {
  it('has a schema for every event channel', () => {
    expect(Object.keys(eventContract).sort()).toEqual(Object.values(EventChannel).sort());
  });
});

describe('settingDefinitions', () => {
  it('has defaults that pass their own schema', () => {
    for (const [key, definition] of Object.entries(settingDefinitions)) {
      expect(definition.schema.safeParse(definition.default).success, key).toBe(true);
    }
  });
});
