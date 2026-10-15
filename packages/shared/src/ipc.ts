import { z } from 'zod';
import {
  AccountIdInput,
  AddApiKeyInput,
  ReorderAccountsInput,
  type AccountSummary,
  type AddAccountResult,
  type ManagerStatus,
} from './accounts';
import {
  ApprovePlanInput,
  ChatIdInput,
  RunIdInput,
  SendMessageInput,
  WorkspaceFileInput,
  type ChatRunEvent,
  type ChatSummary,
  type ChatWithMessages,
  type DataScope,
  type ExportFilesResult,
  type ModelsInfo,
  type SendMessageResult,
  type WorkspaceFile,
  type WorkspaceFileContent,
} from './chats';
import { EventChannel, InvokeChannel } from './ipc-channels';
import { ManagerPriority } from './orchestration';
import type { ProviderId } from './providers';
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
  /** True when offline mock providers stand in for the real APIs (dev/test builds only). */
  mockProviders: z.boolean(),
});
export type AppInfo = z.infer<typeof AppInfo>;

/** Commands the main process sends to the UI, e.g. from the app menu or a shortcut. */
export const AppCommand = z.enum(['new-chat', 'open-settings', 'toggle-sidebar']);
export type AppCommand = z.infer<typeof AppCommand>;

/**
 * Typed placeholder for outputs: the main process is trusted, so its results
 * aren't re-validated at runtime; the schema only carries the type.
 */
const output = <T>() => z.custom<T>(() => true);

/**
 * Renderer → main calls. The main process validates every input against these
 * schemas before running a handler, so a compromised renderer can't send
 * malformed data.
 */
export const invokeContract = {
  [InvokeChannel.appGetInfo]: { input: z.undefined(), output: AppInfo },
  [InvokeChannel.settingsGetTheme]: { input: z.undefined(), output: ThemePreference },
  [InvokeChannel.settingsSetTheme]: { input: ThemePreference, output: z.undefined() },

  [InvokeChannel.accountsList]: { input: z.undefined(), output: output<AccountSummary[]>() },
  [InvokeChannel.accountsAdd]: { input: AddApiKeyInput, output: output<AddAccountResult>() },
  [InvokeChannel.accountsRemove]: { input: AccountIdInput, output: z.undefined() },
  [InvokeChannel.accountsReorder]: { input: ReorderAccountsInput, output: z.undefined() },
  [InvokeChannel.accountsRecheck]: { input: AccountIdInput, output: output<AccountSummary>() },

  [InvokeChannel.managerStatus]: { input: z.undefined(), output: output<ManagerStatus>() },
  [InvokeChannel.managerSetOrder]: { input: ManagerPriority, output: z.undefined() },

  [InvokeChannel.chatsList]: { input: z.undefined(), output: output<ChatSummary[]>() },
  [InvokeChannel.chatsGet]: { input: ChatIdInput, output: output<ChatWithMessages | null>() },
  [InvokeChannel.chatsSend]: { input: SendMessageInput, output: output<SendMessageResult>() },
  [InvokeChannel.chatsStop]: { input: RunIdInput, output: z.undefined() },
  [InvokeChannel.chatsRemove]: { input: ChatIdInput, output: z.undefined() },
  [InvokeChannel.chatsApprovePlan]: { input: ApprovePlanInput, output: z.undefined() },

  [InvokeChannel.workspaceList]: { input: ChatIdInput, output: output<WorkspaceFile[]>() },
  [InvokeChannel.workspaceRead]: {
    input: WorkspaceFileInput,
    output: output<WorkspaceFileContent | null>(),
  },
  [InvokeChannel.workspaceExport]: {
    input: ChatIdInput,
    output: output<ExportFilesResult | null>(),
  },

  [InvokeChannel.modelsInfo]: { input: z.undefined(), output: output<ModelsInfo>() },
  [InvokeChannel.modelsCheckForUpdate]: { input: z.undefined(), output: output<ModelsInfo>() },
  [InvokeChannel.modelsSetAutoUpdate]: { input: z.boolean(), output: z.undefined() },
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
  [EventChannel.chatRun]: output<ChatRunEvent>(),
  [EventChannel.dataChanged]: output<DataScope>(),
} as const satisfies Record<string, z.ZodType>;

export type EventChannelName = keyof typeof eventContract;
export type EventPayload<C extends EventChannelName> = z.output<(typeof eventContract)[C]>;

type Unsubscribe = () => void;

/** The API the preload script exposes to the UI as `window.ull`. */
export interface UllApi {
  /** `process.platform` of the main process, e.g. `darwin` or `win32`. */
  readonly platform: string;
  app: {
    getInfo(): Promise<AppInfo>;
    /** Subscribes to app commands. Returns an unsubscribe function. */
    onCommand(listener: (command: AppCommand) => void): Unsubscribe;
    /** Fires when data changes in the main process, so the UI can refresh it. */
    onDataChanged(listener: (scope: DataScope) => void): Unsubscribe;
  };
  settings: {
    getTheme(): Promise<ThemePreference>;
    setTheme(theme: ThemePreference): Promise<void>;
  };
  accounts: {
    list(): Promise<AccountSummary[]>;
    add(input: z.input<typeof AddApiKeyInput>): Promise<AddAccountResult>;
    remove(id: string): Promise<void>;
    reorder(provider: ProviderId, ids: string[]): Promise<void>;
    recheck(id: string): Promise<AccountSummary>;
  };
  manager: {
    status(): Promise<ManagerStatus>;
    setOrder(order: ProviderId[]): Promise<void>;
  };
  chats: {
    list(): Promise<ChatSummary[]>;
    get(id: string): Promise<ChatWithMessages | null>;
    send(input: z.input<typeof SendMessageInput>): Promise<SendMessageResult>;
    stop(runId: string): Promise<void>;
    remove(id: string): Promise<void>;
    /** Runs a plan that is waiting for review, with the user's edits. */
    approvePlan(input: ApprovePlanInput): Promise<void>;
    onRunEvent(listener: (event: ChatRunEvent) => void): Unsubscribe;
  };
  workspace: {
    list(chatId: string): Promise<WorkspaceFile[]>;
    read(chatId: string, path: string): Promise<WorkspaceFileContent | null>;
    /** Asks for a folder and copies the chat's files into it. Null if cancelled. */
    export(chatId: string): Promise<ExportFilesResult | null>;
  };
  models: {
    info(): Promise<ModelsInfo>;
    /** Downloads the published model registry if it's newer. */
    checkForUpdate(): Promise<ModelsInfo>;
    setAutoUpdate(enabled: boolean): Promise<void>;
  };
}
