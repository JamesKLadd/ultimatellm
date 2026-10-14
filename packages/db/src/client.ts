import { DatabaseSync } from 'node:sqlite';
import { drizzle, type NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';

export type AppDatabase = NodeSQLiteDatabase & { $client: DatabaseSync };

export interface OpenDatabaseOptions {
  /** Path to the SQLite file, or `:memory:` for tests. */
  file: string;
  /** Folder of drizzle-kit migrations to apply. */
  migrationsFolder: string;
}

export interface DatabaseHandle {
  db: AppDatabase;
  close(): void;
}

/**
 * Opens the local database and brings its schema up to date.
 * Uses Node's built-in SQLite (`node:sqlite`), so there is no native module to
 * rebuild for Electron.
 */
export function openDatabase({ file, migrationsFolder }: OpenDatabaseOptions): DatabaseHandle {
  const client = new DatabaseSync(file);
  try {
    if (file !== ':memory:') {
      // WAL keeps reads fast while a write is in progress.
      client.exec('PRAGMA journal_mode = WAL;');
    }
    client.exec(
      'PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;',
    );

    const db = drizzle({ client });
    migrate(db, { migrationsFolder });
    return { db, close: () => client.close() };
  } catch (error) {
    client.close();
    throw error;
  }
}
