import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Set BASE_PATH env var when deploying under a sub-path (e.g. GitHub Pages
// project sites: https://<user>.github.io/<repo>/ -> BASE_PATH=/<repo>/)
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-16.png', 'icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'PDF Pro',
        short_name: 'PDF Pro',
        description: 'View, edit, sign, merge, and manage PDFs entirely offline in your browser.',
        theme_color: '#4338CA',
        background_color: '#0f0f14',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        categories: ['productivity', 'utilities'],
      },
      workbox: {
        // .mjs is required here — pdf.worker-*.mjs (~2MB) is what actually
        // renders PDFs; without it precached the app can't open any file
        // once offline. woff/woff2 covers the signature-font fallbacks.
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'document',
            handler: 'NetworkFirst',
            options: { cacheName: 'pages' },
          },
          {
            // pdf.js's cmaps/standard_fonts/wasm (public/pdfjs/) are only
            // needed for specific PDFs (CJK text, JPEG2000 images); cache
            // them the first time they're actually fetched rather than
            // bloating the initial install, so those PDFs still work
            // offline on repeat visits.
            urlPattern: ({ url }) => url.pathname.includes('/pdfjs/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdfjs-assets',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  worker: {
    format: 'es',
  },
})
