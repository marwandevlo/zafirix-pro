import { defineConfig, devices } from '@playwright/test';

const E2E_PORT = process.env.PLAYWRIGHT_PORT ?? '3001';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${E2E_PORT}`;

/**
 * E2E runs against a dedicated dev server on port 3001 with local data backend
 * so pages load without Supabase auth. Set PLAYWRIGHT_TEST_EMAIL/PASSWORD to
 * exercise authenticated Supabase flows instead.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './tests/global-setup.ts',
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
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npm run build && npm run start',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        env: {
          ...process.env,
          PORT: E2E_PORT,
          ATLAS_E2E_LOCAL: 'true',
          NEXT_PUBLIC_ATLAS_E2E_LOCAL: 'true',
          NEXT_PUBLIC_ATLAS_DATA_BACKEND: 'local',
        },
      },
});
