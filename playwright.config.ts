import { defineConfig, devices } from '@playwright/test';

// Heure de Paris aussi pour le lanceur (§1) : les dates écrites dans les tests (`new Date('2026-10-19T22:00:00')`)
// sont lues à l'heure de Paris, quelle que soit la machine (les serveurs d'intégration sont en UTC).
// Les types de Node ne sont pas chargés (`types: ['vite/client']`) : seule `process.env` est déclarée ici.
declare const process: { env: Record<string, string | undefined>; cwd(): string };
process.env.TZ = 'Europe/Paris';
// Une seule police pour les tests, quelle que soit la machine : DejaVu Sans, livrée dans e2e/fonts (fontconfig).
process.env.FONTCONFIG_FILE = `${process.cwd()}/e2e/fonts/fonts.conf`;

export default defineConfig({
  testDir: './e2e',
  // Garde : aucun fichier .uuid de fontconfig hors de e2e/fonts à la fin de la passe (e2e/fonts/fonts.conf).
  globalTeardown: './e2e/uuid-guard.mjs',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:4173/MyFitApp/',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/MyFitApp/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
