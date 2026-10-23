import { expect, test, type Page } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { addExercise, startSession, writeSessions } from './helpers';

function past(day: number, target: number): Session {
  const t = new Date(2026, 9, day, 18).getTime();
  return {
    id: `p${day}`, name: `Passée ${day}`, date: `2026-10-${String(day).padStart(2, '0')}`, startedAt: t, endedAt: t + 3_600_000,
    createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: [{ variantId: 'pec-deck', weightKg: 35, targetReps: target, plannedSets: 3, reps: [target, target, target], feeling: 'bien' }],
  };
}

async function seed(page: Page, sessions: Session[]): Promise<void> {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
  await writeSessions(page, sessions);
  await page.reload();
}

test.describe('Repère de progression (§5.3.1)', () => {
  test('139. Cible en hausse : repère en haut de l’exercice et sur la fiche ; aucun repère quand la cible ne change pas', async ({ page }) => {
    await seed(page, [past(1, 8), past(3, 8)]);
    await startSession(page);
    const card = await addExercise(page, 'pec deck', 'Pec deck');
    const marker = card.getByTestId('progress-marker');
    await expect(marker).toHaveText('↑ +1 rép.');
    await expect(card.getByTestId('target')).toHaveText('3 × 9');
    await expect(card.getByTestId('next-target')).toHaveText('3 × 9 à 35 kg');
    // En haut de l'exercice : avant le champ de poids, sans couleur de statut.
    const [markerBox, weightBox] = await Promise.all([marker.boundingBox(), card.getByLabel('Poids (kg)').boundingBox()]);
    expect(markerBox!.y).toBeLessThan(weightBox!.y);
    await expect(marker.locator('[data-status]')).toHaveCount(0);
    // Une autre charge n'est plus la progression recommandée : le repère disparaît.
    await card.getByLabel('Poids (kg)').fill('37,5');
    await card.getByLabel('Poids (kg)').press('Enter');
    await expect(marker).toHaveCount(0);

    // Fiche : même repère sous « Prochaine cible ».
    await page.goto('./#/exercice/pec-deck');
    await expect(page.getByTestId('sheet-next')).toHaveText('3 × 9');
    await expect(page.getByTestId('progress-marker')).toHaveText('↑ +1 rép.');
  });

  test('Une seule séance verte : la cible ne change pas, aucun repère', async ({ page }) => {
    await seed(page, [past(1, 8)]);
    await startSession(page);
    const card = await addExercise(page, 'pec deck', 'Pec deck');
    await expect(card.getByTestId('target')).toHaveText('3 × 8');
    await expect(card.getByTestId('progress-marker')).toHaveCount(0);
    await page.goto('./#/exercice/pec-deck');
    await expect(page.getByTestId('sheet-next')).toHaveText('3 × 8');
    await expect(page.getByTestId('progress-marker')).toHaveCount(0);
  });
});
