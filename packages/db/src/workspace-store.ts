import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { AppDatabase } from './client';
import { workspaceFiles } from './schema';

export type WorkspaceFileRow = typeof workspaceFiles.$inferSelect;
export type NewWorkspaceFile = Omit<
  typeof workspaceFiles.$inferInsert,
  'id' | 'createdAt' | 'size'
>;

/** A file's latest version, without its content. */
export interface WorkspaceEntry {
  path: string;
  size: number;
  mime: string;
  messageId: string;
  stepKey: string;
  updatedAt: Date;
  versions: number;
}

export interface WorkspaceStore {
  /** The current files of a chat, sorted by path. */
  list(chatId: string): WorkspaceEntry[];
  /** The latest version of a file. */
  read(chatId: string, path: string): WorkspaceFileRow | undefined;
  /** Saves a new version of a file. */
  write(file: NewWorkspaceFile, now: Date): WorkspaceFileRow;
  /** Which files each step of the given messages wrote. */
  writtenBy(messageIds: readonly string[]): { messageId: string; stepKey: string; path: string }[];
}

export function createWorkspaceStore(db: AppDatabase): WorkspaceStore {
  return {
    list(chatId) {
      const rows = db
        .select({
          path: workspaceFiles.path,
          size: workspaceFiles.size,
          mime: workspaceFiles.mime,
          messageId: workspaceFiles.messageId,
          stepKey: workspaceFiles.stepKey,
          createdAt: workspaceFiles.createdAt,
        })
        .from(workspaceFiles)
        .where(eq(workspaceFiles.chatId, chatId))
        .orderBy(asc(workspaceFiles.createdAt), asc(sql`rowid`))
        .all();
      const latest = new Map<string, WorkspaceEntry>();
      for (const row of rows) {
        const versions = (latest.get(row.path)?.versions ?? 0) + 1;
        latest.set(row.path, {
          path: row.path,
          size: row.size,
          mime: row.mime,
          messageId: row.messageId,
          stepKey: row.stepKey,
          updatedAt: row.createdAt,
          versions,
        });
      }
      return [...latest.values()].sort((a, b) => a.path.localeCompare(b.path));
    },

    read: (chatId, path) =>
      db
        .select()
        .from(workspaceFiles)
        .where(and(eq(workspaceFiles.chatId, chatId), eq(workspaceFiles.path, path)))
        .orderBy(desc(workspaceFiles.createdAt), desc(sql`rowid`))
        .limit(1)
        .get(),

    write(file, now) {
      const id = crypto.randomUUID();
      const size = new TextEncoder().encode(file.content).byteLength;
      db.insert(workspaceFiles)
        .values({ ...file, id, size, createdAt: now })
        .run();
      const row = db.select().from(workspaceFiles).where(eq(workspaceFiles.id, id)).get();
      if (!row) throw new Error('File was not saved');
      return row;
    },

    writtenBy: (messageIds) =>
      messageIds.length === 0
        ? []
        : db
            .selectDistinct({
              messageId: workspaceFiles.messageId,
              stepKey: workspaceFiles.stepKey,
              path: workspaceFiles.path,
            })
            .from(workspaceFiles)
            .where(inArray(workspaceFiles.messageId, [...messageIds]))
            .all(),
  };
}
