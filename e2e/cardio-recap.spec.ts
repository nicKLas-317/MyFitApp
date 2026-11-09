import { expect, test } from '@playwright/test';
import type { CardioBlock, Session } from '../src/domain/types';
import { reloadAfterWrites, writeSessions } from './helpers';

function withCardio(id: string, date: string, hour: number, cardio: Omit<CardioBlock, 'id'>[], home = false): Session {
  const start = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).getTime();
  return {
    id, name: 'Séance', date, startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start, origin: 'app', state: 'done',
    ...(home ? { location: 'maison' as const } : {}),
    performances: [{ variantId: 'pec-deck', weightKg: 30, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' }],
    cardio: cardio.map((b, i) => ({ id: `${id}-c${i}`, ...b })),
  };
}

test.describe('Écran « Cardio » (version 1.43.0)', () => {
  test('305. Onglet Progrès › Cardio : trois périodes, total, une carte neutre par machine (temps, fois, moyenne, distance, inclinaison), machine retirée comprise, rien ailleurs', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-06T20:00:00'));
    await page.goto('./');
    await expect(page.getByTestId('weekly-recap')).toBeVisible();
    await writeSessions(page, [
      // Octobre : une machine retirée des réglages depuis (« Stepper »), du tapis en inclinaison haute.
      withCardio('o1', '2026-10-12', 18, [{ machineId: 'cardio-stepper', machine: 'Stepper', minutes: 40 }, { machineId: 'tapis', machine: 'Tapis de marche', incline: 'haute', minutes: 20 }]),
      // Dimanche 1er novembre : dans le mois, pas dans la semaine.
      withCardio('n1', '2026-11-01', 10, [{ machineId: 'rameur', machine: 'Rameur', minutes: 10, distanceKm: 2 }]),
      // Semaine du 2 au 8 novembre, salle et maison.
      withCardio('n2', '2026-11-03', 18, [
        { machineId: 'tapis', machine: 'Tapis de marche', incline: 'neutre', minutes: 15, distanceKm: 1.2 },
        { machineId: 'rameur', machine: 'Rameur', minutes: 5, distanceKm: 1 },
      ]),
      withCardio('n3', '2026-11-04', 8, [{ machineId: 'tapis', machine: 'Tapis de marche', incline: 'moyenne', minutes: 45 }], true),
      withCardio('n4', '2026-11-05', 18, [{ machineId: 'rameur', machine: 'Rameur', minutes: 6 }]),
    ]);
    await reloadAfterWrites(page);

    // Rien sur l'accueil.
    await expect(page.getByRole('link', { name: 'Cardio', exact: true })).toHaveCount(0);

    // Dernière entrée de l'onglet Progrès, sous « Mon poids ».
    await page.locator('.tab-bar a[href="#/progres"]').click();
    const entries = page.locator('main a.btn');
    await expect(entries.last()).toHaveText('Cardio');
    expect(await page.evaluate(() => {
      const weight = document.querySelector('section[aria-label="Mon poids"]')!;
      const cardio = [...document.querySelectorAll('main a')].find((a) => a.textContent === 'Cardio')!;
      return weight.getBoundingClientRect().bottom <= cardio.getBoundingClientRect().top;
    })).toBe(true);
    await entries.last().click();
    await expect(page).toHaveURL(/#\/cardio$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cardio');
    await expect(page.locator('.tab-bar [aria-current="page"]')).toContainText('Progrès');

    // Trois puces, « Cette semaine » par défaut.
    const chips = page.getByRole('group', { name: 'Période' }).getByRole('button');
    await expect(chips).toHaveText(['Cette semaine', 'Ce mois', 'Depuis le début']);
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'true');

    const total = page.getByTestId('cardio-total');
    const cards = page.getByTestId('cardio-machine');
    await expect(total).toHaveText('Semaine du 2 au 8 nov. 20261 h 11 · 4 fois · 2 machines');
    await expect(cards.locator('h2')).toHaveText(['Tapis de marche', 'Rameur']);
    await expect(cards.nth(0).getByTestId('cardio-time')).toHaveText('1 h 00 · 2 fois · moyenne 30 min');
    await expect(cards.nth(0).getByTestId('cardio-distance')).toHaveText('Distance : 1,2 km · moyenne 1,2 km · sur 1 fois sur 2');
    await expect(cards.nth(0).getByTestId('cardio-inclines')).toHaveText('Inclinaison : neutre 25 % · moyenne 75 % · haute 0 %');
    await expect(cards.nth(1).getByTestId('cardio-time')).toHaveText('11 min · 2 fois · moyenne 6 min');
    await expect(cards.nth(1).getByTestId('cardio-distance')).toHaveText('Distance : 1 km · moyenne 1 km · sur 1 fois sur 2');
    await expect(cards.nth(1).getByTestId('cardio-inclines')).toHaveCount(0);

    // Ce mois : le rameur du dimanche 1er en plus.
    await chips.nth(1).click();
    await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(total).toHaveText('Novembre 20261 h 21 · 5 fois · 2 machines');
    await expect(cards.nth(1).getByTestId('cardio-distance')).toHaveText('Distance : 3 km · moyenne 1,5 km · sur 2 fois sur 3');

    // Depuis le début : la machine retirée des réglages apparaît, triée par temps décroissant.
    await chips.nth(2).click();
    await expect(total).toHaveText('Depuis le 12 oct. 20262 h 21 · 7 fois · 3 machines');
    await expect(cards.locator('h2')).toHaveText(['Tapis de marche', 'Stepper', 'Rameur']);
    await expect(cards.nth(0).getByTestId('cardio-inclines')).toHaveText('Inclinaison : neutre 19 % · moyenne 56 % · haute 25 %');
    await expect(cards.nth(1).getByTestId('cardio-time')).toHaveText('40 min · 1 fois · moyenne 40 min');
    await expect(cards.nth(1).getByTestId('cardio-distance')).toHaveCount(0);

    // Rien ne dépasse de l'écran ni des cartes : les lignes passent à la ligne entre deux éléments, jamais au milieu.
    for (const width of [412, 360, 320]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width} px`).toBe(true);
      const outside = await cards.evaluateAll((els) =>
        els.flatMap((card) => [...card.querySelectorAll('span')].filter((s) => s.getBoundingClientRect().right > card.getBoundingClientRect().right - 16).map((s) => s.textContent)),
      );
      expect(outside, `${width} px`).toEqual([]);
    }
    await expect(cards.nth(0).getByTestId('cardio-distance').locator('.nowrap')).toHaveText(['Distance : 1,2 km ·', 'moyenne 1,2 km ·', 'sur 1 fois sur 3']);

    // Cartes neutres (pas de couleur de groupe), sans graphique.
    const frames = await cards.evaluateAll((els) => els.map((e) => [e.hasAttribute('data-frame'), e.hasAttribute('data-group-color'), getComputedStyle(e).borderTopColor]));
    for (const [framed, grouped, color] of frames) expect([framed, grouped, color]).toEqual([true, false, 'rgb(74, 81, 99)']);
    await expect(page.locator('main svg, main canvas')).toHaveCount(0);

    // Période gardée en revenant, « retour » vers Progrès.
    await page.locator('a.back').click();
    await expect(page).toHaveURL(/#\/progres$/);
    await page.locator('main a.btn').last().click();
    await expect(chips.nth(2)).toHaveAttribute('aria-pressed', 'true');
    await page.goBack();
    await expect(page).toHaveURL(/#\/progres$/);

    // Semaine sans cardio : message, pas de total.
    await page.clock.setFixedTime(new Date('2026-11-10T20:00:00'));
    await page.goto('./#/plus');
    await reloadAfterWrites(page);
    await page.goto('./#/cardio');
    await page.getByRole('group', { name: 'Période' }).getByRole('button', { name: 'Cette semaine' }).click();
    await expect(page.getByTestId('cardio-empty')).toHaveText('Aucun cardio cette semaine.');
    await expect(page.getByTestId('cardio-total')).toHaveCount(0);
  });
});
