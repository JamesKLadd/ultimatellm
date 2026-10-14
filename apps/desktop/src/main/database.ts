import { join } from 'node:path';
import { app } from 'electron';
import { openDatabase, type DatabaseHandle } from '@ultimatellm/db';

/** Opens (and migrates) the local database in the app's user-data folder. */
export function openAppDatabase(): DatabaseHandle {
  return openDatabase({
    file: join(app.getPath('userData'), 'ultimatellm.db'),
    // Copied next to the main bundle at build time (see electron.vite.config.ts).
    migrationsFolder: join(__dirname, 'migrations'),
  });
}
