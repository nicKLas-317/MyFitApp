import { expect, test, type Page } from '@playwright/test';
import type { Session, SessionPlan } from '../src/domain/types';
import { addExercise, doExercise, exerciseCard, finishSession, readSessions, validateSets, writeSessions } from './helpers';

const PLAN: SessionPlan = { id: 'plan-lieu', createdAt: 0, updatedAt: 0, items: [{ kind: 'exercise', variantId: 'pec-deck', startWeightKg: 30 }] };

/** Pec deck à la salle, 30 kg 3 × 8 « Bien » : deux vertes la semaine d'avant, la salle propose 3 × 9 à 30 kg. */
function gym(id: string, day: number): Session {
  const t = new Date(`2026-10-${day}T18:00:00`).getTime();
  return {
    id, name: id, date: `2026-10-${day}`, startedAt: t, endedAt: t + 1_800_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: [{ variantId: 'pec-deck', weightKg: 30, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' }],
  };
}

async function setPlan(page: Page, plan: SessionPlan): Promise<void> {
  await page.evaluate(
    (value) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onsuccess = () => {
          const tx = open.result.transaction('meta', 'readwrite');
          tx.objectStore('meta').put(value, 'plan');
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    plan,
  );
  await page.reload();
}

/** Menu « ⋯ » de l'en-tête de la séance. */
async function headerMenu(page: Page) {
  await page.getByRole('button', { name: 'Actions : Séance' }).click();
  return page.getByRole('menuitem');
}

test.describe('Changer le lieu d’une séance en cours (version 1.30.0)', () => {
  test('270. « Passer à la salle » / « Passer à la maison » dans le menu de l’en-tête : cibles recalculées, séries gardées, confirmation ; séance comptée au lieu final ; ni séance prévue ni séance complétée', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-28T18:00:00'));
    await page.goto('./');
    await writeSessions(page, [gym('s19', 19), gym('s20', 20)]);
    await page.reload();

    // « Maison » touché par erreur : pec deck jamais fait à la maison, poids de départ 15 kg, « 3 × 8 à 15 kg ».
    await page.getByRole('group', { name: 'Lieu de la séance libre' }).getByRole('button', { name: 'Maison' }).click();
    await page.getByRole('button', { name: 'Démarrer une séance à la maison' }).click();
    const pecDeck = await addExercise(page, 'pec deck', 'Pec deck', '15');
    await expect(pecDeck.getByTestId('next-target')).toHaveText('3 × 8 à 15 kg');
    await expect(page.getByTestId('session-place')).toHaveText('À la maison');
    await expect(page.getByTestId('chrono')).toHaveCount(0);

    // Maison → Salle, aucune série : sans confirmation ; chrono depuis le début (10 min), cible de la salle.
    await page.clock.setFixedTime(new Date('2026-10-28T18:10:00'));
    await expect(await headerMenu(page)).toHaveText(['Passer à la salle', 'Annuler la séance']);
    await page.getByRole('menuitem', { name: 'Passer à la salle' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('chrono')).toHaveText('10:00');
    await expect(page.getByTestId('session-place')).toHaveCount(0);
    await expect(pecDeck.getByTestId('next-target')).toHaveText('3 × 9 à 30 kg');
    await expect.poll(async () => (await readSessions(page)).find((s) => s.state === 'active')?.performances[0]?.weightKg).toBe(30);
    let active = (await readSessions(page)).find((s) => s.state === 'active')!;
    expect(active).not.toHaveProperty('location');
    expect(active).toMatchObject({ startedAt: new Date('2026-10-28T18:00:00').getTime(), performances: [{ weightKg: 30, targetReps: 9, reps: [] }] });
    await doExercise(pecDeck, 3, 'Bien');
    await finishSession(page);
    await expect.poll(async () => (await readSessions(page)).find((s) => s.date === '2026-10-28')?.state).toBe('done');
    const first = (await readSessions(page)).find((s) => s.date === '2026-10-28')!;
    expect(first).not.toHaveProperty('location');
    expect(first.performances).toMatchObject([{ variantId: 'pec-deck', weightKg: 30, reps: [9, 9, 9] }]);

    // Le lendemain, à la salle, une série faite, puis à la maison : confirmation (« Non » garde la salle), la série
    // reste telle quelle.
    await page.clock.setFixedTime(new Date('2026-10-29T18:00:00'));
    await page.goto('./');
    await page.getByRole('button', { name: 'Démarrer une séance', exact: true }).click();
    const again = await addExercise(page, 'pec deck', 'Pec deck');
    await validateSets(again, 1);
    await expect(await headerMenu(page)).toHaveText(['Passer à la maison', 'Annuler la séance']);
    await page.getByRole('menuitem', { name: 'Passer à la maison' }).click();
    const sheet = page.getByRole('dialog', { name: 'Passer à la maison ?' });
    await expect(sheet.getByTestId('switch-kept')).toHaveText('1 série déjà faite restera telle quelle.');
    await expect(sheet.getByRole('button').first()).toHaveText('Oui, passer à la maison');
    await sheet.getByRole('button', { name: 'Non, rester à la salle' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId('chrono')).toBeVisible();
    await headerMenu(page);
    await page.getByRole('menuitem', { name: 'Passer à la maison' }).click();
    await sheet.getByRole('button', { name: 'Oui, passer à la maison' }).click();
    await expect(page.getByTestId('session-place')).toHaveText('À la maison');
    await expect(page.getByTestId('chrono')).toHaveCount(0);
    await expect(again.locator('.card-summary')).toHaveText('30 kg · 1/3');
    await expect.poll(async () => (await readSessions(page)).find((s) => s.state === 'active')?.location).toBe('maison');
    active = (await readSessions(page)).find((s) => s.state === 'active')!;
    expect(active.performances).toMatchObject([{ weightKg: 30, targetReps: 9, reps: [9] }]);
    await validateSets(again, 2);
    await again.getByRole('button', { name: 'Bien', exact: true }).click();
    await finishSession(page);
    await expect.poll(async () => (await readSessions(page)).find((s) => s.date === '2026-10-29')?.state).toBe('done');
    expect((await readSessions(page)).find((s) => s.date === '2026-10-29')).toMatchObject({ location: 'maison' });

    // Comptée au lieu final : récapitulatif (la séance du 28 à la salle, celle du 29 en séries à la maison) ; fiche :
    // la salle n'a que la séance du 28 (3 × 9 à 30 kg, une verte), la maison a la sienne.
    await page.getByRole('button', { name: 'Retour à l’accueil' }).click();
    const recap = page.getByTestId('weekly-recap');
    await expect(recap).toContainText('2 séances · dont 1 maison');
    await expect(recap.locator('[data-group="pectoraux"] .recap-count')).toHaveText(/^ \(1×\s+·\s+\+3\s+séries\s+maison\)$/);
    await page.goto('./#/exercice/pec-deck');
    await expect(page.getByTestId('next-target').first()).toHaveText('3 × 9 à 30 kg');
    await expect(page.getByTestId('sheet-home').getByTestId('next-target')).toHaveText('3 × 9 à 30 kg');

    // Séance complétée : pas de changement de lieu.
    await page.goto('./');
    await page.getByRole('button', { name: 'Compléter la séance de ce soir' }).click();
    await expect(page.getByTestId('locked')).toBeVisible();
    await expect(await headerMenu(page)).toHaveText(['Annuler les ajouts']);
    await page.getByRole('menuitem', { name: 'Annuler les ajouts' }).click();
    await page.getByRole('button', { name: 'Oui, annuler les ajouts' }).click();
    await expect.poll(async () => (await readSessions(page)).every((s) => s.state === 'done')).toBe(true);

    // Séance prévue (toujours à la salle) : pas de changement de lieu.
    await setPlan(page, PLAN);
    await page.getByRole('button', { name: 'Démarrer la séance prévue' }).click();
    await expect(exerciseCard(page, 'Pec deck')).toBeVisible();
    await expect(await headerMenu(page)).toHaveText(['Annuler la séance']);
  });
});
