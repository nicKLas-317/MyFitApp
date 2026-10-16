import { expect, test, type Page } from '@playwright/test';
import depart from '../docs/exemples/depart-exemple.json' with { type: 'json' };
import { FRAME_SELECTOR } from '../src/ui/frames';
import { addExercise } from './helpers';

/** Palette des cadres (--frame-1 à --frame-5), telle que le navigateur la calcule. */
const PALETTE = ['rgb(255, 228, 74)', 'rgb(62, 230, 238)', 'rgb(140, 200, 255)', 'rgb(199, 155, 255)', 'rgb(255, 122, 214)'];
const CYAN = PALETTE[1];
const YELLOW = PALETTE[0];

/** Importe les données de départ anonymisées, comme un fichier choisi sur le téléphone. */
async function importDepart(page: Page): Promise<void> {
  await page.goto('./#/donnees');
  await page.getByLabel('Fichier à importer').evaluate((input: HTMLInputElement, content) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([content], 'myfitapp-sauvegarde.json', { type: 'application/json' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, JSON.stringify(depart));
  await page.getByRole('button', { name: 'Ajouter à mes données' }).click();
  await expect(page.getByText('Import terminé : 2 séances ajoutées.')).toBeVisible();
}

type FrameInfo = { label: string; frame: string | null; widths: string[]; styles: string[]; colors: string[]; radii: string[]; bilan: boolean };

/** Relève, dans l'ordre d'affichage, la bordure calculée de chaque cadre de l'écran. */
function readFrames(page: Page): Promise<FrameInfo[]> {
  return page.evaluate((selector) => {
    const sides = ['top', 'right', 'bottom', 'left'];
    const corners = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
    return [...document.querySelectorAll<HTMLElement>(selector)].map((el) => {
      const c = getComputedStyle(el);
      return {
        label: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`,
        frame: el.getAttribute('data-frame'),
        widths: sides.map((s) => c.getPropertyValue(`border-${s}-width`)),
        styles: sides.map((s) => c.getPropertyValue(`border-${s}-style`)),
        colors: sides.map((s) => c.getPropertyValue(`border-${s}-color`)),
        radii: corners.map((s) => c.getPropertyValue(`border-${s}-radius`)),
        bilan: el.classList.contains('bilan-section'),
      };
    });
  }, FRAME_SELECTOR);
}

/** Vérifie la règle commune des cadres (§3.1) sur l'écran affiché. */
async function checkFrames(page: Page, screen: string, minimum = 1): Promise<void> {
  await expect(page.locator('[data-frame]').first()).toBeAttached();
  const frames = await readFrames(page);
  expect(frames.length, `${screen} : nombre de cadres`).toBeGreaterThanOrEqual(minimum);
  for (const f of frames) {
    const where = `${screen} · ${f.label}`;
    expect(f.frame, where).not.toBeNull();
    expect(f.widths, where).toEqual(['2px', '2px', '2px', '2px']);
    expect(f.styles, where).toEqual(['solid', 'solid', 'solid', 'solid']);
    expect(new Set(f.colors).size, `${where} : même couleur sur les quatre côtés`).toBe(1);
    expect(PALETTE, `${where} : couleur de la palette`).toContain(f.colors[0]);
    expect(f.radii, where).toEqual(['14px', '14px', '14px', '14px']);
  }
  // Deux cadres consécutifs n'ont jamais la même couleur, sauf les catégories du bilan (couleur fixe).
  frames.slice(1).forEach((f, i) => {
    const prev = frames[i]!;
    if (f.bilan || prev.bilan) return;
    expect(f.colors[0], `${screen} : ${prev.label} puis ${f.label}`).not.toBe(prev.colors[0]);
  });
  // Ni les pastilles de statut ni les cases du récapitulatif ne sont des cadres.
  await expect(page.locator('[data-status][data-frame], .recap-cell[data-frame]')).toHaveCount(0);
  // Rien ne dépasse de l'écran du smartphone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${screen} : débordement`).toBeLessThanOrEqual(0);
}

test.describe('Filtres du bilan et cadres de section', () => {
  test('145. Bilan : boutons de filtre par catégorie, « Tous », catégorie vide non sélectionnable, filtre mémorisé', async ({ page }) => {
    await importDepart(page);
    await page.goto('./#/bilan');
    const filters = page.getByRole('group', { name: 'Filtrer par catégorie' });
    const all = filters.getByRole('button', { name: /^Tous/ });
    const progressing = filters.getByRole('button', { name: /^En progression/ });
    const early = filters.getByRole('button', { name: /^Trop tôt pour conclure/ });
    await expect(filters.getByRole('button')).toHaveText(['Tous11', '↗En progression1', '→Stables0', '↘En difficulté0', '…Trop tôt pour conclure10']);
    const progressingRegion = page.getByRole('region', { name: 'En progression' });
    const earlyRegion = page.getByRole('region', { name: 'Trop tôt pour conclure' });

    // Par défaut, tout est affiché ; une catégorie sans exercice reste visible mais n'est pas sélectionnable.
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    await expect(progressingRegion).toBeVisible();
    await expect(earlyRegion).toBeVisible();
    for (const name of [/^Stables/, /^En difficulté/]) {
      await expect(filters.getByRole('button', { name })).toBeVisible();
      await expect(filters.getByRole('button', { name })).toBeDisabled();
    }
    await filters.getByRole('button', { name: /^Stables/ }).click({ force: true });
    await expect(all).toHaveAttribute('aria-pressed', 'true');

    // Vrais boutons rectangulaires arrondis, au style des boutons de l'accueil, bordés de la couleur de la catégorie.
    const look = (b: typeof all) =>
      b.evaluate((el) => {
        const c = getComputedStyle(el);
        return { radius: c.borderTopLeftRadius, border: c.borderTopColor, background: c.backgroundColor, height: el.getBoundingClientRect().height };
      });
    const idle = await look(progressing);
    expect(idle.radius).toBe('14px');
    expect(idle.border).toBe(CYAN);
    expect(idle.background).not.toBe(CYAN);
    expect(idle.height).toBeGreaterThanOrEqual(48);
    expect((await look(early)).border).toBe(YELLOW);
    // Chaque catégorie garde sa couleur fixe, reprise sur sa section.
    expect(await progressingRegion.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(CYAN);
    expect(await earlyRegion.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(YELLOW);

    // Un appui n'affiche que la catégorie choisie ; le bouton actif a un fond plein de sa couleur.
    await progressing.click();
    await expect(progressing).toHaveAttribute('aria-pressed', 'true');
    await expect(all).toHaveAttribute('aria-pressed', 'false');
    expect((await look(progressing)).background).toBe(CYAN);
    await expect(progressingRegion).toBeVisible();
    await expect(earlyRegion).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Dernières évolutions' })).toHaveCount(0);

    // Un nouvel appui sur le bouton actif réaffiche tout.
    await progressing.click();
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    await expect(progressing).toHaveAttribute('aria-pressed', 'false');
    await expect(earlyRegion).toBeVisible();

    // « Tous » réaffiche tout.
    await early.click();
    await expect(progressingRegion).toHaveCount(0);
    expect((await look(early)).background).toBe(YELLOW);
    await all.click();
    await expect(progressingRegion).toBeVisible();
    await expect(earlyRegion).toBeVisible();

    // Le dernier filtre est mémorisé, même après rechargement.
    await early.click();
    await page.reload();
    await expect(early).toHaveAttribute('aria-pressed', 'true');
    await expect(earlyRegion).toBeVisible();
    await expect(progressingRegion).toHaveCount(0);
    await page.goto('./');
    await page.getByRole('link', { name: 'Bilan de progression' }).click();
    await expect(early).toHaveAttribute('aria-pressed', 'true');
  });

  test('146. Cadres : même règle sur chaque écran, quatre côtés, couleurs vives alternées, rien ne dépasse', async ({ page }) => {
    await importDepart(page);
    await checkFrames(page, 'Import / export', 3);

    await page.goto('./');
    await checkFrames(page, 'Accueil');
    await expect(page.getByTestId('weekly-recap')).toHaveAttribute('data-frame', /\d/);

    await page.goto('./#/bibliotheque');
    await checkFrames(page, 'Bibliothèque', 5);

    await page.goto('./#/exercice/extension-triceps-haltere-assis');
    await expect(page.getByTestId('chart-weight')).toBeVisible();
    await checkFrames(page, 'Fiche', 3);

    await page.goto('./#/historique');
    await checkFrames(page, 'Historique', 2);
    await page.locator('a.session-link').first().click();
    await expect(page.locator('.card').first()).toBeVisible();
    await checkFrames(page, 'Détail de séance', 2);

    await page.goto('./#/bilan');
    await checkFrames(page, 'Bilan', 2);

    await page.goto('./#/poids');
    await checkFrames(page, 'Mon poids');

    await page.goto('./#/reglages');
    await checkFrames(page, 'Réglages', 3);

    // Séance : la carte d'exercice tient dans l'écran, cadres compris.
    await page.goto('./');
    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    await addExercise(page, 'chest press', 'Chest press');
    await addExercise(page, 'pec deck', 'Pec deck', '30');
    await checkFrames(page, 'Séance', 2);
    // Écrans étroits : la ligne de série reste dans sa carte (à 320 px, « Valider » passe à la ligne).
    for (const width of [360, 320]) {
      await page.setViewportSize({ width, height: 800 });
      const overflow = await page.locator('article[aria-label="Pec deck"]').evaluate((card) => {
        const right = card.getBoundingClientRect().right;
        return Math.max(...[...card.querySelectorAll('.set, .set *')].map((e) => e.getBoundingClientRect().right - right));
      });
      expect(overflow, `séance à ${width} px`).toBeLessThanOrEqual(0);
      await checkFrames(page, `Séance à ${width} px`, 2);
    }
  });
});
