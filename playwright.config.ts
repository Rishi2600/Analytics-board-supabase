import { defineConfig, devices } from '@playwright/test'

/**
 * End to end tests against the real stack.
 *
 * These cover the three flows where a failure is invisible to unit tests and fatal to the
 * product: getting in, creating a credential, and seeing data arrive. Everything else is
 * covered more cheaply somewhere else.
 *
 * The web server is started by Playwright, so `npm run test:e2e` is one command. The
 * Supabase stack has to already be running: starting Docker from a test runner makes the
 * first run take ten minutes and hides what actually failed.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? 'list' : 'html',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Signing in is both a test and the setup for the other two, so the session is
    // produced once by the real magic link flow and reused rather than faked.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    // Vite directly rather than through npm: the nested workspace script mangles the
    // flags before they reach it.
    command: 'npx vite --host 127.0.0.1 --port 5173',
    cwd: 'apps/web',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
