import { defineConfig } from 'vitest/config';

// Unit tests for the simulation models live next to them in src/. Browser tests in tests/e2e run with Playwright.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
