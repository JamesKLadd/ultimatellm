import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests only; end-to-end tests in e2e/ run with Playwright.
    include: ['src/**/*.test.ts'],
  },
});
