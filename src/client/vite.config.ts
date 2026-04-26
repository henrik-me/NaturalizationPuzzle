import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    basicSsl(),
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
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^\/(?!api\/).*/],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^\/(?!api\/).*/],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/questions/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'questions-cache' },
          },
          {
            urlPattern: /\/api\/v1\/states/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'states-cache' },
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
