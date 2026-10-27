import { expect, test, type Page } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { addExercise, doExercise, exerciseCard, finishSession, startSession, validateSets, writeSessions } from './helpers';

const CURL = 'curl-biceps-barre-droite';
/** Couronne dorée (--gold) : jamais une couleur de statut ni de groupe. */
const GOLD = 'rgb(232, 182, 49)';

function done(id: string, day: number, weightKg: number, target: number): Session {
  const start = new Date(2026, 9, day, 18).getTime();
  return {
    id, name: 'Séance', date: `2026-10-${String(day).padStart(2, '0')}`, startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start,
    origin: 'app', state: 'done',
    performances: [{ variantId: CURL, weightKg, targetReps: target, plannedSets: 3, reps: [target, target, target], feeling: 'bien' }],
  };
}

async function noOverflow(page: Page): Promise<void> {
  for (const width of [412, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 412, height: 915 });
}

test.describe('Records personnels', () => {
  test('208. Couronne : fiche, « Nouveau record ! » en séance, fin de séance, historique, bilan ; première fois non célébrée ; format smartphone', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-22T10:00:00'));
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    // 12 oct. : 3 × 8 à 18 kg (première fois) ; 16 oct. : 3 × 9 à 20 kg (record battu).
    await writeSessions(page, [done('a', 12, 18, 8), done('b', 16, 20, 9)]);

    // Fiche : ligne du record avec la couronne dorée ; couronne dans l'historique pour le 16 seulement.
    await page.goto(`./#/exercice/${CURL}`);
    await page.reload();
    const record = page.getByTestId('record');
    await expect(record).toHaveText('Record : 3 × 9 à 20 kg (16 oct.)');
    await expect(page.getByTestId('target-summary').getByTestId('record')).toHaveCount(1);
    expect(await record.locator('svg.crown').evaluate((e) => getComputedStyle(e).color)).toBe(GOLD);
    const history = page.getByRole('list', { name: 'Historique de l’exercice' });
    await expect(history.getByRole('img', { name: 'Record battu' })).toHaveCount(1);
    await expect(history.getByRole('listitem').first()).toContainText('16 octobre 2026');
    await expect(history.getByRole('listitem').first().getByRole('img', { name: 'Record battu' })).toHaveCount(1);
    await noOverflow(page);
    await test.info().attach('fiche-record', { body: await page.screenshot(), contentType: 'image/png' });

    // Séance : 22 kg sur le curl (charge plus élevée). « Nouveau record ! » seulement une fois les trois séries faites.
    await startSession(page);
    const curl = await addExercise(page, 'curl barre droite', 'Curl biceps barre droite');
    await expect(curl.getByTestId('record')).toHaveCount(0);
    await curl.getByLabel('Poids (kg)').fill('22');
    await curl.getByLabel('Poids (kg)').press('Enter');
    await validateSets(curl, 2);
    await expect(curl.getByTestId('new-record')).toHaveCount(0);
    await curl.getByRole('button', { name: 'Valider', exact: true }).click();
    await expect(curl.getByTestId('new-record')).toHaveText('Nouveau record !');
    await curl.getByRole('button', { name: 'Bien', exact: true }).click();
    // Première fois sur le pec deck : devient le record, sans célébration.
    const pec = await addExercise(page, 'pec deck', 'Pec deck', '40');
    await doExercise(pec, 3, 'Bien');
    await expect(pec.getByTestId('new-record')).toHaveCount(0);
    await expect(exerciseCard(page, 'Curl biceps barre droite').getByTestId('new-record')).toBeVisible();
    await noOverflow(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await test.info().attach('seance-nouveau-record', { body: await page.screenshot(), contentType: 'image/png' });

    // Fin de séance : le record battu, avec la couronne ; rien pour le pec deck.
    await finishSession(page);
    const broken = page.getByRole('region', { name: 'Records battus' });
    await expect(broken).toHaveText(/Record battu\s*Curl biceps barre droite : 3 × 8 à 22 kg/);
    await expect(page.locator('.recap-item[data-variant="pec-deck"] svg.crown')).toHaveCount(0);
    await expect(page.locator(`.recap-item[data-variant="${CURL}"]`).getByRole('img', { name: 'Nouveau record' })).toHaveCount(1);
    await noOverflow(page);
    await test.info().attach('fin-de-seance', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    // Historique : couronne à côté de la performance qui a établi le record.
    await page.goto('./#/historique');
    await page.getByRole('link', { name: /22 octobre 2026/ }).click();
    const list = page.getByRole('list', { name: 'Exercices de la séance' });
    await expect(list.locator(`[data-variant="${CURL}"]`).getByRole('img', { name: 'Record battu' })).toHaveCount(1);
    await expect(list.locator('[data-variant="pec-deck"]').getByRole('img', { name: 'Record battu' })).toHaveCount(0);
    await test.info().attach('historique-record', { body: await page.screenshot(), contentType: 'image/png' });
    // Fiche : le nouveau record.
    await page.goto(`./#/exercice/${CURL}`);
    await expect(page.getByTestId('record')).toHaveText('Record : 3 × 8 à 22 kg (22 oct.)');

    // Bilan de la semaine : section « Records » et texte du mail.
    await page.goto('./#/bilan-periode/semaine/2026-10-19');
    await expect(page.getByRole('region', { name: 'Records' })).toHaveText(/Records\s*👑 Curl biceps barre droite : 3 × 8 à 22 kg/);
    await expect(page.getByTestId('report-text')).toContainText('RECORDS\n- 👑 Curl biceps barre droite : 3 × 8 à 22 kg\n');
    await noOverflow(page);
    await test.info().attach('bilan-records', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });
});
