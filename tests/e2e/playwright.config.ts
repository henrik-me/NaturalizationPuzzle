// Two modes:
//   1. Default (dev-stack): no PLAYWRIGHT_BASE_URL set. Playwright launches
//      the local API (https://localhost:7075) and Vite dev server
//      (https://localhost:5173) via webServer blocks, and tests run against
//      the self-signed HTTPS dev stack (ignoreHTTPSErrors + Chromium
//      --ignore-certificate-errors so the PWA service worker can register).
//   2. External target: PLAYWRIGHT_BASE_URL is set (typically to a running
//      container, e.g. http://localhost:8080). Playwright does NOT start any
//      webServer and points baseURL at the external target. Used by the
//      containerized E2E flow (issue #20) and CI.
import { defineConfig } from '@playwright/test';

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const useExternal = !!externalBaseUrl;

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Service worker registration on the dev server is sensitive to parallel
  // load — multiple browser contexts hammering the Vite dev server at once
  // can cause SW activation to race with the first navigation. Run tests
  // serially so each test gets a clean SW lifecycle.
  workers: 1,
  reporter: 'list',
  use: useExternal
    ? {
        baseURL: externalBaseUrl,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
      }
    : {
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
  ...(useExternal
    ? {}
    : {
        webServer: [
          {
            command: 'cd ../../src/api && dotnet run --launch-profile https',
            url: 'https://localhost:7075/api/v1/states',
            ignoreHTTPSErrors: true,
            reuseExistingServer: !process.env.CI,
            // 30 s is enough locally with hot caches but `dotnet run` cold
            // start on the CI runner regularly takes 60-90 s (restore + JIT).
            // Use 2 min so CI doesn't flake on first-run timing.
            timeout: 120_000,
          },
          {
            command: 'cd ../../src/client && npm run dev',
            url: 'https://localhost:5173',
            ignoreHTTPSErrors: true,
            // The client webServer is never reused — we always launch a fresh
            // Vite dev server so the ENABLE_DEV_SW env var below is guaranteed
            // to be in effect (a stale dev server started without it would
            // silently disable the PWA service worker, breaking offline tests).
            reuseExistingServer: false,
            timeout: 120_000,
            env: {
              // The PWA dev service worker is opt-in (see vite.config.ts).
              // E2E tests need it enabled to exercise the offline behavior.
              ENABLE_DEV_SW: 'true',
            },
          },
        ],
      }),
});
