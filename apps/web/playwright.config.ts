// Browser tests: a real Chromium clicks through the shop, checkout, account and admin pages.
// They reuse the API (:4000) and web (:5180) dev servers if already running, otherwise they start them.
// The tests place orders and add accounts, so run `npm run db:reset -w apps/api` afterwards before a demo.
import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;
// BASE_URL points the tests at another copy of the site, e.g. a production build on :4100.
// Only use it on test copies: the tests place orders and add accounts.
const BASE_URL = process.env.BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1, // tests share one demo database
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 }, // the dev server compiles each page on its first visit
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: BASE_URL ?? 'http://localhost:5180', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: BASE_URL ? undefined : [
    { command: 'npm run dev', cwd: '../api', url: 'http://localhost:4000/api/stores', reuseExistingServer: true, timeout: 120_000 },
    { command: 'npm run dev', url: 'http://localhost:5180', reuseExistingServer: true, timeout: 120_000 },
  ],
});
