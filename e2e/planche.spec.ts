import { expect, test } from '@playwright/test';
import { addExercise, exerciseCard, finishSession, readSessions } from './helpers';

test.describe('Planche en secondes (§4.0, §7.13, version 1.25.0)', () => {
  test('254. Planche : 3 × 20 s sans charge, séries par pas de 5 s, +5 s après deux vertes ; fiche, historique et détail en secondes, jamais « 0 kg »', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-27T18:00:00'));
    await page.goto('./');

    // Première fois : « gainage » trouve la planche ; ni poids de départ ni champ de poids.
    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    await page.getByRole('link', { name: 'Ajouter un exercice' }).click();
    await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill('gainage');
    await page.getByRole('button', { name: /^Planche/ }).first().click();
    const card = exerciseCard(page, 'Planche');
    await expect(card).toBeVisible();
    await expect(page.getByLabel('Poids de départ (kg)')).toHaveCount(0);
    await expect(card.getByLabel(/Poids \(kg\)|Aide \(kg\)/)).toHaveCount(0);
    await expect(card.getByTestId('next-target')).toHaveText('3 × 20 s');
    await expect(card.getByTestId('start-hint')).toHaveText('Première fois');
    // Séries en secondes, par pas de 5 s, jamais au-delà de la cible.
    const first = card.getByRole('group', { name: 'Secondes série 1' });
    await expect(first.locator('output')).toHaveText('20 s');
    await expect(first.getByRole('button', { name: 'Secondes série 1 : plus' })).toBeDisabled();
    await first.getByRole('button', { name: 'Secondes série 1 : moins' }).click();
    await expect(first.locator('output')).toHaveText('15 s');
    await first.getByRole('button', { name: 'Secondes série 1 : plus' }).click();
    await expect(first.locator('output')).toHaveText('20 s');
    await card.getByRole('button', { name: 'Valider les 3 séries' }).click();
    await card.getByRole('button', { name: 'Bien', exact: true }).click();
    await finishSession(page);
    await expect(page.getByRole('main')).toContainText('20 s · 20 s · 20 s');
    await expect(page.getByRole('main')).toContainText('Prochaine cible : 3 × 20 s');
    await expect(page.getByRole('main')).not.toContainText(/\b0 kg/);

    // Le lendemain : deuxième verte → 3 × 25 s.
    await page.clock.setFixedTime(new Date('2026-10-28T18:00:00'));
    await page.goto('./');
    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    const again = await addExercise(page, 'planche', 'Planche');
    await expect(again.getByTestId('last-time')).toContainText('Dernière fois20 s · 20 s · 20 s · 27/10');
    await expect(again.getByTestId('same-target')).toHaveText('= Même cible : consolide');
    await again.getByRole('button', { name: 'Valider les 3 séries' }).click();
    await again.getByRole('button', { name: 'Très bien', exact: true }).click();
    await finishSession(page);
    await expect(page.getByRole('main')).toContainText('Prochaine cible : 3 × 25 s');
    const saved = (await readSessions(page)).filter((s) => s.state === 'done');
    expect(saved.map((s) => s.performances.map((p) => [p.variantId, p.weightKg, p.targetReps, p.reps]))).toEqual([
      [['planche', 0, 20, [20, 20, 20]]],
      [['planche', 0, 20, [20, 20, 20]]],
    ]);

    // Fiche : « 3 × 25 s », « ↑ +5 s », record, mention du gainage, graphique de la durée seulement.
    await page.goto('./#/exercice/planche');
    await expect(page.getByTestId('sheet-next')).toHaveText('3 × 25 s');
    await expect(page.getByTestId('progress-marker')).toHaveText('↑ +5 s');
    await expect(page.getByTestId('record')).toHaveText('Record : 3 × 20 s (27 oct.)');
    await expect(page.getByTestId('bodyweight')).toHaveText('Gainage : progression par la durée (20 à 60 s)');
    await expect(page.getByTestId('chart-weight')).toHaveCount(0);
    await expect(page.getByTestId('chart-reps')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Historique de l’exercice' }).getByRole('listitem').first()).toContainText('20-20-20 s');
    await expect(page.getByRole('main')).toContainText('cible 3 × 20 s');
    await expect(page.getByRole('main')).not.toContainText(/\b0 kg/);
    // Détail d'une séance : secondes ; correction en secondes.
    await page.goto(`./#/historique/${saved[0]!.id}`);
    await expect(page.getByRole('main')).toContainText('20 s · 20 s · 20 s (cible 3 × 20 s)');
    await expect(page.getByRole('main')).not.toContainText(/\b0 kg/);

    // Troisième séance : la carte reprend 3 × 25 s avec « ↑ +5 s » ; à 360 px, elle tient dans l'écran.
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('./');
    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    const third = await addExercise(page, 'plank', 'Planche');
    await expect(third.getByTestId('next-target')).toHaveText('3 × 25 s');
    await expect(third.getByTestId('progress-marker')).toHaveText('↑ +5 s');
    await expect(third.getByRole('group', { name: 'Secondes série 1' }).locator('output')).toHaveText('25 s');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});
