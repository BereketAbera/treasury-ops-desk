import { defineConfig, devices } from '@playwright/test'

// With E2E_BASE_URL set the suite runs against that address (the live deploy).
// Without it, the suite serves the local production build on port 3401.
const liveUrl = process.env.E2E_BASE_URL
const baseURL = liveUrl ?? 'http://localhost:3401'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: liveUrl ? 3 : 4,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  // Chromium runs everything. Firefox and WebKit run the tests tagged @smoke: one pass through each main flow.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'firefox', grep: /@smoke/, use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
    { name: 'webkit', grep: /@smoke/, use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: liveUrl
    ? undefined
    : {
        command: 'pnpm preview',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 60_000,
      },
})
