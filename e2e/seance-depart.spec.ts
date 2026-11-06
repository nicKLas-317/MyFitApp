import { expect, test } from '@playwright/test';
import type { Feeling, Session } from '../src/domain/types';
import { addExercise, doExercise, finishSession, readSessions, reloadAfterWrites, startSession, writeSessions } from './helpers';

const CURL = 'curl-biceps-banc-incline';

function done(id: string, day: number, variantId: string, weightKg: number, reps: number[], feeling: Feeling, home = false): Session {
  const start = new Date(2026, 9, day, home ? 8 : 18).getTime();
  return {
    id, name: 'Séance', date: `2026-10-${String(day).padStart(2, '0')}`, startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start,
    origin: 'app', state: 'done', ...(home ? { location: 'maison' as const } : {}),
    performances: [{ variantId, weightKg, targetReps: 8, plannedSets: 3, reps, feeling }],
  };
}

test.describe('Séances rouges et séance de départ (version 1.42.0)', () => {
  test('303. Fiche : « Série en cours : 2 séances rouges » (une séance « Mal » ne l’interrompt pas), aussi à la maison, masquée avec « ↓ Poids inférieur » ; carte : « ↓ / ↑ Nouvelle charge : séance de départ », « Nouvelle aide : séance de départ » ; historique « séance de départ »', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-30T12:00:00'));
    await page.goto('./');
    await expect(page.getByTestId('weekly-recap')).toBeVisible();
    const R = [8, 8, 8];
    await writeSessions(page, [
      // Salle, 12 kg : Très mal, Mal (neutre), Très mal → 2 rouges en cours. Maison, 11,5 kg : Très mal ×2.
      done('s1', 12, CURL, 12, R, 'tres_mal'), done('s2', 14, CURL, 12, R, 'mal'), done('s3', 16, CURL, 12, R, 'tres_mal'),
      done('m1', 13, CURL, 11.5, R, 'tres_mal', true), done('m2', 15, CURL, 11.5, [8, 7, 7], 'mal', true),
      // Pec deck : quatre rouges → « Poids inférieur ». Dips assistés : aide de 30 kg.
      ...[17, 18, 19, 20].map((d) => done(`p${d}`, d, 'pec-deck', 40, R, 'tres_mal')),
      done('d1', 21, 'dips-assistes', 30, R, 'moyen'),
    ]);
    await reloadAfterWrites(page);

    // Fiche du curl : la série en cours sous le record, dans les deux blocs ; jamais à côté de la pastille.
    await page.goto(`./#/exercice/${CURL}`);
    const salle = page.getByTestId('target-summary').first();
    await expect(salle.getByTestId('red-run')).toHaveText('Série en cours : 2 séances rouges');
    await expect(salle.locator('[data-testid="record"] + [data-testid="red-run"]')).toHaveCount(1);
    await expect(salle.getByTestId('last-time').getByTestId('red-run')).toHaveCount(0);
    await expect(page.getByTestId('sheet-home').getByTestId('red-run')).toHaveText('Série en cours : 2 séances rouges');
    // Pec deck : quatre rouges, « ↓ Poids inférieur » affiché, pas de série en cours.
    await page.goto('./#/exercice/pec-deck');
    await expect(page.getByTestId('progress-marker')).toContainText('Poids inférieur');
    await expect(page.getByTestId('red-run')).toHaveCount(0);

    // Séance : le curl à 10 kg (baisse non recommandée) puis 14 kg (hausse non recommandée), puis 10 kg.
    await startSession(page);
    const curl = await addExercise(page, 'curl incliné', 'Curl biceps banc incliné');
    const weight = curl.getByLabel('Poids (kg / haltère)');
    await expect(curl.getByTestId('fresh-load')).toHaveCount(0);
    await weight.fill('10');
    await weight.press('Enter');
    await expect(curl.getByTestId('next-target')).toHaveText(/^3 × 8 à 10 kg/);
    await expect(curl.getByTestId('fresh-load')).toHaveText('↓ Nouvelle charge : séance de départ');
    await expect(curl.getByTestId('progress-marker')).toHaveCount(0);
    await weight.fill('14');
    await weight.press('Enter');
    await expect(curl.getByTestId('fresh-load')).toHaveText('↑ Nouvelle charge : séance de départ');
    await weight.fill('12');
    await weight.press('Enter');
    await expect(curl.getByTestId('fresh-load')).toHaveCount(0);
    await weight.fill('10');
    await weight.press('Enter');
    await expect(curl.getByTestId('fresh-load')).toBeVisible();
    await doExercise(curl, 3, 'Bien');
    // Pec deck : baisse recommandée et suivie (35 kg) : pas de séance de départ.
    const pec = await addExercise(page, 'pec deck', 'Pec deck');
    await pec.getByLabel('Poids (kg)').fill('35');
    await pec.getByLabel('Poids (kg)').press('Enter');
    await expect(pec.getByTestId('next-target')).toHaveText(/^3 × 8 à 35 kg/);
    await expect(pec.getByTestId('fresh-load')).toHaveCount(0);
    await doExercise(pec, 3, 'Bien');
    // Dips assistés : plus ou moins d'aide sans recommandation, sans flèche.
    const dips = await addExercise(page, 'dips', 'Dips assistés');
    await dips.getByLabel('Aide (kg)').fill('35');
    await dips.getByLabel('Aide (kg)').press('Enter');
    await expect(dips.getByTestId('fresh-load')).toHaveText('Nouvelle aide : séance de départ');
    await expect(dips.getByTestId('fresh-load').locator('[aria-hidden="true"]')).toHaveCount(0);
    await dips.getByLabel('Aide (kg)').fill('25');
    await dips.getByLabel('Aide (kg)').press('Enter');
    await expect(dips.getByTestId('fresh-load')).toHaveText('Nouvelle aide : séance de départ');
    await test.info().attach('carte-seance-de-depart', { body: await page.screenshot(), contentType: 'image/png' });
    await doExercise(dips, 3, 'Bien');
    await finishSession(page);
    const saved = (await readSessions(page)).find((s) => s.date === '2026-10-30')!;
    expect(saved.performances.find((p) => p.variantId === CURL)?.weightKg).toBe(10);

    // Fiche : la séance du jour marquée « séance de départ » ; nouveau palier, plus de série en cours à la salle.
    await page.goto(`./#/exercice/${CURL}`);
    const history = page.getByRole('list', { name: 'Historique de l’exercice' });
    await expect(history.getByRole('listitem').first()).toContainText('30 octobre 2026');
    await expect(history.getByRole('listitem').first()).toContainText('cible 3 × 8 · Bien passé · séance de départ');
    await expect(history.getByText(/séance de départ/)).toHaveCount(1);
    await expect(page.getByTestId('target-summary').first().getByTestId('red-run')).toHaveCount(0);
    await expect(page.getByTestId('sheet-home').getByTestId('red-run')).toHaveCount(1);
    // Pec deck : baisse recommandée, suivie, pas marquée.
    await page.goto('./#/exercice/pec-deck');
    await expect(page.getByRole('list', { name: 'Historique de l’exercice' }).getByText(/séance de départ/)).toHaveCount(0);
  });
});
