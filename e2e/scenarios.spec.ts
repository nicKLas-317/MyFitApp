import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { activeSession, addExercise, finishSession, readSessions, startSession, writeSessions } from './helpers';

/** Séance passée (historique de départ) au palier donné, une par jour. */
function past(day: number, weightKg: number, target: number, reps: number[], feeling: 'bien' | 'moyen'): Session {
  const t = new Date(2026, 9, day, 18).getTime();
  return {
    id: `p${day}`, name: `Passée ${day}`, date: `2026-10-${String(day).padStart(2, '0')}`, startedAt: t, endedAt: t + 3_600_000,
    createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: [{ variantId: 'tirage-vertical', weightKg, targetReps: target, plannedSets: 3, reps, feeling }],
  };
}

async function seed(page: Page, sessions: Session[]): Promise<void> {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
  await writeSessions(page, sessions);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
}

/** Enregistre les séries une à une, en descendant sous la cible si besoin, puis le ressenti. */
async function doSets(card: Locator, reps: number[], feeling: string): Promise<void> {
  for (const [i, r] of reps.entries()) {
    const value = card.locator('.set.next .step-value');
    while (Number(await value.textContent()) > r) await card.getByRole('button', { name: `Répétitions série ${i + 1} : moins` }).click();
    await card.getByRole('button', { name: 'Valider' }).click();
  }
  await card.getByRole('button', { name: feeling, exact: true }).click();
}

/** Séance complète d'un exercice, terminée ; renvoie la prochaine cible affichée au récapitulatif. */
async function session(page: Page, reps: number[], feeling: string, startWeight?: string): Promise<string> {
  await startSession(page);
  const card = await addExercise(page, 'lat pulldown', 'Tirage vertical', startWeight);
  await doSets(card, reps, feeling);
  await finishSession(page);
  const next = (await page.getByTestId('next-target').textContent()) ?? '';
  await page.getByRole('button', { name: 'Garder ce nom' }).click();
  return next;
}

test.describe('§16 Scénarios de progression, joués dans l’interface', () => {
  test('3. Vert, orange, vert au même palier : aucune progression', async ({ page }) => {
    await page.goto('./');
    expect(await session(page, [8, 8, 8], 'Bien', '40')).toBe('3 × 8');
    expect(await session(page, [8, 8, 8], 'Moyen')).toBe('3 × 8');
    expect(await session(page, [8, 8, 8], 'Bien')).toBe('3 × 8');
    const done = await readSessions(page);
    expect(done).toHaveLength(3);
    expect(done.every((s) => s.performances[0]?.targetReps === 8 && s.performances[0]?.weightKg === 40)).toBe(true);
  });

  test('4 et 5. Une première verte à 3×12 ne change pas la charge ; la deuxième affiche « Poids supérieur », une charge plus lourde revient à 3×8', async ({ page }) => {
    await seed(page, [past(1, 45, 11, [11, 11, 11], 'bien'), past(3, 45, 11, [11, 11, 11], 'bien')]);
    expect(await session(page, [12, 12, 12], 'Bien')).toBe('3 × 12');
    expect(await session(page, [12, 12, 12], 'Très bien')).toBe('Poids supérieur · 3 × 8');

    await startSession(page);
    const card = await addExercise(page, 'lat pulldown', 'Tirage vertical');
    await expect(card.getByText('Poids supérieur', { exact: true })).toBeVisible();
    await expect(card.getByTestId('target')).toHaveText('3 × 12');
    await card.getByLabel('Poids (kg)').fill('50');
    await card.getByLabel('Poids (kg)').press('Enter');
    await expect(card.getByTestId('target')).toHaveText('3 × 8');
    await expect.poll(async () => (await activeSession(page)).performances[0]).toMatchObject({ weightKg: 50, targetReps: 8 });
    // L'historique de l'ancienne charge est conservé.
    expect((await readSessions(page)).filter((s) => s.state === 'done').every((s) => s.performances[0]?.weightKg === 45)).toBe(true);
  });

  test('6. Quatre séances rouges : « Poids inférieur » ; une charge plus légère conserve la cible', async ({ page }) => {
    const red = [10, 9, 9];
    await seed(page, [past(1, 45, 10, red, 'moyen'), past(2, 45, 10, red, 'moyen'), past(3, 45, 10, red, 'moyen')]);
    expect(await session(page, red, 'Moyen')).toBe('Poids inférieur · 3 × 10');

    await startSession(page);
    const card = await addExercise(page, 'lat pulldown', 'Tirage vertical');
    await expect(card.getByText('Poids inférieur', { exact: true })).toBeVisible();
    await card.getByLabel('Poids (kg)').fill('40');
    await card.getByLabel('Poids (kg)').press('Enter');
    await expect(card.getByTestId('target')).toHaveText('3 × 10');
    await expect.poll(async () => (await activeSession(page)).performances[0]).toMatchObject({ weightKg: 40, targetReps: 10 });
  });
});
