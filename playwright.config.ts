import { defineConfig, devices } from '@playwright/test';

// Heure de Paris aussi pour le lanceur (§1) : les dates écrites dans les tests (`new Date('2026-10-19T22:00:00')`)
// sont lues à l'heure de Paris, quelle que soit la machine (les serveurs d'intégration sont en UTC).
// Les types de Node ne sont pas chargés (`types: ['vite/client']`) : seule `process.env` est déclarée ici.
declare const process: { env: Record<string, string | undefined> };
process.env.TZ = 'Europe/Paris';

export default defineConfig({
  testDir: './e2e',
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
