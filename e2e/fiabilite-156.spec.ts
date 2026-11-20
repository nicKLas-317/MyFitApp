import { expect, test, type Page } from '@playwright/test';
import { ALERT_NOW, alertHistory } from '../src/analysis/__tests__/alertes-simulation';
import { simulatedHistory } from '../src/analysis/__tests__/simulation';
import type { Session } from '../src/domain/types';
import { addExercise, openSettingsSection, reloadAfterWrites, startSession, validateSets, waitForWrites, writeSessions } from './helpers';

/** Version 1.56.0 : fiabilité et bugs de l'audit du 20 novembre 2026. */

/**
 * Stockage persistant simulé : le navigateur des tests le refuse toujours. `grant` : réponse de `persist()` et de
 * `persisted()` ; le nombre d'appels à `persist()` est compté dans `window.__persistCalls`.
 */
async function stubStorage(page: Page, grant: boolean): Promise<void> {
  await page.addInitScript((g) => {
    const w = window as unknown as { __persistCalls: number; __grant: boolean };
    w.__persistCalls = 0;
    w.__grant = g;
    Object.defineProperty(StorageManager.prototype, 'persisted', { configurable: true, value: async () => w.__grant });
    Object.defineProperty(StorageManager.prototype, 'persist', {
      configurable: true,
      value: async () => {
        w.__persistCalls++;
        return w.__grant;
      },
    });
  }, grant);
}

const persistCalls = (page: Page) => page.evaluate(() => (window as unknown as { __persistCalls: number }).__persistCalls);

/** Mémoire de l'appareil écrite directement en base (réglages d'une version antérieure, dernier export). */
async function putMeta(page: Page, entries: [string, unknown][]): Promise<void> {
  await page.evaluate(
    (list) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onsuccess = () => {
          const tx = open.result.transaction('meta', 'readwrite');
          for (const [k, v] of list) tx.objectStore('meta').put(v, k);
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    entries,
  );
}

const NOW = new Date('2026-11-20T18:00:00+01:00').getTime();
const DAY = 24 * 60 * 60 * 1000;

/** Une séance terminée le mardi 17 novembre, après le dernier export (le 12). */
function tuesday(): Session {
  const start = new Date(2026, 10, 17, 18).getTime();
  return {
    id: 'mardi-17', name: 'Séance du 17 novembre 2026 — 18 h 00', date: '2026-11-17', startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start,
    origin: 'app', state: 'done', performances: [{ variantId: 'pec-deck', weightKg: 30, targetReps: 9, plannedSets: 3, reps: [9, 9, 9], feeling: 'bien' }],
  };
}

async function openWithBackup(page: Page, grant: boolean): Promise<void> {
  await stubStorage(page, grant);
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto('./');
  await expect(page.getByTestId('weekly-recap')).toBeVisible();
  // Base d'une version antérieure : stockage déjà demandé une fois (au premier lancement), dernier export il y a 8 jours.
  await putMeta(page, [['persistRequested', true], ['lastExportAt', NOW - 8 * DAY]]);
  await writeSessions(page, [tuesday()]);
  await reloadAfterWrites(page);
  await expect(page.getByTestId('weekly-recap')).toBeVisible();
}

test.describe('Fiabilité (version 1.56.0)', () => {
  test('329. Stockage persistant redemandé à chaque lancement et après une séance terminée, bouton « Redemander au navigateur » ; refusé : rappel de sauvegarde après 7 jours, avec export direct', async ({ page }) => {
    await openWithBackup(page, false);
    // Demandé au lancement, même déjà demandé par une version antérieure (avant : une seule fois, jamais redemandé).
    await expect.poll(() => persistCalls(page)).toBeGreaterThanOrEqual(1);

    // Accueil : rappel après 7 jours, puisque le stockage n'est pas protégé ; « Exporter » lance la sauvegarde.
    const reminder = page.getByRole('status').filter({ hasText: 'Aucune sauvegarde depuis plus de 7 jours.' });
    await expect(reminder).toHaveText(/Aucune sauvegarde depuis plus de 7 jours\. Ton navigateur ne protège pas tes données\.\s*Exporter/);
    const downloading = page.waitForEvent('download');
    await reminder.getByRole('button', { name: 'Exporter' }).click();
    expect((await downloading).suggestedFilename()).toBe('myfitapp-sauvegarde-2026-11-20.json');
    await expect(reminder).toHaveCount(0);

    // Réglages : « non accordé », et un bouton pour redemander, de 48 px.
    await page.goto('./#/reglages');
    await expect(page.getByTestId('persist-state')).toHaveText('non accordé (le navigateur peut effacer les données en cas de manque de place)');
    const ask = page.getByRole('button', { name: 'Redemander au navigateur' });
    expect((await ask.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    const before = await persistCalls(page);
    await ask.click();
    await expect(page.getByRole('status').filter({ hasText: 'Toujours refusé' })).toHaveText('Toujours refusé : pense à sauvegarder régulièrement (Importer / exporter).');
    expect(await persistCalls(page)).toBe(before + 1);
    // Accordé cette fois : l'état change, le bouton disparaît.
    await page.evaluate(() => ((window as unknown as { __grant: boolean }).__grant = true));
    await ask.click();
    await expect(page.getByTestId('persist-state')).toHaveText('accordé');
    await expect(ask).toHaveCount(0);

    // Redemandé après une séance terminée.
    await page.evaluate(() => ((window as unknown as { __grant: boolean }).__grant = false));
    await page.reload();
    await expect.poll(() => persistCalls(page)).toBeGreaterThanOrEqual(1);
    await startSession(page);
    const card = await addExercise(page, 'pec deck', 'Pec deck');
    await validateSets(card, 3);
    const calls = await persistCalls(page);
    await page.getByRole('button', { name: 'Terminer la séance' }).click();
    await page.getByRole('button', { name: 'Terminer sans compléter' }).click();
    await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible();
    await expect.poll(() => persistCalls(page)).toBe(calls + 1);
  });

  test('329. Stockage persistant accordé : rappel de sauvegarde après 14 jours seulement (8 jours : rien)', async ({ page }) => {
    await openWithBackup(page, true);
    await expect.poll(() => persistCalls(page)).toBe(0);
    await expect(page.getByText(/Aucune sauvegarde depuis plus de/)).toHaveCount(0);
    await page.goto('./#/reglages');
    await expect(page.getByTestId('persist-state')).toHaveText('accordé');
    await expect(page.getByRole('button', { name: 'Redemander au navigateur' })).toHaveCount(0);
  });

  test('330. Séries par semaine : semaine en cours encore vide, son contour pointillé est dessiné et « 23 nov. en cours » est sous sa colonne, pas sous la barre d’avant', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 10, 16, 9));
    await page.goto('./');
    await writeSessions(page, alertHistory());
    await reloadAfterWrites(page);
    for (const width of [412, 360, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('./#/bilan-groupes/dos/series');
      const chart = page.getByTestId('chart-sets');
      await expect(chart).toBeVisible();
      const geometry = await chart.evaluate((svg) => {
        const box = (el: Element | null) => (el as SVGGraphicsElement).getBoundingClientRect();
        const groups = [...svg.querySelectorAll('g[data-main]')];
        const current = groups.at(-1)!;
        const before = groups.at(-2)!.querySelector('rect.bar-main');
        const outline = current.querySelector('rect.bar-outline');
        const label = svg.querySelector('[data-testid="bar-current"]');
        const date = [...svg.querySelectorAll('[data-date]')].at(-1)!;
        return {
          current: current.getAttribute('data-current'),
          empty: outline?.getAttribute('data-empty') ?? null,
          outline: outline ? { left: box(outline).left, right: box(outline).right, bottom: box(outline).bottom } : null,
          before: before ? box(before).right : null,
          label: box(label).right,
          date: box(date).right,
          axis: box(svg.querySelector('.chart-axis')).top,
        };
      });
      expect(geometry.current).toBe('true');
      expect(geometry.empty).toBe('true');
      expect(geometry.outline).not.toBeNull();
      // Contour posé sur l'axe ; « en cours » et la date finissent au bord droit du contour, à droite de la barre d'avant.
      expect(Math.abs(geometry.outline!.bottom - geometry.axis)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.label - geometry.outline!.right)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.date - geometry.outline!.right)).toBeLessThanOrEqual(1);
      expect(geometry.label).toBeGreaterThan(geometry.before! + 8);
    }
  });

  test('333. Réglages : le seuil de l’alerte ne dépasse jamais le seuil du rouge moins 1', async ({ page }) => {
    await page.goto('./#/reglages');
    const section = await openSettingsSection(page, 'Récapitulatif de la semaine');
    const red = section.getByRole('group', { name: 'Rouge à partir de (séries)' });
    const alertName = 'Alerte « moins travaillé » sous (séries)';
    const alert = section.getByRole('group', { name: alertName });
    // Alerte à 9 (le plus haut), puis rouge descendu à 6 : l'alerte suit, 5 au plus, « + » bloqué.
    for (let i = 0; i < 3; i++) await alert.getByRole('button', { name: `${alertName} : plus` }).click();
    await expect(alert.locator('output')).toHaveText('9');
    await expect(alert.getByRole('button', { name: `${alertName} : plus` })).toBeDisabled();
    for (let i = 0; i < 4; i++) await red.getByRole('button', { name: 'Rouge à partir de (séries) : moins' }).click();
    await expect(red.locator('output')).toHaveText('6');
    await expect(alert.locator('output')).toHaveText('5');
    await expect(alert.getByRole('button', { name: `${alertName} : plus` })).toBeDisabled();
    // Rouge remonté à 8 : l'alerte peut monter jusqu'à 7.
    for (let i = 0; i < 2; i++) await red.getByRole('button', { name: 'Rouge à partir de (séries) : plus' }).click();
    await alert.getByRole('button', { name: `${alertName} : plus` }).click();
    await alert.getByRole('button', { name: `${alertName} : plus` }).click();
    await expect(alert.locator('output')).toHaveText('7');
    await expect(alert.getByRole('button', { name: `${alertName} : plus` })).toBeDisabled();
    await waitForWrites(page);
  });

  test('334. Bilan d’une semaine de vacances : la ligne de l’alerte seule, comme le mail ; ni bâtons ni tableau vides', async ({ page }) => {
    await page.clock.setFixedTime(new Date(ALERT_NOW));
    await page.goto('./');
    await writeSessions(page, alertHistory({ vacations: ['2026-10-26', '2026-11-02'] }));
    await reloadAfterWrites(page);
    await page.goto('./#/bilan-periode/semaine/2026-11-02');
    const groups = page.getByRole('region', { name: 'Groupes travaillés' });
    await expect(groups).toBeVisible();
    await expect(groups.getByTestId('groups-chart')).toHaveCount(0);
    await expect(groups.locator('table')).toHaveCount(0);
    await expect(groups).toContainText('sous 6 séries ces 2 semaines');
    const mail = await page.getByTestId('report-text').textContent();
    // Mail : la section n'a que cette ligne (aucune autre section après une semaine vide).
    expect(mail).toMatch(/GROUPES TRAVAILLÉS\n- [^\n]*sous 6 séries ces 2 semaines[^\n]*\n*$/);
    // Une semaine avec des séances garde ses bâtons et son tableau.
    await page.goto('./#/bilan-periode/semaine/2026-10-19');
    await expect(page.getByRole('region', { name: 'Groupes travaillés' }).getByTestId('groups-chart')).toBeVisible();
  });

  test('335. Bilan ouvert le dimanche soir : recalculé au changement de jour (plus « Semaine en cours » le lundi)', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 10, 15, 23, 58));
    await page.goto('./');
    await writeSessions(page, alertHistory());
    await reloadAfterWrites(page);
    await page.goto('./#/bilan-periode/semaine');
    await expect(page.getByRole('heading', { name: 'Semaine du 9 au 15 nov. 2026' })).toBeVisible();
    // Mention à l'écran et dans le texte du mail.
    await expect(page.getByText('Semaine en cours, arrêtée au dim. 15 nov.')).toHaveCount(2);
    // Minuit passé, l'écran resté ouvert : au retour au premier plan, le bilan de la semaine terminée.
    await page.clock.setFixedTime(new Date(2026, 10, 16, 0, 1));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByText('Semaine en cours, arrêtée au dim. 15 nov.')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Semaine du 9 au 15 nov. 2026' })).toBeVisible();
  });

  test('337. Sens des dates : « Dernières évolutions » datées de la première séance au nouveau palier, les paliers du bilan « validé le »', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 23, 9));
    await page.goto('./');
    await writeSessions(page, simulatedHistory());
    await reloadAfterWrites(page);
    await page.goto('./#/bilan');
    const changes = page.getByRole('region', { name: 'Dernières évolutions' });
    await expect(changes.getByText('Date : première séance au nouveau palier.')).toBeVisible();
    await page.goto('./#/bilan-periode/mois/2026-10');
    await expect(page.getByTestId('report-progression').first().locator('.prog-meta')).toContainText('validé le');
  });
});
