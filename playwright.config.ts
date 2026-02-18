import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  // Run tests in parallel locally; be conservative in CI
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Start Next.js automatically when running tests
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined // if you point to an already-running env (preview/staging), don’t start a server
    : {
        command: 'npm run dev -- --port 3000',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Add these once you’re stable; WebKit is useful if you care about Safari.
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
