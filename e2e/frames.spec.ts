import { expect, test, type Page } from '@playwright/test';
import depart from '../docs/exemples/depart-exemple.json' with { type: 'json' };
import { FRAME_SELECTOR } from '../src/ui/frames';
import { addExercise } from './helpers';

/** Palette des cadres (--frame-1 à --frame-5), telle que le navigateur la calcule. */
const PALETTE = ['rgb(255, 228, 74)', 'rgb(62, 230, 238)', 'rgb(140, 200, 255)', 'rgb(199, 155, 255)', 'rgb(255, 122, 214)'];
/** Couleur fixe de chaque groupe musculaire (§3.2), telle que le navigateur la calcule. */
const GROUP_RGB: Record<string, string> = {
  epaules: PALETTE[0]!,
  pectoraux: PALETTE[1]!,
  triceps: PALETTE[2]!,
  dos: PALETTE[3]!,
  biceps: PALETTE[4]!,
  jambes: 'rgb(244, 245, 247)',
  abdominaux: 'rgb(180, 188, 200)',
};
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

type FrameInfo = { label: string; frame: string | null; widths: string[]; styles: string[]; colors: string[]; radii: string[]; bilan: boolean; group: string | null };

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
        group: el.getAttribute('data-group-color'),
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
    // Cadre d'un exercice : couleur fixe de son groupe (§3.2) ; sinon, couleur alternée de la palette.
    if (f.group) expect(f.colors[0], `${where} : couleur du groupe ${f.group}`).toBe(GROUP_RGB[f.group]);
    else expect(PALETTE, `${where} : couleur de la palette`).toContain(f.colors[0]);
    expect(f.radii, where).toEqual(['14px', '14px', '14px', '14px']);
  }
  // Deux cadres consécutifs n'ont jamais la même couleur, sauf les couleurs fixes (catégories du bilan, groupes).
  frames.slice(1).forEach((f, i) => {
    const prev = frames[i]!;
    if (f.bilan || prev.bilan || f.group || prev.group) return;
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

  test('146. Cadres : même règle sur chaque écran, quatre côtés, couleurs vives alternées (fixes pour les exercices), rien ne dépasse', async ({ page }) => {
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

  test('162. Couleur fixe du groupe : exercices de la bibliothèque, pictogrammes, carte de séance et de fiche ; les autres cadres alternent', async ({ page }) => {
    await importDepart(page);
    const look = (selector: string) =>
      page.locator(selector).evaluateAll((els) =>
        els.map((el) => {
          const picto = el.querySelector('.picto:not(.picto-image)');
          return {
            group: el.getAttribute('data-group-color'),
            border: getComputedStyle(el).borderTopColor,
            picto: picto ? getComputedStyle(picto).backgroundColor : null,
            text: el.querySelector('strong')?.textContent ?? '',
          };
        }),
      );
    // Bibliothèque : chaque exercice d'une section de groupe a la couleur de son groupe, sections comprises.
    await page.goto('./#/bibliotheque');
    await expect(page.locator('.pick-item').first()).toBeVisible();
    const items = await look('.pick-item');
    expect(items.length).toBeGreaterThan(40);
    for (const it of items) {
      expect(it.group, it.text).not.toBeNull();
      expect(it.border, it.text).toBe(GROUP_RGB[it.group!]);
      if (it.picto) expect(it.picto, `${it.text} : fond du pictogramme`).toBe(GROUP_RGB[it.group!]);
    }
    const section = async (title: string) => {
      const list = page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).locator('.pick-item');
      return [...new Set(await list.evaluateAll((els) => els.map((el) => getComputedStyle(el).borderTopColor)))];
    };
    expect(await section('Épaules')).toEqual([GROUP_RGB.epaules]);
    expect(await section('Triceps')).toEqual([GROUP_RGB.triceps]);
    expect(await section('Dos')).toEqual([GROUP_RGB.dos]);
    expect(await section('Pectoraux')).toEqual([GROUP_RGB.pectoraux]);
    expect(await section('Biceps')).toEqual([GROUP_RGB.biceps]);
    expect(await section('Jambes')).toEqual([GROUP_RGB.jambes]);
    expect(await section('Abdominaux')).toEqual([GROUP_RGB.abdominaux]);
    // Pictogrammes : fond de la couleur du groupe (crunch : gris clair ; squat kettlebell : blanc).
    await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill('crunch');
    expect((await look('.pick-item'))[0]!.picto).toBe(GROUP_RGB.abdominaux);
    await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill('squat kettlebell');
    expect((await look('.pick-item'))[0]!.picto).toBe(GROUP_RGB.jambes);

    // Fiche : la carte de l'exercice a la couleur du groupe ; les autres cadres alternent.
    await page.goto('./#/exercice/extension-triceps-haltere-assis');
    await expect(page.getByTestId('chart-weight')).toBeVisible();
    expect(await page.locator('.sheet-status').evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(GROUP_RGB.triceps);
    const others = await page.locator('[data-frame]:not([data-group-color])').evaluateAll((els) => els.map((el) => getComputedStyle(el).borderTopColor));
    expect(new Set(others).size).toBeGreaterThan(2);

    // Séance : la carte de chaque exercice a la couleur de son groupe principal.
    await page.goto('./');
    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    await addExercise(page, 'chest press', 'Chest press');
    await addExercise(page, 'tirage vertical', 'Tirage vertical — Prise moyenne');
    await addExercise(page, 'curl marteau', 'Curl marteau', '12');
    await addExercise(page, 'leg extension', 'Leg extension', '40');
    const cards = await look('article.exercise-card');
    expect(cards.map((c) => [c.group, c.border])).toEqual([
      ['pectoraux', GROUP_RGB.pectoraux],
      ['dos', GROUP_RGB.dos],
      ['biceps', GROUP_RGB.biceps],
      ['jambes', GROUP_RGB.jambes],
    ]);

    // Accueil : rien ne change ; pastilles de statut et cases du récapitulatif sans couleur de groupe.
    await page.goto('./');
    await expect(page.locator('[data-group-color]')).toHaveCount(0);
    await page.goto('./#/bibliotheque');
    await expect(page.locator('[data-status][data-group-color], .recap-cell[data-group-color]')).toHaveCount(0);
  });
});
