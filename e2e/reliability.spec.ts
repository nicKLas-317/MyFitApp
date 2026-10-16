import { expect, test, type Page } from '@playwright/test';
import { activeSession, addExercise, readSessions, startSession } from './helpers';

/** Simule le passage en arrière-plan (écran verrouillé, autre appli) : Playwright ne peut pas masquer l'onglet. */
async function goBackground(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test.describe('Fiabilité de l’enregistrement (§12)', () => {
  test('120. « Valider » puis fermeture immédiate de l’appli : la série est enregistrée', async ({ page, context }) => {
    await startSession(page);
    await addExercise(page, 'leg curl', 'Leg curl', '30');
    await expect(page.getByText('Enregistré', { exact: true })).toBeVisible();
    for (const expected of [[8], [8, 8], [8, 8, 8]]) {
      // Aucune attente entre le clic et la fermeture : comme une appli tuée par Android aussitôt la série validée.
      await page.locator('article[aria-label="Leg curl"]').getByRole('button', { name: 'Valider' }).click({ noWaitAfter: true });
      await page.close({ runBeforeUnload: false });
      page = await context.newPage();
      await page.goto('./#/seance');
      await expect(page.getByTestId('chrono')).toBeVisible();
      expect((await activeSession(page)).performances[0]?.reps).toEqual(expected);
      // L'interface rouverte affiche les séries enregistrées.
      await expect(page.locator('article[aria-label="Leg curl"] .sets .done')).toHaveCount(expected.length);
    }
  });

  test('121. Passage en arrière-plan : une écriture échouée est relancée et un poids tapé est enregistré', async ({ page }) => {
    await startSession(page);
    const card = await addExercise(page, 'leg curl', 'Leg curl', '30');
    await expect(page.getByText('Enregistré', { exact: true })).toBeVisible();

    // L'écriture échoue (stockage momentanément indisponible)…
    await page.evaluate(() => {
      const w = window as unknown as { __put: typeof IDBObjectStore.prototype.put };
      w.__put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () {
        throw new DOMException('Indisponible', 'UnknownError');
      };
    });
    await card.getByRole('button', { name: 'Valider' }).click();
    await expect(page.getByRole('alert')).toContainText('Échec de l’enregistrement');
    expect((await activeSession(page)).performances[0]?.reps).toEqual([]);
    await page.evaluate(() => {
      const w = window as unknown as { __put: typeof IDBObjectStore.prototype.put };
      IDBObjectStore.prototype.put = w.__put;
    });
    // … puis l'appli passe en arrière-plan : la dernière version est relancée sans action de l'utilisateur.
    await goBackground(page);
    await expect.poll(async () => (await activeSession(page)).performances[0]?.reps).toEqual([8]);

    // Un poids tapé sans quitter le champ est enregistré au passage en arrière-plan.
    await page.reload();
    await page.getByLabel('Poids (kg)').fill('32,5');
    await goBackground(page);
    await expect.poll(async () => (await activeSession(page)).performances[0]?.weightKg).toBe(32.5);
    expect((await readSessions(page)).filter((s) => s.state === 'active')).toHaveLength(1);
  });
});
