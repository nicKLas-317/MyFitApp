import { expect, test } from '@playwright/test';
import { addExercise, exerciseCard, finishSession, openSettingsSection, readSessions } from './helpers';

test.describe('Abdos au poids du corps (§4.0, version 1.24.0)', () => {
  test('251. Crunch au sol : sans charge ni poids de départ, +1 rép. après deux vertes ; fiche, historique, récapitulatif avec les abdos ; jamais « 0 kg »', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-27T18:00:00'));
    await page.goto('./');
    // « Abdominaux » activé dans le récapitulatif.
    await page.goto('./#/reglages');
    const recapSection = await openSettingsSection(page, 'Récapitulatif de la semaine');
    await recapSection.getByRole('group', { name: 'Groupes affichés' }).getByRole('button', { name: 'Abdominaux' }).click();
    await expect(recapSection.getByRole('button', { name: 'Abdominaux' })).toHaveAttribute('aria-pressed', 'true');

    // Première fois : « crunch » seul trouve le crunch au sol en tête ; aucun poids de départ demandé.
    await page.goto('./');
    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    await page.getByRole('link', { name: 'Ajouter un exercice' }).click();
    await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill('crunch');
    await expect(page.locator('.pick-list button, .results button').first()).toContainText('Crunch au sol');
    await page.getByRole('button', { name: /^Crunch au sol/ }).first().click();
    const card = exerciseCard(page, 'Crunch au sol');
    await expect(card).toBeVisible();
    await expect(page.getByLabel('Poids de départ (kg)')).toHaveCount(0);
    await expect(card.getByLabel(/Poids \(kg\)|Aide \(kg\)/)).toHaveCount(0);
    await expect(card.getByTestId('next-target')).toHaveText('3 × 10');
    await expect(card.getByTestId('start-hint')).toHaveText('Première fois');
    await expect(card.locator('.card-summary')).toHaveText('0/3');
    await card.getByRole('button', { name: 'Valider les 3 séries' }).click();
    await card.getByRole('button', { name: 'Bien', exact: true }).click();
    await expect(card.locator('.card-summary')).toHaveText('3/3');
    await finishSession(page);
    await expect(page.getByRole('main')).not.toContainText('0 kg');

    // Le lendemain : dernière fois sans charge, même cible ; deuxième verte → 3 × 11.
    await page.clock.setFixedTime(new Date('2026-10-28T18:00:00'));
    await page.goto('./');
    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    const again = await addExercise(page, 'crunch au sol', 'Crunch au sol');
    await expect(again.getByTestId('last-time')).toContainText('Dernière fois10 · 10 · 10 · 27/10');
    await expect(again.getByTestId('next-target')).toHaveText('3 × 10');
    await expect(again.getByTestId('same-target')).toHaveText('= Même cible : consolide');
    for (let i = 0; i < 3; i++) await again.getByRole('button', { name: 'Valider', exact: true }).click();
    await again.getByRole('button', { name: 'Très bien', exact: true }).click();
    await finishSession(page);
    const saved = (await readSessions(page)).filter((s) => s.state === 'done');
    // Enregistrées sans charge (0), avec les répétitions réelles.
    expect(saved.map((s) => s.performances.map((p) => [p.variantId, p.weightKg, p.reps]))).toEqual([
      [['crunch-sol', 0, [10, 10, 10]]],
      [['crunch-sol', 0, [10, 10, 10]]],
    ]);

    // Fiche : 3 × 11, « ↑ +1 rép. », record sans charge, historique sans « kg ».
    await page.goto('./#/exercice/crunch-sol');
    await expect(page.getByTestId('sheet-next')).toHaveText('3 × 11');
    await expect(page.getByTestId('progress-marker')).toHaveText('↑ +1 rép.');
    await expect(page.getByTestId('record')).toHaveText('Record : 3 × 10 (27 oct.)');
    await expect(page.getByTestId('bodyweight')).toHaveText('Poids du corps : progression par les répétitions (10 à 40)');
    // Graphique des répétitions seulement : pas de courbe de charge.
    await expect(page.getByTestId('chart-weight')).toHaveCount(0);
    await expect(page.getByTestId('chart-reps')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Historique de l’exercice' }).getByRole('listitem').first()).toContainText('10-10-10');
    await expect(page.getByRole('main')).not.toContainText(/\b0 kg/);
    // Détail d'une séance : répétitions sans charge.
    await page.goto(`./#/historique/${saved[0]!.id}`);
    await expect(page.getByRole('main')).toContainText('10 · 10 · 10');
    await expect(page.getByRole('main')).not.toContainText(/\b0 kg/);

    // Récapitulatif : abdominaux, 2 séances cette semaine, aucun autre groupe compté.
    await page.goto('./');
    const abdos = page.getByTestId('weekly-recap').locator('[data-group="abdominaux"]');
    await expect(abdos).toContainText('Abdominaux');
    await expect(abdos.locator('.recap-count')).toHaveText('(2×)');
    await expect(page.getByTestId('weekly-recap').locator('[data-group="jambes"] .recap-count')).toHaveCount(0);

    // À 360 px, la carte tient dans l'écran.
    await page.setViewportSize({ width: 360, height: 800 });
    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    await addExercise(page, 'heel touches', 'Crunch oblique touche talons');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});
