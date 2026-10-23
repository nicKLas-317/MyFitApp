import { expect, test, type Page } from '@playwright/test';
import { addExercise, doExercise, exerciseCard, finishSession, readSessions, startSession } from './helpers';

async function resultNames(page: Page, query: string): Promise<string[]> {
  await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill(query);
  const list = page.getByRole('list', { name: 'Résultats' });
  await expect(list).toBeVisible();
  return list.locator('.pick-item strong').allTextContents();
}

test.describe('Bibliothèque version 8 (§4.0)', () => {
  test('160. « squat », « hack », mollets assis, variantes distinctes, tractions assistées en aide, récapitulatif', async ({ page }) => {
    await page.goto('./#/bibliotheque');
    await expect(page.getByRole('searchbox', { name: 'Rechercher un exercice' })).toBeVisible();
    expect((await resultNames(page, 'squat'))[0]).toBe('Squat kettlebell');
    expect(await resultNames(page, 'hack')).toEqual(['Hack squat']);
    expect(await resultNames(page, 'mollets assis')).toEqual(['Mollets machine']);
    await expect(page.getByRole('list', { name: 'Résultats' })).toContainText('Assis');
    expect(await resultNames(page, 'curl ez')).toEqual(['Curl biceps barre EZ']);
    expect(await resultNames(page, 'pushdown barre')).toEqual(['Extension triceps poulie']);
    await expect(page.getByRole('list', { name: 'Résultats' })).toContainText('Barre');

    // Fiches : dessins distincts pour la machine debout et la machine assise, pour la corde et la barre.
    const src = async (id: string) => {
      await page.goto(`./#/exercice/${id}`);
      const img = page.locator('figure.illustration img');
      await expect(img, id).toBeVisible();
      return img.getAttribute('src');
    };
    expect(await src('mollets-machine')).not.toBe(await src('mollets-machine--assis'));
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Mollets machine');
    expect(await src('extension-triceps-poulie')).not.toBe(await src('extension-triceps-poulie--barre'));

    // Séance : tractions assistées (charge = aide) et squat kettlebell.
    await startSession(page);
    await page.getByRole('link', { name: 'Ajouter un exercice' }).click();
    await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill('tractions assistées');
    await page.getByRole('button', { name: /^Tractions assistées/ }).first().click();
    await page.getByLabel('Aide de départ (kg)').fill('30');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    const tractions = exerciseCard(page, 'Tractions assistées');
    await expect(tractions.getByLabel('Aide (kg)')).toHaveValue('30');
    await doExercise(tractions, 3, 'Bien');
    const squat = await addExercise(page, 'squat', 'Squat kettlebell', '16');
    await doExercise(squat, 3, 'Bien');
    await finishSession(page);
    await page.getByRole('button', { name: 'Garder ce nom' }).click();
    await expect(page.getByRole('button', { name: 'Démarrer une séance' })).toBeVisible();
    const [session] = await readSessions(page);
    expect(session!.performances.map((p) => [p.variantId, p.weightKg])).toEqual([['tractions-assistees', 30], ['squat-kettlebell', 16]]);
    const recap = page.getByTestId('weekly-recap');
    await expect(recap.locator('[data-group="dos"]')).toHaveText('Dos (1×) · aujourd’hui');
    await expect(recap.locator('[data-group="jambes"]')).toHaveText('Jambes (1×) · aujourd’hui');
  });
});
