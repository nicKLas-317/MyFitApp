import { expect, test, type Page } from '@playwright/test';
import { ALERT_NOW, alertHistory, type AlertScenario } from '../src/analysis/__tests__/alertes-simulation';
import { tabBar, writeSessions } from './helpers';

/** Taille de police Android agrandie (simulation) : tout le texte à 115 %. */
async function largeText(page: Page): Promise<() => Promise<void>> {
  const style = await page.addStyleTag({ content: ':root { font-size: calc(17px * 1.15) !important; }' });
  return () => style.evaluate((el) => (el as Element).remove());
}

/**
 * Données simulées, l'horloge au `now` donné ; bilans de la semaine et du mois déjà ouverts (seule l'alerte compte),
 * aucune alerte ignorée.
 */
async function open(page: Page, scenario: AlertScenario = {}, now = ALERT_NOW): Promise<void> {
  await page.clock.setFixedTime(new Date(now));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onsuccess = () => {
          const tx = open.result.transaction(['sessions', 'meta'], 'readwrite');
          tx.objectStore('sessions').clear();
          tx.objectStore('meta').put({ week: '2026-11-09', month: '2026-11' }, 'reportsSeen');
          tx.objectStore('meta').delete('groupAlertsIgnored');
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await writeSessions(page, alertHistory(scenario));
  await page.reload();
  await expect(page.getByTestId('weekly-recap')).toBeVisible();
}

const alerts = (page: Page) => page.getByTestId('group-alerts');

/** Géométrie des lignes : hauteurs des éléments tactiles, écarts, débordement, place sous le récapitulatif. */
function layout(page: Page) {
  return page.evaluate(() => {
    const list = document.querySelector('[data-testid="group-alerts"]')!;
    const taps = [...list.querySelectorAll('a, button')].map((e) => e.getBoundingClientRect());
    let closest = Infinity;
    for (let i = 0; i < taps.length; i++)
      for (let j = i + 1; j < taps.length; j++) {
        const a = taps[i]!;
        const b = taps[j]!;
        const dx = Math.max(0, b.left - a.right, a.left - b.right);
        const dy = Math.max(0, b.top - a.bottom, a.top - b.bottom);
        closest = Math.min(closest, Math.max(dx, dy));
      }
    const recap = document.querySelector('[data-testid="weekly-recap"]')!;
    const start = [...document.querySelectorAll('main button')].find((b) => b.textContent?.startsWith('Démarrer'))!;
    return {
      minHeight: Math.min(...taps.map((r) => r.height)),
      closest,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      afterRecap: recap.nextElementSibling === list,
      startVisible: start.getBoundingClientRect().bottom <= window.innerHeight - 56,
      fontSize: getComputedStyle(list.querySelector('li')!).fontSize,
    };
  });
}

test.describe('Alerte « groupe moins travaillé »', () => {
  test('291. Ligne discrète sous le récapitulatif et pastille sur Progrès ; un appui ouvre les séries du groupe ; « Ignorer » jusqu’à la semaine suivante encore sous la moyenne ; 3 lignes au plus ; historique trop court : rien', async ({ page }) => {
    // Dos en baisse 2 semaines, pectoraux 1 semaine seulement, vacances fin septembre : le dos seul.
    await open(page);
    const line = alerts(page).getByRole('listitem');
    await expect(line).toHaveCount(1);
    await expect(line).toHaveAttribute('data-group', 'dos');
    await expect(line.getByRole('link')).toHaveText('Dos : sous ta moyenne depuis 2 semaines');
    await expect(line.getByRole('link')).toHaveAttribute('href', '#/bilan-groupes/dos/series');
    await expect(line.getByRole('button', { name: 'Ignorer l’alerte : Dos' })).toHaveText('Ignorer');
    // Pastille sur l'onglet Progrès, nommée pour le lecteur d'écran.
    await expect(tabBar(page).getByTestId('group-alert-badge')).toBeVisible();
    await expect(tabBar(page).getByRole('link', { name: 'Progrès : groupe sous ta moyenne' })).toBeVisible();
    await expect(tabBar(page).getByTestId('report-badge')).toHaveCount(0);
    // Discrète (15 px), sous le récapitulatif, « Démarrer une séance » toujours à l'écran ; rien ne dépasse.
    for (const [width, big] of [[412, false], [360, false], [320, false], [360, true]] as const) {
      await page.setViewportSize({ width, height: 915 });
      const restore = big ? await largeText(page) : null;
      const l = await layout(page);
      expect(l, `${width} px${big ? ', texte à 115 %' : ''}`).toMatchObject({ afterRecap: true, startVisible: true });
      expect(l.minHeight).toBeGreaterThanOrEqual(48);
      expect(l.closest).toBeGreaterThanOrEqual(8);
      expect(l.overflow).toBeLessThanOrEqual(0);
      expect(l.fontSize).toBe(big ? '17.25px' : '15px');
      await restore?.();
    }
    await page.setViewportSize({ width: 412, height: 915 });

    // Un appui : le graphique du dos, sur les séries par semaine, dans l'onglet Progrès ; « retour » ramène à la Séance.
    await line.getByRole('link').click();
    await expect(page.getByRole('heading', { name: 'Par groupe musculaire' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Groupe musculaire' }).getByRole('button', { name: 'Dos' })).toHaveAttribute('aria-pressed', 'true');
    const sets = page.getByRole('region', { name: 'Séries par semaine' });
    await expect(sets).toBeInViewport();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    // Mêmes séries que l'alerte : 3 et 3 les deux dernières semaines terminées, sous la moyenne du graphique.
    const bars = sets.locator('g[data-main]');
    expect((await bars.evaluateAll((gs) => gs.map((g) => g.getAttribute('data-main')))).slice(-3)).toEqual(['3', '3', '0']);
    // Onze semaines : dates sous les barres sans chevauchement (plus de « 26 oct. » collée à « 9 nov. »), à 412, 360 et 320 px.
    for (const width of [412, 360, 320]) {
      await page.setViewportSize({ width, height: 915 });
      await expect(sets.locator('text[data-date]')).toHaveText(['31 août', '28 sept.', '9 nov.']);
      const gaps = await sets.locator('text[data-date]').evaluateAll((ts) => {
        const r = ts.map((t) => t.getBoundingClientRect());
        return r.slice(1).map((b, i) => b.left - r[i]!.right);
      });
      for (const gap of gaps) expect(gap, `${width} px`).toBeGreaterThanOrEqual(8);
    }
    await page.setViewportSize({ width: 412, height: 915 });
    await expect(tabBar(page).getByRole('link', { name: /^Progrès/ })).toHaveAttribute('aria-current', 'page');
    await page.goBack();
    await expect(page.getByTestId('weekly-recap')).toBeVisible();

    // Onglet Progrès : la même ligne, sous les bilans prêts, au-dessus des bilans.
    await tabBar(page).getByRole('link', { name: /^Progrès/ }).click();
    await expect(page.getByRole('heading', { name: 'Progrès', exact: true })).toBeVisible();
    await expect(alerts(page).getByRole('link')).toHaveText('Dos : sous ta moyenne depuis 2 semaines');

    // « Ignorer » : la ligne et la pastille disparaissent, même après relance (mémorisé sur l'appareil).
    await alerts(page).getByRole('button', { name: 'Ignorer l’alerte : Dos' }).click();
    await expect(alerts(page)).toHaveCount(0);
    await expect(tabBar(page).getByTestId('group-alert-badge')).toHaveCount(0);
    await expect(tabBar(page).getByRole('link', { name: 'Progrès', exact: true })).toBeVisible();
    await page.goto('./');
    await page.reload();
    await expect(page.getByTestId('weekly-recap')).toBeVisible();
    await expect(alerts(page)).toHaveCount(0);
    expect(await page.evaluate(() => new Promise((resolve) => {
      const open = indexedDB.open('myfitapp');
      open.onsuccess = () => {
        const req = open.result.transaction('meta').objectStore('meta').get('groupAlertsIgnored');
        req.onsuccess = () => (open.result.close(), resolve(req.result));
      };
    }))).toEqual({ dos: '2026-11-02' });

    // Une semaine plus tard, le dos encore sous sa moyenne : l'alerte revient.
    const later = new Date(2026, 10, 18, 12).getTime();
    await page.clock.setFixedTime(new Date(later));
    await writeSessions(page, alertHistory({ until: '2026-11-16', dosDown: ['2026-10-26', '2026-11-02', '2026-11-09'] }));
    await page.reload();
    await expect(alerts(page).getByRole('link')).toHaveText('Dos : sous ta moyenne depuis 2 semaines');
    await expect(tabBar(page).getByTestId('group-alert-badge')).toBeVisible();

    // Vacances les deux dernières semaines : tous les groupes sous leur moyenne, 3 lignes au plus, dans l'ordre des groupes.
    await open(page, { vacations: ['2026-10-26', '2026-11-02'], dosDown: [], pecDown: [] });
    await expect(alerts(page).getByRole('link')).toHaveText([
      'Pectoraux : sous ta moyenne depuis 2 semaines',
      'Dos : sous ta moyenne depuis 2 semaines',
      'Épaules : sous ta moyenne depuis 2 semaines',
    ]);
    for (const [width, big] of [[412, false], [360, false], [320, false], [360, true]] as const) {
      await page.setViewportSize({ width, height: 915 });
      const restore = big ? await largeText(page) : null;
      const l = await layout(page);
      expect(l, `${width} px${big ? ', texte à 115 %' : ''}`).toMatchObject({ afterRecap: true, startVisible: true });
      expect(l.minHeight).toBeGreaterThanOrEqual(48);
      expect(l.closest).toBeGreaterThanOrEqual(8);
      expect(l.overflow).toBeLessThanOrEqual(0);
      await restore?.();
    }
    await page.setViewportSize({ width: 412, height: 915 });
    // Avec un bilan prêt en plus : une seule pastille, les deux raisons pour le lecteur d'écran.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const open = indexedDB.open('myfitapp');
          open.onsuccess = () => {
            const tx = open.result.transaction('meta', 'readwrite');
            tx.objectStore('meta').delete('reportsSeen');
            tx.oncomplete = () => (open.result.close(), resolve());
          };
        }),
    );
    await page.reload();
    await expect(tabBar(page).locator('.tab-badge')).toHaveCount(1);
    await expect(tabBar(page).getByRole('link', { name: 'Progrès : bilan prêt, groupe sous ta moyenne' })).toBeVisible();

    // Historique trop court (5 semaines terminées, du 5 oct.), le dos pourtant en baisse : ni ligne ni pastille.
    await open(page, { from: '2026-10-05' });
    await expect(alerts(page)).toHaveCount(0);
    await expect(tabBar(page).locator('.tab-badge')).toHaveCount(0);
    // Pectoraux en baisse une seule semaine : rien.
    await open(page, { dosDown: [] });
    await expect(alerts(page)).toHaveCount(0);
  });
});
