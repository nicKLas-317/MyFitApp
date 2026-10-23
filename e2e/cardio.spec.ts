import { expect, test, type Page } from '@playwright/test';
import { activeSession, addExercise, doExercise, finishSession, readSessions, startSession, validateSets, cardAction, finishSheet, openScreen, openSettingsSection } from './helpers';

const cardioForm = (page: Page) => page.getByRole('form', { name: 'Cardio' });

/** Machine, inclinaison si tapis, durée, valider. */
async function addCardio(page: Page, machine: string, minutes: string, incline?: string): Promise<void> {
  await page.getByRole('button', { name: 'Ajouter du cardio' }).click();
  const form = cardioForm(page);
  await form.getByRole('button', { name: machine, exact: true }).click();
  if (incline) await form.getByRole('button', { name: incline, exact: true }).click();
  await form.getByLabel('Durée (min)').fill(minutes);
  await form.getByRole('button', { name: 'Valider' }).click();
  await expect(form).toBeHidden();
}

const recapTitle = (page: Page) => page.getByTestId('weekly-recap').getByRole('heading');

/** Réglages : retire une machine de cardio par son menu « ⋯ ». */
async function removeMachine(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: `Actions : ${name}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Retirer' }).click();
}

test.describe('Cardio', () => {
  test('114. Séance avec un exercice et deux blocs de cardio : saisie, rechargement, récapitulatif, historique et accueil', async ({ page }) => {
    await startSession(page);
    // Cardio au début de la séance : l'inclinaison n'est proposée que pour le tapis, Neutre par défaut.
    await page.getByRole('button', { name: 'Ajouter du cardio' }).click();
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

    // Correction d'un bloc, depuis son menu « ⋯ ».
    await cardAction(page.locator('.cardio-item').nth(1), 'Corriger');
    await cardioForm(page).getByLabel('Durée (min)').fill('15');
    await cardioForm(page).getByRole('button', { name: 'Valider' }).click();
    await expect(texts.nth(1)).toHaveText('Rameur · 15 min');

    await page.getByRole('button', { name: 'Terminer la séance' }).click();
    await page.getByRole('button', { name: 'Oui, terminer' }).click();
    await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible();
    await expect(texts).toHaveText(['Tapis de marche · inclinaison haute · 20 min', 'Rameur · 15 min']);
    await expect(page.locator('.recap-item').first()).toContainText('Pec deck');
    await page.getByRole('button', { name: 'Garder ce nom' }).click();
    await expect(page.getByRole('button', { name: 'Démarrer une séance' })).toBeVisible();

    await expect(recapTitle(page)).toContainText(/1\s+séance · 35\s+min\s+de cardio/);
    // Le cardio n'entre dans aucun groupe : seuls les pectoraux sont comptés.
    await expect(page.locator('.recap-cell:not([data-color="vert"])')).toHaveCount(1);

    await openScreen(page, 'Historique');
    await expect(page.locator('.session-link')).toContainText('1 ex. · 35 min cardio');
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
    // Retrait depuis le menu « ⋯ », après confirmation ; il s'annule ensuite.
    const second = page.locator('.cardio-item').nth(1);
    await cardAction(second, 'Retirer');
    await second.getByRole('button', { name: 'Non' }).click();
    await expect(page.getByTestId('cardio-text')).toHaveCount(2);
    await cardAction(second, 'Retirer');
    await second.getByRole('button', { name: 'Oui, retirer' }).click();
    await expect(page.getByTestId('cardio-text')).toHaveCount(1);
    await page.locator('.toast').getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByTestId('cardio-text')).toHaveCount(2);
    await cardAction(second, 'Retirer');
    await second.getByRole('button', { name: 'Oui, retirer' }).click();
    await expect.poll(async () => (await activeSession(page)).cardio?.length).toBe(1);

    await page.getByRole('button', { name: 'Terminer la séance' }).click();
    await page.getByRole('button', { name: 'Oui, terminer' }).click();
    await expect(page.getByTestId('cardio-text')).toHaveText(['Vélo elliptique · 25 min']);
    await page.getByRole('button', { name: 'Garder ce nom' }).click();
    await expect(page.getByRole('button', { name: 'Démarrer une séance' })).toBeVisible();
    await expect(recapTitle(page)).toContainText(/1\s+séance · 25\s+min\s+de cardio/);
    await expect(page.locator('.recap-cell:not([data-color="vert"])')).toHaveCount(0);
  });

  test('116. Import de notes : « incliné » sans niveau demande de choisir, puis le cardio est importé', async ({ page }) => {
    await page.goto('./');
    await openScreen(page, 'Importer / exporter');
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
    await openScreen(page, 'Réglages');
    const machines = await openSettingsSection(page, 'Machines de cardio');
    await machines.getByLabel('Nouvelle machine').fill('Vélo droit');
    await machines.getByRole('button', { name: 'Ajouter', exact: true }).click();
    // « Retirer » n'est plus affiché en permanence : il est dans le menu « ⋯ » de chaque machine.
    await expect(machines.getByRole('button', { name: /Retirer/ })).toHaveCount(0);
    await removeMachine(page, 'Autre');
    await page.getByRole('button', { name: 'Enregistrer les machines' }).click();
    await expect(page.getByText('Machines enregistrées.')).toBeVisible();

    await page.reload();
    await openSettingsSection(page, 'Machines de cardio');
    await expect(page.getByLabel('Nom de la machine 5')).toHaveValue('Vélo droit');
    await startSession(page);
    await page.getByRole('button', { name: 'Ajouter du cardio' }).click();
    await expect(cardioForm(page).locator('.chip')).toHaveText(['Tapis de marche', 'Rameur', 'Vélo elliptique', 'Vélo', 'Vélo droit', 'Neutre', 'Moyenne', 'Haute']);
  });

  test('164. Deux fenêtres de l’appli ouvertes : le cardio ajouté dans l’une n’est jamais écrasé par les séries de l’autre', async ({ page, context }) => {
    // Fenêtre restée ouverte sur la séance (appli installée), puis seconde fenêtre (onglet Chrome).
    await startSession(page);
    const card = await addExercise(page, 'pec deck', 'Pec deck', '30');
    await validateSets(card, 1);
    const other = await context.newPage();
    await other.goto('./#/seance');
    await addCardio(other, 'Vélo elliptique', '11');
    await expect.poll(async () => (await activeSession(page)).cardio?.map((b) => b.minutes)).toEqual([11]);

    // La première fenêtre est prévenue de l'écriture : ses séries suivantes gardent le bloc.
    await expect(page.getByTestId('cardio-text')).toHaveText(['Vélo elliptique · 11 min']);
    await validateSets(card, 2);
    await card.getByRole('button', { name: 'Bien', exact: true }).click();
    await finishSession(page);
    await expect(page.getByTestId('cardio-text')).toHaveText(['Vélo elliptique · 11 min']);
    await expect(page.locator('.recap-item').first()).toContainText('Pec deck');
    const [done] = await readSessions(page);
    expect(done?.state).toBe('done');
    expect(done?.performances[0]?.reps).toEqual([8, 8, 8]);
    expect(done?.cardio?.map((b) => `${b.machine} ${b.minutes}`)).toEqual(['Vélo elliptique 11']);

    // Fenêtre sans canal entre fenêtres (gelée en arrière-plan) : elle relit la base en revenant au premier plan.
    const background = await context.newPage();
    await background.addInitScript(() => {
      delete (window as { BroadcastChannel?: unknown }).BroadcastChannel;
    });
    await startSession(background);
    const legCurl = await addExercise(background, 'leg curl', 'Leg curl', '30');
    await validateSets(legCurl, 1);
    // Cette fenêtre-là n'a pas de canal pour prévenir : l'autre fenêtre est rouverte pour voir la séance.
    await other.reload();
    await addCardio(other, 'Rameur', '10');
    await expect(background.getByTestId('cardio-text')).toHaveCount(0);
    await background.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(background.getByTestId('cardio-text')).toHaveText(['Rameur · 10 min']);
    await validateSets(legCurl, 2);
    await legCurl.getByRole('button', { name: 'Bien', exact: true }).click();
    await finishSession(background);
    const second = (await readSessions(background)).find((s) => s.id !== done?.id);
    expect(second?.state).toBe('done');
    expect(second?.performances[0]?.reps).toEqual([8, 8, 8]);
    expect(second?.cardio?.map((b) => `${b.machine} ${b.minutes}`)).toEqual(['Rameur 10']);
  });

  test('165. Cardio rempli mais pas validé à la fin de la séance : proposé à l’enregistrement, jamais perdu', async ({ page }) => {
    await startSession(page);
    const card = await addExercise(page, 'pec deck', 'Pec deck', '30');
    await doExercise(card, 3, 'Bien');
    await page.getByRole('button', { name: 'Ajouter du cardio' }).click();
    await cardioForm(page).getByRole('button', { name: 'Vélo elliptique', exact: true }).click();
    await cardioForm(page).getByLabel('Durée (min)').fill('0');

    // Durée invalide : la fin est bloquée avec un message, sans bouton inactif.
    await page.getByRole('button', { name: 'Terminer la séance' }).click();
    const confirm = finishSheet(page);
    await expect(confirm.getByRole('alert')).toHaveText('Cardio non validé : Durée invalide : un nombre entier de minutes. Corrigez-le ou annulez-le.');
    await expect(confirm.getByRole('button', { name: /terminer/i })).toHaveCount(0);

    // « Non, continuer la séance » referme le volet ; la durée corrigée, le cardio est proposé à l'enregistrement.
    await confirm.getByRole('button', { name: 'Non, continuer la séance' }).click();
    await cardioForm(page).getByLabel('Durée (min)').fill('11');
    await page.getByRole('button', { name: 'Terminer la séance' }).click();
    await expect(confirm.getByTestId('unsaved-cardio')).toHaveText('Cardio non validé : Vélo elliptique · 11 min');
    await confirm.getByRole('button', { name: 'Enregistrer le cardio et terminer' }).click();
    await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible();
    await expect(page.getByTestId('cardio-text')).toHaveText(['Vélo elliptique · 11 min']);
    const [done] = await readSessions(page);
    expect(done?.state).toBe('done');
    expect(done?.cardio?.map((b) => `${b.machine} ${b.minutes}`)).toEqual(['Vélo elliptique 11']);

    // Formulaire ouvert mais vide : la fin est inchangée.
    await page.getByRole('button', { name: 'Garder ce nom' }).click();
    await expect(page.getByRole('button', { name: 'Démarrer une séance' })).toBeVisible();
    await startSession(page);
    await page.getByRole('button', { name: 'Ajouter du cardio' }).click();
    await page.getByRole('button', { name: 'Terminer la séance' }).click();
    await expect(page.getByTestId('unsaved-cardio')).toHaveCount(0);
    await page.getByRole('button', { name: 'Oui, terminer' }).click();
    await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible();
  });

  test('124. Une liste enregistrée par la version 1.2.0 reçoit « Vélo » une seule fois au lancement', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    // Liste personnalisée enregistrée avant l'ajout du vélo, sans numéro de version.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('myfitapp');
          open.onsuccess = () => {
            const tx = open.result.transaction('meta', 'readwrite');
            const old = [
              { id: 'tapis', name: 'Tapis', incline: true },
              { id: 'rameur', name: 'Rameur', incline: false },
              { id: 'elliptique', name: 'Vélo elliptique', incline: false },
              { id: 'autre', name: 'Autre', incline: false },
            ];
            tx.objectStore('meta').put(old, 'cardioMachines');
            tx.oncomplete = () => {
              open.result.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.goto('./#/reglages');
    await page.reload();
    const names = () => page.locator('.machine-row input').evaluateAll((list) => list.map((i) => (i as HTMLInputElement).value));
    await expect.poll(names).toEqual(['Tapis', 'Rameur', 'Vélo elliptique', 'Vélo', 'Autre']);

    // Retirée par l'utilisateur, elle n'est jamais recréée.
    await openSettingsSection(page, 'Machines de cardio');
    await removeMachine(page, 'Vélo');
    await page.getByRole('button', { name: 'Enregistrer les machines' }).click();
    await expect(page.getByText('Machines enregistrées.')).toBeVisible();
    await page.reload();
    await expect.poll(names).toEqual(['Tapis', 'Rameur', 'Vélo elliptique', 'Autre']);
  });
});
