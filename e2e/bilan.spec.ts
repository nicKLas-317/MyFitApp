import { expect, test, type Page } from '@playwright/test';
import depart from '../docs/exemples/depart-exemple.json' with { type: 'json' };
import { readSessions } from './helpers';

const DEPART = JSON.stringify(depart);

/** Choisit un fichier comme le ferait le sélecteur d'Android : nom et type annoncé au choix, contenu texte ou octets. */
async function chooseFile(page: Page, name: string, type: string, content: string | number[]): Promise<void> {
  await page.getByLabel('Fichier à importer').evaluate(
    (input: HTMLInputElement, file) => {
      const data = typeof file.content === 'string' ? file.content : new Uint8Array(file.content);
      const transfer = new DataTransfer();
      transfer.items.add(new File([data], file.name, { type: file.type }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { name, type, content },
  );
}

test.describe('Bilan, graphiques et import de fichier sur Android', () => {
  test('142. Fichier .json sans type reconnu importé ; bilan lisible depuis l’accueil ; un exercice ouvre son graphique', async ({ page }) => {
    await page.goto('./#/donnees');
    const input = page.getByLabel('Fichier à importer');
    // Aucun filtre de type : Android n'annonce pas toujours un .json comme application/json.
    await expect(input).toHaveAttribute('accept', '*/*');
    // Un fichier qui n'est pas une sauvegarde : message clair, rien n'est importé.
    await chooseFile(page, 'photo.jpg', 'image/jpeg', [0xff, 0xd8, 0, 0, 0, 1, 2, 3, 0, 0, 0xff, 0xd9]);
    await expect(page.getByRole('alert')).toContainText('n’est pas une sauvegarde MyFitApp');
    await chooseFile(page, 'myfitapp-sauvegarde.json', 'application/json', DEPART.slice(0, 200));
    await expect(page.getByRole('alert')).toContainText('illisible ou incomplet');
    expect(await readSessions(page)).toEqual([]);

    await chooseFile(page, 'myfitapp-sauvegarde.json', 'application/octet-stream', DEPART);
    await expect(page.getByTestId('plan-new')).toHaveText('2 séances à ajouter');
    await page.getByRole('button', { name: 'Ajouter à mes données' }).click();
    await expect(page.getByText('Import terminé : 2 séances ajoutées.')).toBeVisible();

    // Accueil : accès direct au bilan, sous le récapitulatif.
    await page.goto('./');
    const recapBox = await page.getByTestId('weekly-recap').boundingBox();
    const link = page.getByRole('link', { name: 'Bilan de progression ›' });
    expect((await link.boundingBox())!.y).toBeGreaterThan(recapBox!.y + recapBox!.height - 1);
    await link.click();

    await expect(page.getByRole('heading', { name: 'Bilan de progression' })).toBeVisible();
    await expect(page.getByTestId('count-progressing')).toHaveText('1');
    await expect(page.getByTestId('count-new')).toHaveText('10');
    await expect(page.getByTestId('count-stable')).toHaveText('0');
    await expect(page.getByTestId('count-difficulty')).toHaveText('0');
    const progressing = page.getByRole('region', { name: 'En progression' });
    await expect(progressing.getByRole('heading')).toHaveText('↗En progression1 exercice');
    await expect(progressing).toContainText('Extension triceps haltère assis');
    const early = page.getByRole('region', { name: 'Trop tôt pour conclure' });
    await expect(early.getByRole('heading')).toContainText('10 exercices');
    await expect(early.getByText('Une seule séance sur cet exercice.')).toBeVisible();
    // Aucune couleur de statut dans les catégories.
    await expect(page.locator('.bilan-section [data-status]')).toHaveCount(0);

    // Un exercice ouvre sa fiche, directement sur son graphique d'évolution.
    await progressing.getByRole('link', { name: /Extension triceps haltère assis/ }).click();
    await expect(page).toHaveURL(/#\/exercice\/extension-triceps-haltere-assis\/evolution$/);
    await expect(page.getByTestId('chart-weight')).toHaveAttribute('data-points', '2');
    await expect(page.getByTestId('chart-reps')).toBeInViewport();
    await expect(page.getByTestId('chart-hint')).toHaveCount(0);
    await page.getByRole('link', { name: 'Bilan' }).click();
    await page.getByRole('region', { name: 'Trop tôt pour conclure' }).getByRole('link', { name: /Chest press/ }).click();
    // Une seule séance : un point, et le message.
    await expect(page.getByTestId('chart-weight')).toHaveAttribute('data-points', '1');
    await expect(page.getByTestId('chart-hint')).toHaveText('Le graphique se complètera au fil des séances.');
  });
});
