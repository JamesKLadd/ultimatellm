import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { AppDatabase } from './client';
import { chats, messages, plans, planSteps } from './schema';

export type ChatRow = typeof chats.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type NewMessage = Omit<typeof messages.$inferInsert, 'id' | 'createdAt'>;
export type MessagePatch = Partial<Omit<NewMessage, 'chatId' | 'role'>>;
export type PlanRow = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type StepRow = typeof planSteps.$inferSelect;
export type NewStep = Omit<typeof planSteps.$inferInsert, 'id'>;

export interface ChatStore {
  /** Most recently active first. */
  listChats(): ChatRow[];
  getChat(id: string): ChatRow | undefined;
  /** Oldest first. */
  getMessages(chatId: string): MessageRow[];
  createChat(title: string, now: Date): ChatRow;
  /** Adds a message and marks the chat as recently active. */
  addMessage(message: NewMessage, now: Date): MessageRow;
  updateMessage(id: string, patch: MessagePatch): void;
  removeChat(id: string): void;
  /** Saves a message's plan, replacing an earlier version (e.g. after a review edit). */
  savePlan(plan: NewPlan): void;
  /** Adds or updates a step, matched by message and key. */
  saveStep(step: NewStep): void;
  /** Removes a message's steps whose keys aren't listed (tasks deleted in review). */
  pruneSteps(messageId: string, keepKeys: readonly string[]): void;
  getPlans(messageIds: readonly string[]): PlanRow[];
  /** Steps of the given messages, in order. */
  getSteps(messageIds: readonly string[]): StepRow[];
  /**
   * Marks replies that were still running (the app quit or crashed) as
   * interrupted. Returns how many there were.
   */
  interruptRunning(): number;
}

const INTERRUPTED = 'The app closed before this reply finished.';

export function createChatStore(db: AppDatabase): ChatStore {
  const getChat = (id: string) => db.select().from(chats).where(eq(chats.id, id)).get();
  const getMessage = (id: string) => db.select().from(messages).where(eq(messages.id, id)).get();

  return {
    listChats: () =>
      db
        .select()
        .from(chats)
        .orderBy(desc(chats.updatedAt), desc(sql`rowid`))
        .all(),

    getChat,

    getMessages: (chatId) =>
      db
        .select()
        .from(messages)
        .where(eq(messages.chatId, chatId))
        // Insertion order breaks ties between messages saved in the same millisecond.
        .orderBy(asc(messages.createdAt), asc(sql`rowid`))
        .all(),

    createChat(title, now) {
      const id = crypto.randomUUID();
      db.insert(chats).values({ id, title, kind: 'local', createdAt: now, updatedAt: now }).run();
      const row = getChat(id);
      if (!row) throw new Error('Chat was not saved');
      return row;
    },

    addMessage(message, now) {
      const id = crypto.randomUUID();
      db.transaction((tx) => {
        tx.insert(messages)
          .values({ ...message, id, createdAt: now })
          .run();
        tx.update(chats).set({ updatedAt: now }).where(eq(chats.id, message.chatId)).run();
      });
      const row = getMessage(id);
      if (!row) throw new Error('Message was not saved');
      return row;
    },

    updateMessage(id, patch) {
      db.update(messages).set(patch).where(eq(messages.id, id)).run();
    },

    removeChat(id) {
      db.delete(chats).where(eq(chats.id, id)).run();
    },

    savePlan(plan) {
      const { messageId: _key, ...rest } = plan;
      db.insert(plans)
        .values(plan)
        .onConflictDoUpdate({ target: plans.messageId, set: rest })
        .run();
    },

    saveStep(step) {
      const { messageId: _message, key: _key, ...rest } = step;
      db.insert(planSteps)
        .values({ ...step, id: crypto.randomUUID() })
        .onConflictDoUpdate({ target: [planSteps.messageId, planSteps.key], set: rest })
        .run();
    },

    pruneSteps(messageId, keepKeys) {
      const steps = db
        .select({ key: planSteps.key })
        .from(planSteps)
        .where(eq(planSteps.messageId, messageId))
        .all();
      const stale = steps.map((step) => step.key).filter((key) => !keepKeys.includes(key));
      if (stale.length === 0) return;
      db.delete(planSteps)
        .where(and(eq(planSteps.messageId, messageId), inArray(planSteps.key, stale)))
        .run();
    },

    getPlans: (messageIds) =>
      messageIds.length === 0
        ? []
        : db
            .select()
            .from(plans)
            .where(inArray(plans.messageId, [...messageIds]))
            .all(),

    getSteps: (messageIds) =>
      messageIds.length === 0
        ? []
        : db
            .select()
            .from(planSteps)
            .where(inArray(planSteps.messageId, [...messageIds]))
            .orderBy(asc(planSteps.position), asc(sql`rowid`))
            .all(),

    interruptRunning() {
      return db.transaction((tx) => {
        const running = tx
          .select({ id: messages.id })
          .from(messages)
          .where(eq(messages.status, 'running'))
          .all()
          .map((row) => row.id);
        if (running.length === 0) return 0;
        tx.update(messages)
          .set({ status: 'error', error: INTERRUPTED })
          .where(inArray(messages.id, running))
          .run();
        tx.update(planSteps)
          .set({ status: 'stopped' })
          .where(and(inArray(planSteps.messageId, running), eq(planSteps.status, 'running')))
          .run();
        tx.update(planSteps)
          .set({ status: 'skipped' })
          .where(and(inArray(planSteps.messageId, running), eq(planSteps.status, 'queued')))
          .run();
        return running.length;
      });
    },
  };
}
