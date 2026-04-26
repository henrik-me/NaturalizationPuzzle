import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Service worker registration on the dev server is sensitive to parallel
  // load — multiple browser contexts hammering the Vite dev server at once
  // can cause SW activation to race with the first navigation. Run tests
  // serially so each test gets a clean SW lifecycle.
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'https://localhost:5173',
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      // The dev server uses a self-signed cert from @vitejs/plugin-basic-ssl.
      // ignoreHTTPSErrors allows page navigation, but Chromium refuses to
      // register a service worker on a page with an untrusted certificate
      // (it is not a "secure context"). This flag relaxes that so the PWA
      // service worker can install and serve cached content offline.
      args: ['--ignore-certificate-errors'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: [
    {
      command: 'cd ../../src/api && dotnet run --launch-profile https',
      url: 'https://localhost:7075/api/v1/states',
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: 'cd ../../src/client && npm run dev',
      url: 'https://localhost:5173',
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env.CI,
      timeout: 15000,
    },
  ],
});
