import { defineConfig, devices } from '@playwright/test';

/**
 * Prove end-to-end nel browser contro la demo del runtime (`ng serve runtime`, dati simulati nel browser).
 * Prima vanno compilate le librerie e copiati gli esempi: `npm run demo:prepare`.
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
    locale: 'it-IT',
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
