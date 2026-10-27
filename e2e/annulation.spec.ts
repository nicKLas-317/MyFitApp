import { expect, test, type Page } from '@playwright/test';
import type { SessionPlan } from '../src/domain/types';
import { addExercise, readSessions, validateSets } from './helpers';

const PLAN: SessionPlan = { id: 'plan-annulation', createdAt: 0, updatedAt: 0, items: [{ kind: 'exercise', variantId: 'pec-deck', startWeightKg: 30 }] };

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

/** Menu « ⋯ » de l'en-tête de la séance, puis « Annuler la séance » : volet de confirmation. */
async function askCancel(page: Page) {
  await page.getByRole('button', { name: 'Actions : Séance' }).click();
  await page.getByRole('menuitem', { name: 'Annuler la séance' }).click();
  const sheet = page.getByRole('dialog', { name: 'Annuler cette séance ?' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe('Annuler une séance en cours (version 1.27.0)', () => {
  test('263. Annuler : confirmation (rien de saisi, ou séries et cardio perdus), séance supprimée sans récapitulatif ; plan gardé ; à la maison', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-27T18:00:00'));
    await page.goto('./');

    // Séance démarrée par erreur, rien de saisi : « Non, continuer » garde la séance, « Oui » la supprime.
    await page.getByRole('button', { name: 'Démarrer une séance', exact: true }).click();
    await expect(page.getByTestId('chrono')).toBeVisible();
    // Pas dans la barre du pouce.
    await expect(page.locator('.session-bar')).toBeVisible();
    await expect(page.locator('.session-bar').getByText(/Annuler/)).toHaveCount(0);
    let sheet = await askCancel(page);
    await expect(sheet.getByTestId('cancel-loss')).toHaveText('Rien n’a été saisi.');
    // « Non, continuer » en principal, la confirmation en rouge.
    await expect(sheet.getByRole('button', { name: 'Non, continuer' })).toHaveClass(/primary/);
    await expect(sheet.getByRole('button', { name: 'Oui, annuler la séance' })).toHaveClass(/danger/);
    await sheet.getByRole('button', { name: 'Non, continuer' }).click();
    await expect(sheet).toBeHidden();
    expect((await readSessions(page)).filter((s) => s.state === 'active')).toHaveLength(1);
    sheet = await askCancel(page);
    await sheet.getByRole('button', { name: 'Oui, annuler la séance' }).click();
    await expect(page.getByRole('button', { name: 'Démarrer une séance', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Séance terminée' })).toHaveCount(0);
    expect(await readSessions(page)).toEqual([]);
    // Plus de séance en cours : rien à reprendre.
    await expect(page.getByRole('button', { name: 'Reprendre la séance' })).toHaveCount(0);

    // Avec saisie : 4 séries et 1 cardio perdus, rien dans l'historique, le récapitulatif ni les records.
    await page.getByRole('button', { name: 'Démarrer une séance', exact: true }).click();
    const pec = await addExercise(page, 'pec deck', 'Pec deck', '30');
    await validateSets(pec, 3);
    const curl = await addExercise(page, 'curl biceps haltères', 'Curl biceps haltères', '12');
    await validateSets(curl, 1);
    await page.getByRole('button', { name: 'Ajouter du cardio' }).click();
    const form = page.getByRole('form', { name: 'Cardio' });
    await form.getByLabel('Durée (min)').fill('10');
    await form.getByRole('button', { name: 'Valider', exact: true }).click();
    await expect(form).toBeHidden();
    sheet = await askCancel(page);
    await expect(sheet.getByTestId('cancel-loss')).toHaveText('4 séries et 1 cardio seront perdus.');
    await sheet.getByRole('button', { name: 'Oui, annuler la séance' }).click();
    await expect(page.getByTestId('weekly-recap')).toContainText(': 0 séance');
    expect(await readSessions(page)).toEqual([]);
    await page.goto('./#/historique');
    await expect(page.getByRole('main')).not.toContainText('ex.');
    await page.goto('./#/exercice/pec-deck');
    await expect(page.getByTestId('last-time')).toContainText('jamais réalisé');

    // Démarrée depuis la séance prévue : annulée, le plan reste intact et proposé.
    await page.goto('./');
    await setPlan(page, PLAN);
    await page.getByRole('button', { name: 'Démarrer la séance prévue' }).click();
    await validateSets(page.locator('article[aria-label="Pec deck"]'), 1);
    sheet = await askCancel(page);
    await expect(sheet.getByTestId('cancel-loss')).toHaveText('1 série sera perdue.');
    await sheet.getByRole('button', { name: 'Oui, annuler la séance' }).click();
    await expect(page.getByRole('button', { name: 'Démarrer la séance prévue' })).toBeVisible();
    await expect(page.getByTestId('plan-summary')).toHaveText('Pec deck');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Démarrer la séance prévue' })).toBeVisible();
    expect(await readSessions(page)).toEqual([]);

    // À la maison : même menu, même annulation.
    await page.getByRole('group', { name: 'Lieu de la séance libre' }).getByRole('button', { name: 'Maison' }).click();
    await page.getByRole('button', { name: 'Séance libre à la maison' }).click();
    await expect(page.getByTestId('session-place')).toBeVisible();
    await validateSets(await addExercise(page, 'crunch au sol', 'Crunch au sol'), 2);
    sheet = await askCancel(page);
    await expect(sheet.getByTestId('cancel-loss')).toHaveText('2 séries seront perdues.');
    await sheet.getByRole('button', { name: 'Oui, annuler la séance' }).click();
    await expect(page.getByRole('button', { name: 'Démarrer la séance prévue' })).toBeVisible();
    expect(await readSessions(page)).toEqual([]);
  });
});
