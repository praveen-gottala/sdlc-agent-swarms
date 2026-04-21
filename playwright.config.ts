import { defineConfig, devices } from '@playwright/test';

/**
 * Dev servers are NOT managed by Playwright — Playwright spawning `next dev` + `vite`
 * alongside --headed Chromium triggered SIGKILL / exit 137 (OOM) on macOS.
 *
 * Instead, `e2e/global-setup.ts` probes :3000 and :4100; if either is missing it aborts
 * the run with an instruction to start them via `npm run dev:dashboard`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'html',
  timeout: 60_000,
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--disable-dev-shm-usage'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
