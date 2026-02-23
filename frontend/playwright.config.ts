import { defineConfig, devices } from '@playwright/test'

const TEST_DB_URL = 'postgresql://test:test@localhost:5555/lake_powell_test'

export default defineConfig({
  testDir: './__tests__/e2e',
  globalSetup: './__tests__/e2e/global-setup.ts',
  globalTeardown: './__tests__/e2e/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `DATABASE_URL="${TEST_DB_URL}" npx next dev --port 3001`,
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})






