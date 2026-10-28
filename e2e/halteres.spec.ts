import { expect, test } from '@playwright/test';
import type { Performance, Session } from '../src/domain/types';
import { addExercise, doExercise, exerciseCard, finishSession, readSessions, startSession, writeSessions } from './helpers';

/** Séance à la salle terminée le jour donné d'octobre 2026, à 18 h. */
function done(id: string, day: number, performances: Performance[]): Session {
  const t = new Date(`2026-10-${day}T18:00:00`).getTime();
  return { id, name: id, date: `2026-10-${day}`, startedAt: t, endedAt: t + 1_800_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done', performances };
}
const perf = (variantId: string, weightKg: number): Performance => ({ variantId, weightKg, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' });

test.describe('Charges aux haltères : « kg / haltère » (version 1.30.1)', () => {
  test('272. Carte en séance, fiche, records et champ de saisie en « kg / haltère » pour un exercice aux haltères ; « kg » ailleurs ; valeurs enregistrées inchangées', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-28T18:00:00'));
    await page.goto('./');
    // Curl biceps haltères 12 kg (par haltère) et pec deck 30 kg, deux vertes à 3 × 8 : 3 × 9 proposé.
    await writeSessions(page, [done('s19', 19, [perf('curl-biceps-halteres', 12), perf('pec-deck', 30)]), done('s20', 20, [perf('curl-biceps-halteres', 12), perf('pec-deck', 30)])]);
    await page.reload();

    // Fiche : cible, dernière fois, record, graphique et historique en « kg / haltère ».
    await page.goto('./#/exercice/curl-biceps-halteres');
    await expect(page.getByTestId('next-target').first()).toHaveText('3 × 9 à 12 kg / haltère');
    await expect(page.getByTestId('last-time').first()).toContainText('12 kg / haltère');
    await expect(page.getByTestId('record')).toHaveText('Record : 3 × 8 à 12 kg / haltère (19 oct.)');
    await expect(page.getByText('Charge (kg / haltère)', { exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Historique de l’exercice' }).locator('li').first()).toContainText('12 kg / haltère · 8-8-8');
    // Exercice à la machine : « kg ».
    await page.goto('./#/exercice/pec-deck');
    await expect(page.getByTestId('next-target').first()).toHaveText('3 × 9 à 30 kg');
    await expect(page.getByTestId('record')).toHaveText('Record : 3 × 8 à 30 kg (19 oct.)');
    await expect(page.getByText('Charge (kg)', { exact: true })).toBeVisible();
    await expect(page.getByRole('main')).not.toContainText('haltère');

    // Séance : carte, champ de saisie et sa confirmation ; pec deck en « kg ».
    await startSession(page);
    const pecDeck = await addExercise(page, 'pec deck', 'Pec deck');
    await expect(pecDeck.getByLabel('Poids (kg)', { exact: true })).toHaveValue('30');
    await expect(pecDeck.locator('.card-summary')).toHaveText('30 kg · 0/3');
    const curl = await addExercise(page, 'curl biceps haltères', 'Curl biceps haltères');
    await expect(curl.locator('.card-summary')).toHaveText('12 kg / haltère · 0/3');
    await expect(curl.getByTestId('next-target')).toHaveText('3 × 9 à 12 kg / haltère');
    await expect(curl.getByTestId('last-time')).toContainText('12 kg / haltère');
    const weight = curl.getByLabel('Poids (kg / haltère)', { exact: true });
    await expect(weight).toHaveValue('12');
    await expect(curl.locator('.weight-field .unit')).toHaveText('kg / haltère');
    await weight.fill('30');
    await weight.press('Tab');
    const confirm = curl.getByRole('alertdialog', { name: 'Confirmer le poids' });
    await expect(confirm).toContainText('30 kg / haltère ? C’est très différent de 12 kg / haltère.');
    await expect(confirm.getByRole('button', { name: 'Confirmer 30 kg / haltère' })).toBeVisible();
    await confirm.getByRole('button', { name: 'Corriger' }).click();
    await expect(weight).toHaveValue('12');
    // Poids de départ d'un exercice aux haltères jamais réalisé : « Poids de départ (kg / haltère) ».
    await page.getByRole('link', { name: 'Ajouter un exercice' }).click();
    await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill('élévations latérales haltères');
    await page.getByRole('button', { name: /^Élévations latérales haltères/ }).first().click();
    await page.getByLabel('Poids de départ (kg / haltère)', { exact: true }).fill('6');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(exerciseCard(page, 'Élévations latérales haltères').getByTestId('next-target')).toHaveText('3 × 8 à 6 kg / haltère');

    // Record battu (3 × 9 à 12 kg) : récapitulatif de fin en « kg / haltère » ; valeurs enregistrées inchangées.
    await curl.locator('.card-header').click();
    await doExercise(curl, 3, 'Bien');
    await expect(curl.getByTestId('new-record')).toBeVisible();
    await finishSession(page);
    await expect(page.getByRole('region', { name: 'Records battus' })).toContainText('Curl biceps haltères : 3 × 9 à 12 kg / haltère');
    await expect.poll(async () => (await readSessions(page)).find((s) => s.date === '2026-10-28')?.state).toBe('done');
    const saved = (await readSessions(page)).find((s) => s.date === '2026-10-28')!;
    expect(saved.performances.map((p) => [p.variantId, p.weightKg, p.reps])).toEqual([['curl-biceps-halteres', 12, [9, 9, 9]]]);
  });
});
