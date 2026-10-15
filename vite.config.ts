import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

/** Chemin de publication sur GitHub Pages : nom exact du dépôt, majuscules comprises (§21). */
const BASE = '/MyFitApp/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      // La mise à jour est proposée, jamais imposée : l'utilisateur recharge quand il le souhaite (§21).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: BASE,
        name: 'MyFitApp',
        short_name: 'MyFitApp',
        description: 'Suivi de musculation et surcharge progressive, hors ligne.',
        lang: 'fr',
        dir: 'ltr',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1115',
        theme_color: '#0f1115',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Tout est préchargé, illustrations comprises : l'application fonctionne hors ligne après le premier chargement.
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    include: ['src/**/*.test.ts'],
    // L'application vit à l'heure de Paris : les tests aussi, quelle que soit la machine (intégration continue en UTC).
    env: { TZ: 'Europe/Paris' },
  },
});
