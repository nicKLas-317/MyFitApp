import { expect, test, type Page } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { writeSessions } from './helpers';

async function noOverflow(page: Page): Promise<void> {
  for (const width of [412, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 412, height: 915 });
}

/** Séance du `d` octobre ; chaque exercice : [variante, charge, répétitions, séries prévues]. */
function session(d: number, perfs: [string, number, number[], number?][], home = false): Session {
  const t = new Date(2026, 9, d, home ? 8 : 18).getTime();
  return {
    id: `s${d}${home ? 'm' : ''}`, name: `Séance du ${d} octobre 2026 — 18 h 00`, date: `2026-10-${String(d).padStart(2, '0')}`, startedAt: t, endedAt: t + 3_600_000,
    createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: perfs.map(([variantId, weightKg, reps, plannedSets = 3]) => ({ variantId, weightKg, reps, targetReps: Math.max(...reps), plannedSets, feeling: 'bien' })),
    ...(home ? { location: 'maison' as const } : {}),
  };
}

const indexSection = (page: Page) => page.getByRole('region', { name: 'Indice de progression' });
const setsSection = (page: Page) => page.getByRole('region', { name: 'Séries par semaine' });
/** Étiquettes de l'axe vertical et ordonnées des points du graphique de l'indice. */
const axis = (page: Page) => indexSection(page).getByTestId('chart-index').locator('text[x="42"]').allTextContents();
const dots = (page: Page) => indexSection(page).getByTestId('chart-index').locator('circle').evaluateAll((cs) => cs.map((c) => Number(c.getAttribute('cy'))));

test.describe('Bilan par groupe musculaire, version 1.33.0', () => {
  test('281. Axe de l’indice de 95 à 105 (élargi au-delà), texte du lecteur d’écran, séance incomplète hors de l’indice, onglet Abdominaux avec les seules séries', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-30T20:00:00'));
    await page.goto('./');
    const days = [12, 15, 16, 19, 25, 29];
    await writeSessions(page, [
      // Dos : stable, puis 51,9 kg le 29 (indice 99,81).
      // Pectoraux : 50 → 60 kg (indice 120), au-delà de 105.
      // Triceps : extension haltère assis complète, et une extension poulie barre incomplète (2 séries sur 3) le 29.
      ...days.map((d, i) =>
        session(d, [
          ['tirage-horizontal', i === 5 ? 51.9 : 52, [8, 8, 8]],
          ['chest-press', 50 + 2 * i, [8, 8, 8]],
          ['extension-triceps-haltere-assis', 12, [8, 8, 8]],
          ...(i === 5 ? ([['extension-triceps-poulie--barre', 18, [8, 8]]] as [string, number, number[]][]) : []),
        ]),
      ),
      // Abdominaux à la maison, trois semaines : planche 1 série sur 2, crunch au sol.
      session(14, [['crunch-sol', 0, [15, 15]]], true),
      session(21, [['planche', 0, [40], 2]], true),
      session(27, [['planche', 0, [40, 40], 2], ['crunch-sol', 0, [15]]], true),
    ]);
    await page.reload();
    await page.goto('./#/bilan-groupes/dos');

    // Dos : la légère baisse ne remplit plus le graphique ; axe 95 à 105, étiqueté.
    await expect(indexSection(page).getByTestId('index-last')).toHaveText('Dos : 99,8');
    await expect.poll(() => axis(page)).toEqual(['100', '95', '105']);
    const cy = await dots(page);
    expect(Math.max(...cy) - Math.min(...cy)).toBeLessThan(4);
    // Texte du lecteur d'écran : ni espace en trop (unité vide), ni point après la date abrégée.
    await expect(indexSection(page).getByTestId('chart-index')).toHaveAttribute('aria-label', 'Indice de progression dos : 6 points, de 100 le 12 oct. à 99,8 le 29 oct.');
    await noOverflow(page);

    // Pectoraux : 120 dépasse 105, l'axe s'élargit vers le haut ; 95 reste la borne basse.
    await page.getByRole('group', { name: 'Groupe musculaire' }).getByRole('button', { name: 'Pectoraux' }).click();
    await expect(indexSection(page).getByTestId('index-last')).toHaveText('Pectoraux : 120');
    await expect.poll(() => axis(page)).toEqual(['120', '100', '95']);

    // Triceps : la séance incomplète n'entre pas dans l'indice ; ses 2 séries comptent dans la semaine du 26 oct.
    await page.getByRole('group', { name: 'Groupe musculaire' }).getByRole('button', { name: 'Triceps' }).click();
    await expect(indexSection(page).getByTestId('index-exercises')).toHaveText('Extension triceps haltère assis');
    await expect(indexSection(page).getByTestId('chart-index')).toHaveAttribute('data-values', '100.00 100.00 100.00 100.00 100.00 100.00');
    await expect(setsSection(page).getByTestId('chart-sets')).toHaveAttribute('aria-label', /semaine du 26 oct\. 6,5$/);

    // Abdominaux : séries seulement, avec le message ; la planche faite 1 fois sur 2 compte pour 1 série.
    await page.getByRole('group', { name: 'Groupe musculaire' }).getByRole('button', { name: 'Abdominaux' }).click();
    await expect(page).toHaveURL(/#\/bilan-groupes\/abdominaux$/);
    await expect(page.getByTestId('index-none')).toHaveText(
      'Pas d’indice de progression pour les abdominaux : il se calcule sur la charge, et ces exercices se font sans charge (poids du corps, durée).',
    );
    await expect(indexSection(page)).toHaveCount(0);
    await expect(setsSection(page).getByTestId('chart-sets')).toHaveAttribute('aria-label', /semaine du 12 oct\. 2, semaine du 19 oct\. 1, semaine du 26 oct\. 3$/);
    await noOverflow(page);

    // Fiche d'un exercice : même texte, avec l'unité.
    await page.goto('./#/exercice/tirage-horizontal');
    await expect(page.getByTestId('chart-weight')).toHaveAttribute('aria-label', 'Évolution de la charge : 6 points, de 52 kg le 12 oct. à 51,9 kg le 29 oct.');
  });
});
