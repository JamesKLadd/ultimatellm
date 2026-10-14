import { defineConfig } from '@playwright/test';

// End-to-end tests launch the built app (`pnpm build` first) through Playwright's
// Electron support.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
