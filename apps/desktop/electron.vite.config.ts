import { cpSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

const dbMigrations = fileURLToPath(new URL('../../packages/db/migrations', import.meta.url));

/**
 * Copies the database migrations next to the main-process bundle
 * (out/main/migrations) so they ship inside the packaged app.
 */
function copyDbMigrations(): Plugin {
  return {
    name: 'ultimatellm:copy-db-migrations',
    writeBundle(options) {
      const target = resolve(options.dir ?? 'out/main', 'migrations');
      rmSync(target, { recursive: true, force: true });
      cpSync(dbMigrations, target, { recursive: true });
    },
  };
}

// All app code and npm packages are bundled (they're devDependencies), so the
// packaged app ships without a node_modules folder.
export default defineConfig({
  main: {
    plugins: [copyDbMigrations()],
    build: {
      rollupOptions: {
        // Built into Electron's Node runtime. Older build-machine Node versions
        // don't list it as a builtin, so mark it external explicitly.
        external: ['node:sqlite'],
        onwarn(warning, warn) {
          // Zod ships comments Rollup can't use as annotations; they're harmless.
          if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('/zod/')) return;
          warn(warning);
        },
      },
    },
  },
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss()],
    build: {
      minify: true,
    },
  },
});
