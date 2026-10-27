import { expect, test } from '@playwright/test';
import { addExercise, finishSession, readSessions } from './helpers';

test.describe('Pompes au poids du corps (§4.0, version 1.27.0)', () => {
  test('262. Pompes classiques : 2 séries par défaut, sans charge, +1 rép. après deux vertes ; sur les genoux à part ; à la maison, pectoraux « +2 séries maison »', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-26T18:00:00'));
    await page.goto('./');
    await page.getByRole('button', { name: 'Démarrer une séance', exact: true }).click();
    // « pompes » : les deux variantes, classiques d'abord ; aucun poids de départ demandé.
    const classic = await addExercise(page, 'pompes', 'Pompes — Classiques');
    await expect(page.getByLabel('Poids de départ (kg)')).toHaveCount(0);
    await expect(classic.getByLabel(/Poids \(kg\)|Aide \(kg\)/)).toHaveCount(0);
    await expect(classic.getByTestId('next-target')).toHaveText('2 × 10');
    await expect(classic.locator('.card-summary')).toHaveText('0/2');
    await classic.getByRole('button', { name: 'Valider les 2 séries' }).click();
    await classic.getByRole('button', { name: 'Bien', exact: true }).click();
    await finishSession(page);

    // Le lendemain, à la maison : même suivi (poids du corps) ; deuxième verte → 2 × 11.
    await page.clock.setFixedTime(new Date('2026-10-27T09:00:00'));
    await page.goto('./');
    await page.getByRole('group', { name: 'Lieu de la séance libre' }).getByRole('button', { name: 'Maison' }).click();
    await page.getByRole('button', { name: 'Démarrer une séance à la maison' }).click();
    const again = await addExercise(page, 'push-up', 'Pompes — Classiques');
    await expect(again.getByTestId('last-time')).toContainText('Dernière fois10 · 10 · 26/10');
    await again.getByRole('button', { name: 'Valider les 2 séries' }).click();
    await again.getByRole('button', { name: 'Très bien', exact: true }).click();
    // Sur les genoux : un autre suivi, jamais réalisé.
    const knees = await addExercise(page, 'pompes genoux', 'Pompes — Sur les genoux');
    await expect(knees.getByTestId('last-time')).toContainText('jamais réalisé');
    await expect(knees.getByTestId('next-target')).toHaveText('2 × 10');
    await finishSession(page);
    await expect(page.getByRole('main')).toContainText('Prochaine cible : 2 × 11');
    const saved = (await readSessions(page)).filter((s) => s.state === 'done').sort((a, b) => (a.date < b.date ? -1 : 1));
    expect(saved.map((s) => [s.location ?? 'salle', s.performances.map((p) => [p.variantId, p.weightKg, p.plannedSets, p.reps])])).toEqual([
      ['salle', [['pompes', 0, 2, [10, 10]]]],
      ['maison', [['pompes', 0, 2, [10, 10]]]],
    ]);

    // Récapitulatif : pectoraux 1 (salle) + 2 séries à la maison (version 1.28.0) ; triceps « +1 indirect » de la salle seulement.
    await page.goto('./');
    const recap = page.getByTestId('weekly-recap');
    await expect(recap.locator('[data-group="pectoraux"] .recap-count')).toHaveText(/^ \(1× · \+2\s+séries\s+maison\)$/);
    await expect(recap.locator('[data-group="triceps"] .recap-count')).toHaveText(/^ \(\+1\s+indirect\)$/);

    // Fiche : 2 × 11, « ↑ +1 rép. », dessin des pompes classiques ; les genoux : pictogramme.
    await page.goto('./#/exercice/pompes');
    await expect(page.getByTestId('sheet-next')).toHaveText('2 × 11');
    await expect(page.getByTestId('progress-marker')).toHaveText('↑ +1 rép.');
    await expect(page.getByRole('button', { name: /Agrandir l’illustration/ })).toBeVisible();
    await page.goto('./#/exercice/pompes--genoux');
    await expect(page.getByRole('button', { name: /Agrandir l’illustration/ })).toHaveCount(0);
  });
});
