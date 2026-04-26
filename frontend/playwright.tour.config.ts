import { defineConfig, devices } from '@playwright/test'

/**
 * Config for recording the site tour. Does NOT start a dev server—
 * start the app first (e.g. `npm run dev` or `next dev --port 3001`), then run:
 *   npx playwright test tour.spec.ts --config=playwright.tour.config.ts
 * Video is saved to test-results/.
 */
export default defineConfig({
  testDir: './__tests__/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001',
    trace: 'off',
    video: 'on',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer – use an already-running dev server so we can record the tour
})
