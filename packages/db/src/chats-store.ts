import { asc, desc, eq, sql } from 'drizzle-orm';
import type { AppDatabase } from './client';
import { chats, messages } from './schema';

export type ChatRow = typeof chats.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type NewMessage = Omit<typeof messages.$inferInsert, 'id' | 'createdAt'>;
export type MessagePatch = Partial<Omit<NewMessage, 'chatId' | 'role'>>;

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
}

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
  };
}
