import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  // Loading data waits for DuckDB-WASM to start (and, for Parquet/JSON, its extension download).
  expect: { timeout: 15_000 },
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // CI tests the production build (built by an earlier CI step); locally reuse the dev server.
  webServer: process.env.CI
    ? { command: 'npm run preview -- --port 5173 --strictPort', url: baseURL }
    : { command: 'npm run dev', url: baseURL, reuseExistingServer: true },
})
