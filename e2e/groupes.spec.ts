import { expect, test, type Page } from '@playwright/test';
import { simulatedHistory } from '../src/analysis/__tests__/simulation';
import { writeSessions } from './helpers';

/** Couleurs de groupe (§3.2) et couleurs de statut, interdites sur cet écran. */
const CYAN = 'rgb(62, 230, 238)';
const YELLOW = 'rgb(255, 228, 74)';
const STATUS_COLORS = ['rgb(74, 222, 128)', 'rgb(253, 186, 116)', 'rgb(252, 165, 165)'];

async function noOverflow(page: Page): Promise<void> {
  for (const width of [412, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 412, height: 915 });
}

async function open(page: Page, now: string, until: string): Promise<void> {
  await page.clock.setFixedTime(new Date(now));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
  await writeSessions(page, simulatedHistory(until));
  await page.goto('./#/bilan');
  await page.reload();
  await page.getByRole('link', { name: 'Par groupe musculaire' }).click();
  await expect(page.getByRole('heading', { name: 'Par groupe musculaire' })).toBeVisible();
}

const indexSection = (page: Page) => page.getByRole('region', { name: 'Indice de progression' });
const setsSection = (page: Page) => page.getByRole('region', { name: 'Séries par semaine' });

test.describe('Bilan par groupe musculaire', () => {
  test('216. Données simulées : indice et séries par semaine dans la couleur du groupe, sélecteur de groupe ; format smartphone', async ({ page }) => {
    await open(page, '2026-10-22T20:00:00', '2026-10-22');
    // Pectoraux par défaut : progression régulière.
    await expect(page.getByRole('group', { name: 'Groupe musculaire' }).getByRole('button', { name: 'Pectoraux' })).toHaveAttribute('aria-pressed', 'true');
    await expect(indexSection(page).getByTestId('index-last')).toHaveText('Pectoraux : 123,6');
    await expect(indexSection(page).getByTestId('chart-index')).toHaveAttribute('data-points', '17');
    await expect(indexSection(page).getByTestId('index-exercises')).toHaveText('Chest press · Pec deck');
    await expect(setsSection(page).getByTestId('chart-sets')).toHaveAttribute('data-bars', '12');
    // Semaines vides du mois d'août : pas de barre ; les autres : 6 séries pleines et 3 indirectes (1,5).
    const bars = setsSection(page).locator('g[data-main]');
    expect(await bars.evaluateAll((gs) => gs.map((g) => `${g.getAttribute('data-main')}+${g.getAttribute('data-extra')}`))).toEqual([
      '6+1.5', '0+0', '0+0', '0+0', '6+1.5', '6+1.5', '6+1.5', '0+0', '6+1.5', '6+1.5', '6+1.5', '6+1.5',
    ]);
    // Couleur du groupe (cyan) pour la courbe et les barres, jamais une couleur de statut.
    expect(await indexSection(page).locator('.chart-line').evaluate((e) => getComputedStyle(e).stroke)).toBe(CYAN);
    expect(await setsSection(page).locator('.bar-main').first().evaluate((e) => getComputedStyle(e).fill)).toBe(CYAN);
    expect(await setsSection(page).locator('.bar-extra').first().evaluate((e) => getComputedStyle(e).opacity)).toBe('0.4');
    const colors = await page.locator('main.group-progress, main.group-progress *').evaluateAll((els) =>
      els.flatMap((e) => {
        const s = getComputedStyle(e);
        return [s.color, s.backgroundColor, s.borderTopColor, s.fill, s.stroke];
      }),
    );
    for (const c of STATUS_COLORS) expect(colors).not.toContain(c);
    await noOverflow(page);
    await test.info().attach('groupe-pectoraux', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    // Épaules : régression, en jaune.
    await page.getByRole('button', { name: 'Épaules' }).click();
    await expect(page).toHaveURL(/#\/bilan-groupes\/epaules$/);
    await expect(indexSection(page).getByTestId('index-last')).toHaveText('Épaules : 82,9');
    expect(await indexSection(page).locator('.chart-line').evaluate((e) => getComputedStyle(e).stroke)).toBe(YELLOW);
    await test.info().attach('groupe-epaules', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    // Dos : stagnation (100) ; triceps : dips assistés, l'aide baisse.
    await page.getByRole('button', { name: 'Dos' }).click();
    await expect(indexSection(page).getByTestId('index-last')).toHaveText('Dos : 100');
    await page.getByRole('button', { name: 'Triceps' }).click();
    await expect(indexSection(page).getByTestId('index-last')).toHaveText('Triceps : 115,6');
    await expect(indexSection(page).getByTestId('index-exercises')).toHaveText('Dips assistés · Extension triceps poulie — Corde');
    await noOverflow(page);
    await test.info().attach('groupe-triceps', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });

  test('217. Historique court : message à la place de l’indice (« 3 séances sur 6 nécessaires ») ; le graphique apparaît dès le seuil atteint', async ({ page }) => {
    // Trois lundis (1er, 8 et 15 juin) : 3 séances de pectoraux sur 3 semaines.
    await open(page, '2026-06-16T09:00:00', '2026-06-15');
    await expect(indexSection(page).getByTestId('index-not-enough')).toHaveText(
      'Pas encore assez de données pour analyser ta progression : 3 séances sur 6 nécessaires.',
    );
    await expect(indexSection(page).getByTestId('chart-index')).toHaveCount(0);
    // Séries : 3 semaines avec des séances, le graphique est affiché.
    await expect(setsSection(page).getByTestId('chart-sets')).toBeVisible();
    await noOverflow(page);
    await test.info().attach('groupe-pas-assez', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    // Biceps : 2 séances (jeudis 4 et 11 juin), 2 semaines.
    await page.getByRole('button', { name: 'Biceps' }).click();
    await expect(indexSection(page).getByTestId('index-not-enough')).toHaveText(
      'Pas encore assez de données pour analyser ta progression : 2 séances sur 6 et 2 semaines sur 3 nécessaires.',
    );
    await expect(setsSection(page).getByTestId('sets-not-enough')).toHaveText(
      'Pas encore assez de données pour analyser ta progression : 2 semaines sur 3 nécessaires.',
    );

    // Trois lundis de plus (22 et 29 juin, 6 juillet) : six séances, le graphique apparaît.
    await page.clock.setFixedTime(new Date('2026-07-07T09:00:00'));
    await writeSessions(page, simulatedHistory('2026-07-06'));
    await page.goto('./#/bilan-groupes/pectoraux');
    await page.reload();
    await expect(indexSection(page).getByTestId('chart-index')).toHaveAttribute('data-points', '6');
    await expect(indexSection(page).getByTestId('index-not-enough')).toHaveCount(0);
  });
});
