import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests in the browser against the runtime demo (`ng serve runtime`, data simulated in the browser). Build the
 * libraries and copy the examples first: `npm run demo:prepare`.
 */
const port = Number(process.env['E2E_PORT'] ?? 4300);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'en-GB',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node node_modules/@angular/cli/bin/ng.js serve runtime --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
