import { expect, test, type Page } from '@playwright/test';
import { readSessions, openScreen } from './helpers';

const results = (page: Page) => page.getByRole('list', { name: 'Résultats' }).locator('.pick-item strong');
const search = (page: Page, query: string) => page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill(query);

test.describe('Lexique d’équivalences (§4.2.1)', () => {
  test('130. Recherche et import en français, anglais et argot de salle ; mot inconnu ignoré ou à confirmer', async ({ page }) => {
    await page.goto('./');
    await openScreen(page, 'Bibliothèque d’exercices');
    for (const q of ['latéral raise haltère', 'lateral raise dumbbell', 'élévation latérale DB']) {
      await search(page, q);
      await expect(results(page)).toHaveText(['Élévations latérales haltères']);
    }
    await search(page, 'pec fly machine');
    await expect(results(page)).toHaveText(['Pec deck']);
    await search(page, 'élévation latérale haltères xyz');
    await expect(results(page)).toHaveText(['Élévations latérales haltères']);
    await expect(page.getByTestId('ignored-words')).toHaveText('Mot non reconnu, ignoré : xyz');

    // Import : reconnu d'office, ou proposé avec confirmation quand un mot est inconnu.
    await page.goto('./#/donnees');
    await page.getByLabel('Notes de séance ou JSON').fill('latéral raise haltère\n3x8x10kg +\n\nshoulder press xyz\n3x8x30kg +');
    await page.getByRole('button', { name: 'Analyser' }).click();
    const preview = page.getByRole('region', { name: 'Aperçu de l’import' });
    await preview.getByLabel('Date de la séance').fill('2026-10-14');
    const lateral = preview.getByRole('article', { name: 'latéral raise haltère' });
    await expect(lateral.getByLabel('Exercice', { exact: true })).toHaveValue('elevations-laterales');
    const shoulder = preview.getByRole('article', { name: 'shoulder press xyz' });
    await expect(shoulder.getByLabel('Exercice', { exact: true })).toHaveValue('developpe-epaules-machine');
    await expect(shoulder.getByText('À confirmer : Mot non reconnu : « xyz ». Vérifiez l’exercice proposé.')).toBeVisible();
    await preview.getByRole('button', { name: 'Importer la séance (2 exercices)' }).click();
    expect(await readSessions(page)).toEqual([]);
    await shoulder.getByRole('button', { name: 'J’ai vérifié' }).click();
    await preview.getByRole('button', { name: 'Importer la séance (2 exercices)' }).click();
    await expect(page.getByText('Séance importée : 2 exercices.')).toBeVisible();
    expect((await readSessions(page))[0]?.performances.map((p) => p.variantId)).toEqual(['elevations-laterales', 'developpe-epaules-machine']);
  });
});
