import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

// basicSsl() makes `vite dev` and `vite preview` serve HTTPS with a
// self-signed cert. We want that locally for parity with the
// production deployment, which is served over HTTPS — running the
// dev/preview servers on HTTP works (service workers are allowed on
// localhost as a secure context), but exercising the PWA chain over
// HTTPS locally surfaces cert/CORS quirks that only otherwise show
// up after deploy. In Lighthouse CI we serve `vite preview` to a
// headless Chrome which would then have to bypass cert validation —
// and lhci's runner + wait-on would too. Setting
// `LHCI_DISABLE_HTTPS=1` (or `=true`) in the CI step keeps preview
// on plain HTTP so the chain stays simple. We trim + lowercase
// before comparing so values like ` TRUE `, `True`, or `1\n` (which
// can sneak in from shell heredocs or CI UIs) behave the same as
// the documented `1` / `true`. Values other than the documented
// truthy set ("1"/"true") leave HTTPS enabled.
const disableHttpsForLhci = ['1', 'true'].includes(
  (process.env.LHCI_DISABLE_HTTPS ?? '').trim().toLowerCase(),
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(disableHttpsForLhci ? [] : [basicSsl()]),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Naturalization Puzzle',
        short_name: 'NatPuzzle',
        description: 'Study for the 2025 USCIS Naturalization Civics Test',
        theme_color: '#1e40af',
        background_color: '#f8fafc',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      devOptions: {
        // Only enable the dev service worker when explicitly requested (e.g.
        // by the Playwright e2e suite). Always-on dev SWs cause confusing
        // stale-asset behavior during normal `npm run dev` iteration.
        enabled: process.env.ENABLE_DEV_SW === 'true',
        type: 'module',
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^\/(?!api(?:\/|\?|$)).*/],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^\/(?!api(?:\/|\?|$)).*/],
        navigateFallbackDenylist: [/^\/api(?:\/|\?|$)/],
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/questions/,
            handler: 'StaleWhileRevalidate',
            // Bumped from 'questions-cache' to '-v2' when Question.Tags was added,
            // then to '-v3' when three new tag namespaces (branches, amendments,
            // civicConcepts) were added so existing service workers don't serve a
            // stale cached response missing those tags after deploy. Bump the
            // suffix again on any future shape change OR meaningful tag-data shift
            // that the UI depends on.
            options: { cacheName: 'questions-cache-v3' },
          },
          {
            urlPattern: /\/api\/v1\/states/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'states-cache' },
          },
          {
            // Story Mode runtime cache. -v2 (catalog expansion adds many
            // new story bodies + index payload changes; older clients on
            // -v1 would otherwise serve a stale 3-story index until SW
            // revalidation completed). Bump this on any change to a
            // story's body, sources, QuestionIds, or to the embedded
            // question text/answers a story returns. Bump
            // questions-cache-vN independently for changes to the
            // standalone /api/v1/questions payload.
            urlPattern: /\/api\/v1\/stories/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'stories-cache-v2' },
          },
          {
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin &&
              ['script', 'style', 'worker', 'image', 'font'].includes(request.destination),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-assets',
              networkTimeoutSeconds: 3,
            },
          },
        ],
      },
    }),
  ],
  server: {
    // Fail fast if 5173 is already in use rather than silently switching
    // to 5174 — Playwright always waits on a fixed URL so a port shift
    // turns into a 30s timeout. With strictPort, the dev-server launch
    // errors out immediately and the e2e suite surfaces the conflict.
    strictPort: true,
    proxy: {
      '/api': {
        target: 'https://localhost:7075',
        secure: false,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
  },
})
