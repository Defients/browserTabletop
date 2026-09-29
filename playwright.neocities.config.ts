import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e-static', timeout: 120_000, expect: { timeout: 10_000 }, workers: 1,
  reporter: 'list', outputDir: 'test-results/neocities',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
