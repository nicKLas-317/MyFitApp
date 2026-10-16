import { expect, test, type Page } from '@playwright/test';
import { addExercise, doExercise, finishSession, readExercises, readSessions, startSession } from './helpers';

async function resultNames(page: Page, query: string): Promise<string[]> {
  await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill(query);
  const list = page.getByRole('list', { name: 'Résultats' });
  await expect(list).toBeVisible();
  return list.locator('.pick-item strong').allTextContents();
}

test.describe('Bibliothèque version 7 (§4.0)', () => {
  test('152. Mollets, fessiers et adducteurs trouvés dans la bibliothèque, abduction ≠ adduction, illustrations, séance comptée dans « Jambes »', async ({ page }) => {
    await page.goto('./#/bibliotheque');
    await expect(page.getByRole('searchbox', { name: 'Rechercher un exercice' })).toBeVisible();
    // Version 8 : machine debout puis machine assise.
    expect(await resultNames(page, 'calves')).toEqual(['Mollets machine', 'Mollets machine']);
    expect(await resultNames(page, 'fessiers')).toEqual(['Abducteurs machine']);
    expect(await resultNames(page, 'adductors')).toEqual(['Adducteurs machine']);
    expect(await resultNames(page, 'abduction')).toEqual(['Abducteurs machine']);
    expect(await resultNames(page, 'hip adduction')).toEqual(['Adducteurs machine']);
    expect((await resultNames(page, 'barbell curl'))[0]).toBe('Curl biceps barre droite');
    expect((await resultNames(page, 'legs')).sort()).toEqual(
      ['Abducteurs machine', 'Adducteurs machine', 'Curl ischios', 'Hack squat', 'Leg curl', 'Leg extension', 'Mollets machine', 'Mollets machine', 'Presse à cuisses', 'Squat kettlebell'].sort((a, b) => a.localeCompare(b, 'fr')),
    );

    // Fiches : dessin embarqué, distinct pour les abducteurs et les adducteurs.
    const sources: string[] = [];
    for (const id of ['abducteurs-machine', 'adducteurs-machine']) {
      await page.goto(`./#/exercice/${id}`);
      const img = page.locator('figure.illustration img');
      await expect(img).toBeVisible();
      expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      sources.push((await img.getAttribute('src'))!);
    }
    expect(sources[0]).not.toBe(sources[1]);

    // Séance : les trois machines comptent une fois dans « Jambes ».
    await startSession(page);
    for (const [query, name] of [['mollets', 'Mollets machine — Debout'], ['abducteurs', 'Abducteurs machine'], ['adducteurs', 'Adducteurs machine']] as const) {
      const card = await addExercise(page, query, name, '40');
      await doExercise(card, 3, 'Bien');
    }
    await finishSession(page);
    await page.getByRole('button', { name: 'Garder ce nom' }).click();
    const [session] = await readSessions(page);
    expect(session!.performances.map((p) => p.variantId)).toEqual(['mollets-machine', 'abducteurs-machine', 'adducteurs-machine']);
    const recap = page.getByTestId('weekly-recap');
    await expect(recap.locator('[data-group="jambes"]')).toHaveText('Jambes (1×) · aujourd’hui');
    await expect(recap.locator('[data-group="mollets"], [data-group="fessiers"], [data-group="adducteurs"]')).toHaveCount(0);
    // La bibliothèque enregistrée contient bien les quatre exercices.
    const stored = (await readExercises(page)).map((e) => e.id);
    expect(stored).toEqual(expect.arrayContaining(['curl-biceps-barre-droite', 'mollets-machine', 'abducteurs-machine', 'adducteurs-machine']));
  });
});
