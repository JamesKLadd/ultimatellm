import { z } from 'zod';
import { EventChannel, InvokeChannel } from './ipc-channels';
import { ThemePreference } from './settings';

export const AppInfo = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.string(),
  versions: z.object({
    electron: z.string(),
    chrome: z.string(),
    node: z.string(),
  }),
});
export type AppInfo = z.infer<typeof AppInfo>;

/** Commands the main process sends to the UI, e.g. from the app menu or a shortcut. */
export const AppCommand = z.enum(['new-chat', 'open-settings', 'toggle-sidebar']);
export type AppCommand = z.infer<typeof AppCommand>;

/**
 * Renderer → main calls. The main process validates every input against these
 * schemas before running a handler, so a compromised renderer can't send
 * malformed data.
 */
export const invokeContract = {
  [InvokeChannel.appGetInfo]: { input: z.undefined(), output: AppInfo },
  [InvokeChannel.settingsGetTheme]: { input: z.undefined(), output: ThemePreference },
  [InvokeChannel.settingsSetTheme]: { input: ThemePreference, output: z.undefined() },
} as const satisfies Record<string, { input: z.ZodType; output: z.ZodType }>;

export type InvokeChannelName = keyof typeof invokeContract;
/** What the renderer sends. */
export type InvokeInput<C extends InvokeChannelName> = z.input<(typeof invokeContract)[C]['input']>;
/** What a main-process handler receives after validation. */
export type InvokeParsedInput<C extends InvokeChannelName> = z.output<
  (typeof invokeContract)[C]['input']
>;
export type InvokeOutput<C extends InvokeChannelName> = z.output<
  (typeof invokeContract)[C]['output']
>;

/** Main → renderer event payloads. */
export const eventContract = {
  [EventChannel.appCommand]: AppCommand,
} as const satisfies Record<string, z.ZodType>;

export type EventChannelName = keyof typeof eventContract;
export type EventPayload<C extends EventChannelName> = z.output<(typeof eventContract)[C]>;

/** The API the preload script exposes to the UI as `window.ull`. */
export interface UllApi {
  /** `process.platform` of the main process, e.g. `darwin` or `win32`. */
  readonly platform: string;
  app: {
    getInfo(): Promise<AppInfo>;
    /** Subscribes to app commands. Returns an unsubscribe function. */
    onCommand(listener: (command: AppCommand) => void): () => void;
  };
  settings: {
    getTheme(): Promise<ThemePreference>;
    setTheme(theme: ThemePreference): Promise<void>;
  };
}
