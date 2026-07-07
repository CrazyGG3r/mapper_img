import { defineConfig, devices } from '@playwright/test';

/**
 * This suite drives a *running* apps/web (@topview/web) as a black box over
 * HTTP — it never imports from apps/web/src (see tests/e2e/package.json and
 * docs/architecture.md's "no workspace:* / no cross-boundary imports" rule).
 *
 * apps/web's dev script is plain Vite (`apps/web/package.json#scripts.dev`
 * -> "vite"), which binds Vite's default port, 5173, unless overridden.
 * We pin --strictPort so a stale process silently shifting to 5174 can never
 * make this config point at the wrong server.
 */
const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Boots apps/web itself so the suite is runnable with a single `npm test`
  // here, and so CI doesn't need a separately-managed dev server process.
  webServer: {
    // Run through the root workspace alias (`-w @topview/web`) rather than a
    // hardcoded relative path, so this keeps working regardless of where the
    // command is invoked from, as long as `npm ci` has run at the repo root.
    command: `npm run dev -w @topview/web -- --port ${PORT} --strictPort`,
    // Relative to this config file's directory (tests/e2e) -> repo root.
    cwd: '../..',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
