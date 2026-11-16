import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { readExercises, readSessions, reloadAfterWrites, waitForWrites, writeSessions } from './helpers';

const NOW = new Date('2026-11-16T10:00:00');

function session(id: string, date: string, perfs: [string, number][], home = false): Session {
  const start = new Date(`${date}T${home ? '08' : '18'}:00:00`).getTime();
  return {
    id, name: `Séance ${id}`, date, startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start, origin: 'app', state: 'done',
    ...(home ? { location: 'maison' as const } : {}),
    performances: perfs.map(([variantId, sets]) => ({
      variantId, weightKg: variantId === 'crunch-sol' ? 0 : 20, targetReps: variantId === 'crunch-sol' ? 10 : 8, plannedSets: 3,
      reps: Array.from({ length: sets }, () => (variantId === 'crunch-sol' ? 10 : 8)), feeling: 'bien',
    })),
  };
}

async function seed(page: Page, sessions: Session[]): Promise<void> {
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
  await writeSessions(page, sessions);
  await reloadAfterWrites(page);
}

/** Parts de la liste d'ajout, dans l'ordre : intertitre et exercices-variantes (puces de prises comprises). */
function tiers(page: Page): Promise<{ title: string; ids: string[] }[]> {
  return page.locator('.pick-tier-section').evaluateAll((sections) =>
    sections.map((s) => ({
      title: s.querySelector('.pick-tier')?.textContent ?? '',
      ids: [...s.querySelectorAll('li.pick-item[data-variant], button.grip-chip[data-variant]')].map((e) => e.getAttribute('data-variant')!),
    })),
  );
}

async function expectEachOnce(page: Page): Promise<void> {
  const all = (await tiers(page)).flatMap((t) => t.ids);
  expect(new Set(all).size, 'chaque exercice-variante une seule fois').toBe(all.length);
}

const SALLE = [
  session('s1', '2026-11-09', [['chest-press', 3], ['tirage-vertical', 3]]),
  session('s2', '2026-11-12', [['leg-extension', 3]]),
  session('m1', '2026-11-13', [['curl-biceps-halteres', 3], ['crunch-sol', 3]], true),
];

test.describe('Ordre de la liste d’ajout d’un exercice (version 1.49.0)', () => {
  test('315. Favoris, récents du lieu, puis tous les exercices ; recherche et filtre dans le même ordre ; bibliothèque inchangée', async ({ page }) => {
    await seed(page, SALLE);
    // Favori : le pec deck, depuis sa fiche.
    await page.goto('./#/exercice/pec-deck');
    await page.getByRole('button', { name: 'Favori' }).click();
    await expect(page.getByRole('button', { name: 'Favori' })).toHaveAttribute('aria-pressed', 'true');
    await waitForWrites(page);

    // Séance à la salle.
    await page.goto('./');
    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    await page.getByRole('link', { name: 'Ajouter un exercice' }).click();
    await expect(page.locator('.pick-tier')).toHaveText(['Favoris', 'Récents', 'Tous les exercices']);
    let t = await tiers(page);
    expect(t[0]!.ids).toEqual(['pec-deck']);
    // Du plus récent au plus ancien, à la salle seulement (le curl et le crunch, faits à la maison, n'y sont pas).
    expect(t[1]!.ids).toEqual(['leg-extension', 'chest-press', 'tirage-vertical']);
    expect(t[2]!.ids).toEqual(expect.arrayContaining(['curl-biceps-halteres', 'crunch-sol', 'tirage-vertical--prise-serree']));
    expect(t[2]!.ids).not.toContain('pec-deck');
    await expectEachOnce(page);
    // Intertitres discrets : 13 px, gris, pas des titres de section.
    const title = page.locator('.pick-tier').first();
    expect(await title.evaluate((e) => getComputedStyle(e).fontSize)).toBe('13px');
    await expect(page.locator('.section-title')).toHaveCount(0);

    // Filtre « Jambes » : les trois parts limitées au groupe.
    await page.getByRole('group', { name: 'Filtrer par groupe musculaire' }).getByRole('button', { name: 'Jambes' }).click();
    await expect(page.locator('.pick-tier')).toHaveText(['Récents', 'Tous les exercices']);
    t = await tiers(page);
    expect(t[0]!.ids).toEqual(['leg-extension']);
    expect(t[1]!.ids).toContain('presse-a-cuisses');
    expect(t[1]!.ids).not.toContain('chest-press');
    await page.getByRole('group', { name: 'Filtrer par groupe musculaire' }).getByRole('button', { name: 'Tous' }).click();

    // Recherche « pectoraux » : favori, récent, puis les autres résultats par pertinence.
    await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill('pectoraux');
    await expect(page.locator('.pick-tier')).toHaveText(['Favoris', 'Récents', 'Tous les exercices']);
    t = await tiers(page);
    expect(t[0]!.ids).toEqual(['pec-deck']);
    expect(t[1]!.ids).toEqual(['chest-press']);
    expect(t[2]!.ids).toContain('developpe-couche');
    await expectEachOnce(page);
    // Un appui ajoute toujours l'exercice.
    await page.getByRole('button', { name: /^Chest press/ }).click();
    await expect(page.locator('article[aria-label="Chest press"]')).toBeVisible();

    // Séance à la maison : « Récents » d'après les séances à la maison seulement.
    await page.getByRole('button', { name: 'Actions : Séance' }).click();
    await page.getByRole('menuitem', { name: 'Passer à la maison' }).click();
    await expect(page.getByText('À la maison')).toBeVisible();
    await page.getByRole('link', { name: 'Ajouter un exercice' }).click();
    await expect(page.locator('.pick-tier')).toHaveText(['Favoris', 'Récents', 'Tous les exercices']);
    t = await tiers(page);
    expect(t[1]!.ids).toEqual(['curl-biceps-halteres', 'crunch-sol']);
    expect(t[2]!.ids).toContain('leg-extension');
    await expectEachOnce(page);

    // Préparation de la séance prévue : toujours à la salle.
    await page.goto('./#/seance-prevue/ajouter');
    await expect(page.locator('.pick-tier')).toHaveText(['Favoris', 'Récents', 'Tous les exercices']);
    t = await tiers(page);
    expect(t[1]!.ids).toEqual(['leg-extension', 'chest-press', 'tirage-vertical']);

    // Bibliothèque (onglet Plus) : inchangée (« Récents », « Favoris », puis les groupes, en titres de section).
    await page.goto('./#/bibliotheque');
    await expect(page.locator('.pick-tier')).toHaveCount(0);
    await expect(page.locator('.section-title').first()).toHaveText('Récents');
    await expect(page.locator('.section-title').nth(1)).toHaveText('Favoris');
    await expect(page.locator('.section-title').nth(2)).toHaveText('Dos');
  });
});

const crunch = (id: string, date: string, sets: number) => session(id, date, [['crunch-sol', sets]]);

function hint(scope: Page | Locator): Locator {
  return scope.getByTestId('sets-hint');
}

test.describe('Proposition d’ajuster le nombre de séries (version 1.49.0)', () => {
  test('316. Fiche et carte en séance : « Tu fais souvent 2 séries : passer à 2 ? » ; « Non » jusqu’à 3 nouvelles séances ; « Oui » change le nombre de séries standard seulement', async ({ page }) => {
    // Crunch au sol : 1 série, puis 2 et 2 (sur 3) : rien encore.
    await seed(page, [crunch('c1', '2026-10-27', 1), crunch('c2', '2026-11-04', 2), crunch('c3', '2026-11-10', 2)]);
    await page.goto('./#/exercice/crunch-sol');
    await expect(page.getByTestId('sheet-next')).toBeVisible();
    await expect(hint(page)).toHaveCount(0);

    // Une 3ᵉ séance de suite à 2 séries : la proposition, sous la prochaine cible.
    await writeSessions(page, [crunch('c4', '2026-11-12', 2)]);
    await reloadAfterWrites(page);
    const target = await page.getByTestId('sheet-next').textContent();
    await expect(hint(page)).toHaveText(/Tu fais souvent 2 séries : passer à 2 \?/);
    await expect(page.locator('.sheet-status').first().getByTestId('sets-hint')).toBeVisible();
    for (const name of ['Oui', 'Non']) {
      const box = (await hint(page).getByRole('button', { name }).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(48);
    }
    const [oui, non] = [(await hint(page).getByRole('button', { name: 'Oui' }).boundingBox())!, (await hint(page).getByRole('button', { name: 'Non' }).boundingBox())!];
    expect(non.x - (oui.x + oui.width)).toBeGreaterThanOrEqual(8);

    // « Non » : masquée, même après relance, et après 2 nouvelles séances à 2.
    await hint(page).getByRole('button', { name: 'Non' }).click();
    await expect(hint(page)).toHaveCount(0);
    await writeSessions(page, [crunch('c5', '2026-11-13', 2), crunch('c6', '2026-11-14', 2)]);
    await reloadAfterWrites(page);
    await expect(page.getByTestId('sheet-next')).toBeVisible();
    await expect(hint(page)).toHaveCount(0);
    // La 3ᵉ après le refus : de retour.
    await writeSessions(page, [crunch('c7', '2026-11-15', 2)]);
    await reloadAfterWrites(page);
    await expect(hint(page)).toBeVisible();
    const before = await readSessions(page);

    // Carte en séance : la même proposition tant qu'aucune série n'est faite ; « Oui ».
    await page.goto('./');
    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    await page.getByRole('link', { name: 'Ajouter un exercice' }).click();
    await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill('crunch');
    await page.getByRole('button', { name: /^Crunch au sol/ }).click();
    const card = page.locator('article[aria-label="Crunch au sol"]');
    await expect(card.getByRole('button', { name: 'Valider les 3 séries' })).toBeVisible();
    await expect(hint(card)).toHaveText(/Tu fais souvent 2 séries : passer à 2 \?/);
    await hint(card).getByRole('button', { name: 'Oui' }).click();
    await expect(hint(card)).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Valider les 2 séries' })).toBeVisible();
    await expect(card.locator('.sets-count')).toHaveText('0/2');
    await waitForWrites(page);
    // Base : 2 séries standard, plage et type inchangés ; séances passées intactes.
    const variant = (await readExercises(page)).find((e) => e.id === 'crunch-sol')!.variants.find((v) => v.id === 'crunch-sol')!;
    expect(variant.config).toEqual({ bodyweight: true, sets: 2 });
    const after = await readSessions(page);
    expect(after.filter((s) => s.state === 'done')).toEqual(before.filter((s) => s.state === 'done'));
    expect(after.find((s) => s.state === 'active')!.performances[0]!.plannedSets).toBe(2);

    // Fiche : plus de proposition, cible inchangée (séances incomplètes, 2 sur 3 prévues).
    await page.goto('./#/exercice/crunch-sol');
    await expect(page.getByTestId('sheet-next')).toHaveText(target!.replace(/^3 ×/, '2 ×'));
    await expect(hint(page)).toHaveCount(0);
  });
});
