import { expect, test } from '@playwright/test';
import { activeSession, addExercise, validateSets, openScreen, openIllustration } from './helpers';

test.describe('Application installable et hors ligne (§2, §16.13, §17, §21)', () => {
  test('manifeste et icônes compatibles avec GitHub Pages (/MyFitApp/)', async ({ page, request }) => {
    await page.goto('./');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('/MyFitApp/manifest.webmanifest');
    const manifest = await (await request.get(href!)).json();
    expect(manifest).toMatchObject({
      name: 'MyFitApp',
      short_name: 'MyFitApp',
      lang: 'fr',
      start_url: '/MyFitApp/',
      scope: '/MyFitApp/',
      display: 'standalone',
      theme_color: '#0f1115',
      background_color: '#0f1115',
    });
    expect(manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? ` ${i.purpose}` : ''}`)).toEqual([
      '192x192',
      '512x512',
      '512x512 maskable',
    ]);
    for (const icon of manifest.icons) {
      const res = await request.get(`/MyFitApp/${icon.src}`);
      expect(res.status(), icon.src).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
    }
    expect((await request.get('/MyFitApp/icons/apple-touch-icon.png')).status()).toBe(200);
  });

  test('50 et §16.13. Réseau coupé : l’application recharge, la recherche, les illustrations et la saisie fonctionnent', async ({ page, context }) => {
    await page.goto('./');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // Une fois le service worker actif, la page rechargée est servie par lui.
    await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);

    await openScreen(page, 'Bibliothèque d’exercices');
    const search = page.getByRole('searchbox', { name: 'Rechercher un exercice' });
    await search.fill('chest press');
    await expect(page.getByRole('list', { name: 'Résultats' }).locator('strong').first()).toHaveText('Chest press');
    await search.fill('dos');
    // Exercices du dos (les trois tirages, leurs trois prises regroupées en une entrée), puis l'oiseau et le face pull.
    await expect(page.getByRole('list', { name: 'Résultats' }).locator('strong')).toHaveCount(12);

    await page.goto('./#/exercice/curl-ischios');
    const img = await openIllustration(page);
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

    await page.goto('./');
    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    const card = await addExercise(page, 'leg curl', 'Leg curl', '40');
    await validateSets(card, 1);
    await expect.poll(async () => (await activeSession(page)).performances[0]?.reps).toEqual([8]);
    await context.setOffline(false);
  });

  test('aucune proposition de mise à jour au premier chargement', async ({ page }) => {
    await page.goto('./');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect(page.getByText('Nouvelle version disponible.')).toHaveCount(0);
  });
});
