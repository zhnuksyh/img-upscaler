import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages base path.
// - For a project page (https://<user>.github.io/<repo>/) set VITE_BASE to "/<repo>/".
// - The deploy workflow derives this automatically from the repository name.
// - Falls back to "./" for relative asset loading (works for user/org pages too).
const base = process.env.VITE_BASE ?? './';

// A service worker's scope can't be a relative path, so the PWA needs a real
// absolute base. "./" is fine for plain asset loading but not for the manifest
// /SW, hence this separate value.
const pwaBase = base === './' ? '/' : base;

const THEME = '#8b5cf6';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Vite copies public/* to the root of dist; list them so they're precached.
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'AI Image Upscaler',
        short_name: 'Upscaler',
        description:
          'Real-ESRGAN 2x/4x/8x super-resolution with face restoration on a cloud GPU, plus browser-local resizing.',
        theme_color: THEME,
        background_color: '#020617',
        display: 'standalone',
        orientation: 'any',
        start_url: pwaBase,
        scope: pwaBase,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell (incl. the self-hosted Poppins woff2) so a
        // local downscale / size-fit works with no network at all.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
        navigateFallback: `${pwaBase}index.html`,
        // Never serve a cached upscale: inference must always hit the network,
        // and the base64 payloads would blow past the cache quota anyway.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [],
      },
      devOptions: {
        // Keep the SW out of `vite dev` so HMR isn't served stale assets.
        enabled: false,
      },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
