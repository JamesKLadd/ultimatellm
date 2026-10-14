import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` diffs src/schema.ts against the existing migrations and
// writes a new SQL migration. Migrations are committed and run at app startup.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './migrations',
});
