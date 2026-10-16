import { expect, test, type Page } from '@playwright/test';
import { activeSession, addExercise, doExercise, readSessions, startSession } from './helpers';

const cardioForm = (page: Page) => page.getByRole('form', { name: 'Cardio' });

/** Machine, inclinaison si tapis, durée, valider. */
async function addCardio(page: Page, machine: string, minutes: string, incline?: string): Promise<void> {
  await page.getByRole('button', { name: '+ Ajouter du cardio' }).click();
  const form = cardioForm(page);
  await form.getByRole('button', { name: machine, exact: true }).click();
  if (incline) await form.getByRole('button', { name: incline, exact: true }).click();
  await form.getByLabel('Durée (min)').fill(minutes);
  await form.getByRole('button', { name: 'Valider' }).click();
  await expect(form).toBeHidden();
}

const recapTitle = (page: Page) => page.getByTestId('weekly-recap').getByRole('heading');

test.describe('Cardio', () => {
  test('114. Séance avec un exercice et deux blocs de cardio : saisie, rechargement, récapitulatif, historique et accueil', async ({ page }) => {
    await startSession(page);
    // Cardio au début de la séance : l'inclinaison n'est proposée que pour le tapis, Neutre par défaut.
    await page.getByRole('button', { name: '+ Ajouter du cardio' }).click();
    await expect(cardioForm(page).getByRole('button', { name: 'Neutre' })).toHaveAttribute('aria-pressed', 'true');
    await cardioForm(page).getByRole('button', { name: 'Rameur' }).click();
    await expect(cardioForm(page).getByText('Inclinaison')).toBeHidden();
    await cardioForm(page).getByRole('button', { name: 'Annuler' }).click();

    await addCardio(page, 'Tapis de marche', '20', 'Haute');
    const card = await addExercise(page, 'pec deck', 'Pec deck', '30');
    await doExercise(card, 3, 'Bien');
    await addCardio(page, 'Rameur', '10');

    await expect.poll(async () => (await activeSession(page)).cardio).toEqual([
      { id: expect.any(String), machineId: 'tapis', machine: 'Tapis de marche', incline: 'haute', minutes: 20 },
      { id: expect.any(String), machineId: 'rameur', machine: 'Rameur', minutes: 10 },
    ]);
    await page.reload();
    const texts = page.getByTestId('cardio-text');
    await expect(texts).toHaveText(['Tapis de marche · inclinaison haute · 20 min', 'Rameur · 10 min']);

    // Correction d'un bloc.
    await page.locator('.cardio-item').nth(1).getByRole('button', { name: 'Corriger' }).click();
    await cardioForm(page).getByLabel('Durée (min)').fill('15');
    await cardioForm(page).getByRole('button', { name: 'Valider' }).click();
    await expect(texts.nth(1)).toHaveText('Rameur · 15 min');

    await page.getByRole('button', { name: 'Terminer la séance' }).click();
    await page.getByRole('button', { name: 'Oui, terminer' }).click();
    await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible();
    await expect(texts).toHaveText(['Tapis de marche · inclinaison haute · 20 min', 'Rameur · 15 min']);
    await expect(page.locator('.recap-item').first()).toContainText('Pec deck');
    await page.getByRole('button', { name: 'Garder ce nom' }).click();

    await expect(recapTitle(page)).toContainText(/1\s+séance · 35\s+min\s+de cardio/);
    // Le cardio n'entre dans aucun groupe : seuls les pectoraux sont comptés.
    await expect(page.locator('.recap-cell:not([data-color="vert"])')).toHaveCount(1);

    await page.getByRole('link', { name: 'Historique' }).click();
    await expect(page.locator('.pick-meta')).toContainText('1 ex. · 35 min cardio');
    await page.locator('.session-link').click();
    await expect(texts).toHaveText(['Tapis de marche · inclinaison haute · 20 min', 'Rameur · 15 min']);
    const done = (await readSessions(page)).filter((s) => s.state === 'done');
    expect(done).toHaveLength(1);
    expect(done[0]!.cardio?.map((b) => b.minutes)).toEqual([20, 15]);
  });

  test('115. Une séance de cardio seul compte dans l’en-tête de l’accueil ; le retrait d’un bloc s’annule', async ({ page }) => {
    await startSession(page);
    await addCardio(page, 'Vélo elliptique', '25');
    await addCardio(page, 'Autre', '5');
    await page.locator('.cardio-item').nth(1).getByRole('button', { name: 'Retirer' }).click();
    await expect(page.getByTestId('cardio-text')).toHaveCount(1);
    await page.locator('.toast').getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByTestId('cardio-text')).toHaveCount(2);
    await page.locator('.cardio-item').nth(1).getByRole('button', { name: 'Retirer' }).click();
    await expect.poll(async () => (await activeSession(page)).cardio?.length).toBe(1);

    await page.getByRole('button', { name: 'Terminer la séance' }).click();
    await page.getByRole('button', { name: 'Oui, terminer' }).click();
    await expect(page.getByTestId('cardio-text')).toHaveText(['Vélo elliptique · 25 min']);
    await page.getByRole('button', { name: 'Garder ce nom' }).click();
    await expect(recapTitle(page)).toContainText(/1\s+séance · 25\s+min\s+de cardio/);
    await expect(page.locator('.recap-cell:not([data-color="vert"])')).toHaveCount(0);
  });

  test('116. Import de notes : « incliné » sans niveau demande de choisir, puis le cardio est importé', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('link', { name: 'Importer / exporter' }).click();
    await page.getByLabel('Notes de séance ou JSON').fill('Tapis incliné 20 min\nRameur 10 min\nMarche 15 min');
    await page.getByRole('button', { name: 'Analyser' }).click();
    const preview = page.getByRole('region', { name: 'Aperçu de l’import' });
    await preview.getByLabel('Date de la séance').fill('2026-10-14');

    const tapis = preview.getByRole('article', { name: 'Cardio : Tapis incliné' });
    await expect(tapis.getByText('Inclinaison non précisée : choisissez Moyenne ou Haute.')).toBeVisible();
    await expect(preview.getByRole('article', { name: 'Cardio : Marche' }).getByRole('button', { name: 'Neutre' })).toHaveAttribute('aria-pressed', 'true');
    await preview.getByRole('button', { name: 'Importer la séance (0 exercice, 3 blocs de cardio)' }).click();
    expect(await readSessions(page)).toEqual([]);

    await tapis.getByRole('button', { name: 'Haute' }).click();
    await preview.getByRole('button', { name: 'Importer la séance (0 exercice, 3 blocs de cardio)' }).click();
    await expect(page.getByText('Séance importée : 0 exercice, 3 blocs de cardio.')).toBeVisible();
    const [session] = await readSessions(page);
    expect(session?.cardio?.map((b) => [b.machineId, b.incline, b.minutes])).toEqual([
      ['tapis', 'haute', 20],
      ['rameur', undefined, 10],
      ['tapis', 'neutre', 15],
    ]);
  });

  test('117. Les machines se modifient dans les réglages et sont proposées pendant la séance', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('link', { name: 'Réglages' }).click();
    await page.getByLabel('Nouvelle machine').fill('Vélo droit');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await page.getByRole('button', { name: 'Retirer Autre' }).click();
    await page.getByRole('button', { name: 'Enregistrer les machines' }).click();
    await expect(page.getByText('Machines enregistrées.')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Nom de la machine 4')).toHaveValue('Vélo droit');
    await startSession(page);
    await page.getByRole('button', { name: '+ Ajouter du cardio' }).click();
    await expect(cardioForm(page).locator('.chip')).toHaveText(['Tapis de marche', 'Rameur', 'Vélo elliptique', 'Vélo droit', 'Neutre', 'Moyenne', 'Haute']);
  });
});
