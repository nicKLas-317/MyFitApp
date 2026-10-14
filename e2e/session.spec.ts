import { expect, test } from '@playwright/test';
import {
  activeSession,
  addExercise,
  doExercise,
  exerciseCard,
  finishSession,
  readSessions,
  startSession,
  validateSets,
  writeSessions,
} from './helpers';

test.describe('Séance, persistance et chronomètre', () => {
  test('45 et 46. Le rechargement restaure la séance en cours et un chronomètre cohérent', async ({ page }) => {
    await startSession(page);
    const card = await addExercise(page, 'lat pulldown', 'Tirage vertical', '40');
    await validateSets(card, 1);
    await card.getByRole('button', { name: 'Répétitions série 2 : moins' }).click();
    await card.getByRole('button', { name: 'Valider' }).click();
    await card.getByRole('button', { name: 'Bien', exact: true }).click();
    await expect(page.getByText('Enregistré')).toBeVisible();

    const before = await activeSession(page);
    expect(before.performances[0]).toMatchObject({ weightKg: 40, targetReps: 8, reps: [8, 7], feeling: 'bien' });

    await page.waitForTimeout(2200);
    const chronoBefore = await page.getByTestId('chrono').textContent();
    expect(chronoBefore).toMatch(/^00:0[2-9]$/);

    await page.reload();
    const restored = exerciseCard(page, 'Tirage vertical');
    await expect(restored).toBeVisible();
    await expect(restored.getByText('2/3')).toBeVisible();
    await expect(restored.locator('.set.done .step-value')).toHaveText(['8', '7']);
    await expect(restored.getByRole('button', { name: 'Bien', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // Le chronomètre repart de l'horodatage de début : il ne revient pas à zéro.
    const chronoAfter = (await page.getByTestId('chrono').textContent()) ?? '';
    expect(chronoAfter >= (chronoBefore ?? '')).toBe(true);
    const after = await activeSession(page);
    expect(after.startedAt).toBe(before.startedAt);
    expect(after.performances).toEqual(before.performances);
  });

  test('51. Les corrections de séries mettent à jour les données, avec annulation', async ({ page }) => {
    await startSession(page);
    const card = await addExercise(page, 'chest press', 'Chest press', '30');
    await validateSets(card, 2);
    await card.getByRole('button', { name: 'Répétitions série 1 : moins' }).click();
    await card.getByRole('button', { name: 'Répétitions série 1 : moins' }).click();
    await expect.poll(async () => (await activeSession(page)).performances[0]?.reps).toEqual([6, 8]);

    // Le « + » est bloqué à la cible.
    await card.getByRole('button', { name: 'Répétitions série 1 : plus' }).click();
    await card.getByRole('button', { name: 'Répétitions série 1 : plus' }).click();
    await expect(card.getByRole('button', { name: 'Répétitions série 1 : plus' })).toBeDisabled();
    await expect.poll(async () => (await activeSession(page)).performances[0]?.reps).toEqual([8, 8]);

    // Annuler la dernière action.
    await card.getByRole('button', { name: 'Répétitions série 2 : moins' }).click();
    await expect.poll(async () => (await activeSession(page)).performances[0]?.reps).toEqual([8, 7]);
    await page.locator('.toast').getByRole('button', { name: 'Annuler' }).click();
    await expect.poll(async () => (await activeSession(page)).performances[0]?.reps).toEqual([8, 8]);

    // Supprimer une série saisie par erreur.
    await card.getByRole('button', { name: 'Supprimer la dernière série' }).click();
    await expect.poll(async () => (await activeSession(page)).performances[0]?.reps).toEqual([8]);
  });

  test('57. Un même exercice ne peut pas être ajouté deux fois : l’existant est ouvert', async ({ page }) => {
    await startSession(page);
    await addExercise(page, 'pec deck', 'Pec deck', '35');
    await addExercise(page, 'tirage', 'Tirage horizontal', '50');
    await page.getByRole('link', { name: '+ Ajouter un exercice' }).click();
    // L'écran de choix s'ouvre en haut, quel que soit le défilement de la séance.
    await expect(page.getByRole('heading', { name: 'Récents' }).or(page.getByRole('searchbox'))).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.getByRole('searchbox').fill('butterfly');
    await expect(page.getByText('dans la séance')).toBeVisible();
    await page.getByRole('button', { name: /^Pec deck/ }).click();
    await expect(page.locator('article.exercise-card')).toHaveCount(2);
    await expect(exerciseCard(page, 'Pec deck').getByRole('button', { name: 'Valider' })).toBeVisible();
    const session = await activeSession(page);
    expect(session.performances.map((p) => p.variantId)).toEqual(['pec-deck', 'tirage-horizontal']);
  });

  test('58. Poids : confirmation au-delà de 50 %, refus d’un poids nul ou invalide', async ({ page }) => {
    await startSession(page);
    const card = await addExercise(page, 'seated row', 'Tirage horizontal', '52');
    const weight = card.getByLabel('Poids (kg)');

    await weight.fill('520');
    await weight.press('Enter');
    await expect(card.getByText('520 kg ? C’est très différent de 52 kg.')).toBeVisible();
    await card.getByRole('button', { name: 'Corriger' }).click();
    await expect(weight).toHaveValue('52');
    expect((await activeSession(page)).performances[0]?.weightKg).toBe(52);

    await weight.fill('0');
    await weight.press('Enter');
    await expect(card.getByText('Poids invalide')).toBeVisible();
    expect((await activeSession(page)).performances[0]?.weightKg).toBe(52);

    await weight.fill('52,5');
    await weight.press('Enter');
    await expect.poll(async () => (await activeSession(page)).performances[0]?.weightKg).toBe(52.5);

    await weight.fill('100');
    await weight.press('Enter');
    await card.getByRole('button', { name: 'Confirmer 100 kg' }).click();
    await expect.poll(async () => (await activeSession(page)).performances[0]?.weightKg).toBe(100);
  });

  test('61. Séance ouverte depuis plus de 4 h : proposition de la terminer, jamais automatique', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Démarrer une séance' })).toBeVisible();
    const now = await page.evaluate(() => Date.now());
    const startedAt = now - 5 * 3600_000;
    const lastChange = startedAt + 75 * 60_000;
    await writeSessions(page, [
      {
        id: 'oubliee',
        name: 'Séance oubliée',
        date: '2026-10-14',
        startedAt,
        endedAt: null,
        createdAt: startedAt,
        updatedAt: lastChange,
        origin: 'app',
        state: 'active',
        performances: [
          { variantId: 'leg-curl', weightKg: 30, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' },
        ],
      },
    ]);

    await page.reload();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Séance toujours en cours')).toBeVisible();
    await dialog.getByRole('button', { name: 'Poursuivre' }).click();
    await expect(dialog).toBeHidden();
    expect((await readSessions(page))[0]?.state).toBe('active');

    await page.reload();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Terminer la séance' }).click();
    await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible();
    const [done] = await readSessions(page);
    expect(done?.state).toBe('done');
    // Heure de fin préremplie avec la dernière modification (à la minute près).
    expect(Math.abs((done?.endedAt ?? 0) - lastChange)).toBeLessThan(60_000);
    expect(done?.performances).toHaveLength(1);
  });

  test('74. Exercice sans série retiré à la fin, « Annuler » le rétablit', async ({ page }) => {
    await startSession(page);
    const curl = await addExercise(page, 'curl', 'Curl biceps haltères', '12');
    await doExercise(curl, 3, 'Bien');
    await addExercise(page, 'leg press', 'Presse à cuisses', '100');
    await finishSession(page);

    await expect(page.getByText('Exercice sans série retiré : Presse à cuisses')).toBeVisible();
    let [done] = await readSessions(page);
    expect(done?.performances.map((p) => p.variantId)).toEqual(['curl-biceps-halteres']);

    await expect(page.locator('.toast')).toBeHidden();
    await page.locator('.banner.info').getByRole('button', { name: 'Annuler' }).click();
    await expect(page.locator('.recap-item')).toHaveCount(2);
    await expect.poll(async () => (await readSessions(page))[0]?.performances.length).toBe(2);
    [done] = await readSessions(page);
    expect(done?.performances[1]).toMatchObject({ variantId: 'presse-a-cuisses', reps: [] });
    await expect(page.locator('.recap-item[data-variant="presse-a-cuisses"] [data-status]')).toHaveAttribute('data-status', 'orange');
  });

  test('Échec d’enregistrement signalé, jamais annoncé comme enregistré, puis relance', async ({ page }) => {
    await startSession(page);
    const card = await addExercise(page, 'leg curl', 'Leg curl', '30');
    await expect(page.getByText('Enregistré')).toBeVisible();

    // Toute écriture IndexedDB échoue (quota dépassé, stockage effacé…).
    await page.evaluate(() => {
      const w = window as unknown as { __put: typeof IDBObjectStore.prototype.put };
      w.__put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () {
        throw new DOMException('Quota dépassé', 'QuotaExceededError');
      };
    });
    await validateSets(card, 1);
    await expect(page.getByRole('alert')).toContainText('Échec de l’enregistrement');
    await expect(page.getByText('Enregistré', { exact: true })).toBeHidden();
    expect((await activeSession(page)).performances[0]?.reps).toEqual([]);

    // Le stockage revient : « Réessayer » enregistre la dernière version.
    await page.evaluate(() => {
      const w = window as unknown as { __put: typeof IDBObjectStore.prototype.put };
      IDBObjectStore.prototype.put = w.__put;
    });
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByRole('alert')).toBeHidden();
    await expect(page.getByText('Enregistré', { exact: true })).toBeVisible();
    expect((await activeSession(page)).performances[0]?.reps).toEqual([8]);
  });

  test('Retrait d’un exercice de la séance, avec annulation', async ({ page }) => {
    await startSession(page);
    const card = await addExercise(page, 'crunch', 'Crunch machine', '20');
    await card.getByRole('button', { name: 'Retirer de la séance' }).click();
    await expect(card).toBeHidden();
    await expect.poll(async () => (await activeSession(page)).performances.length).toBe(0);
    await page.locator('.toast').getByRole('button', { name: 'Annuler' }).click();
    await expect(exerciseCard(page, 'Crunch machine')).toBeVisible();
    await expect.poll(async () => (await activeSession(page)).performances.length).toBe(1);
  });

  test('Fin de séance : enregistrée avant le nom, nom par défaut conservé en une action ou renommé', async ({ page }) => {
    await startSession(page);
    await doExercise(await addExercise(page, 'pec deck', 'Pec deck', '35'), 3, 'Bien');
    await finishSession(page);

    let [done] = await readSessions(page);
    expect(done?.state).toBe('done');
    expect(done?.endedAt).not.toBeNull();
    expect(done?.name).toMatch(/^Séance du \d{1,2} \S+ \d{4} — \d{1,2} h \d{2}$/);

    await page.getByLabel('Nom de la séance').fill('Haut du corps');
    await page.getByRole('button', { name: 'Enregistrer le nom' }).click();
    await expect(page.getByRole('button', { name: 'Démarrer une séance' })).toBeVisible();
    [done] = await readSessions(page);
    expect(done?.name).toBe('Haut du corps');
  });
});

test.describe('§16 Scénarios de progression (parcours réel)', () => {
  test('1 et 2. Une séance verte à 3×8 ne progresse pas ; la deuxième propose 3×9', async ({ page }) => {
    await startSession(page);
    await doExercise(await addExercise(page, 'leg extension', 'Leg extension', '40'), 3, 'Bien');
    await finishSession(page);
    await expect(page.getByTestId('next-target')).toHaveText('3 × 8');
    await page.getByRole('button', { name: 'Garder ce nom' }).click();

    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    const card = await addExercise(page, 'leg extension', 'Leg extension');
    await expect(card.getByTestId('target')).toHaveText('3 × 8');
    await expect(card.getByLabel('Poids (kg)')).toHaveValue('40');
    await doExercise(card, 3, 'Très bien');
    await finishSession(page);
    await expect(page.getByTestId('next-target')).toHaveText('3 × 9');
    await page.getByRole('button', { name: 'Garder ce nom' }).click();

    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    const third = await addExercise(page, 'leg extension', 'Leg extension');
    await expect(third.getByTestId('target')).toHaveText('3 × 9');
    await expect(third.locator('[data-status]')).toHaveAttribute('data-status', 'vert');
  });
});
