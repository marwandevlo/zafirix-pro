import { defineConfig, devices } from '@playwright/test';

/**
 * Business Studio browser journey against a production build (`next start`) wired to the local
 * Supabase-shaped stack from `serve-stack.mjs`. Not a hosted Supabase verification.
 *   STUDIO_E2E_DIR   folder written by serve-stack.mjs (session.json); downloads go to <dir>/downloads
 *   STUDIO_BASE_URL  defaults to http://127.0.0.1:3107
 */
export default defineConfig({
  testDir: '.',
  testMatch: ['studio-*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  timeout: 600_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.STUDIO_BASE_URL ?? 'http://127.0.0.1:3107',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
