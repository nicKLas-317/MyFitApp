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

test.describe('Écran « Cardio » (versions 1.43.0 et 1.44.0)', () => {
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

    // Onglet Progrès : juste sous « Par groupe musculaire », au-dessus de « Mon poids » (version 1.43.1).
    await page.locator('.tab-bar a[href="#/progres"]').click();
    const entries = page.getByRole('navigation', { name: 'Bilans' }).getByRole('link');
    await expect(entries).toHaveText(['Bilan de progression', 'Bilan de la semaine / du mois', 'Par groupe musculaire', 'Cardio']);
    expect(await page.evaluate(() => {
      const weight = document.querySelector('section[aria-label="Mon poids"]')!;
      const cardio = [...document.querySelectorAll('main a')].find((a) => a.textContent === 'Cardio')!;
      return cardio.getBoundingClientRect().bottom <= weight.getBoundingClientRect().top;
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
    // Version 1.44.0 : nom et temps en grand, barre du temps (part du total), une ligne de détails, « 1/2 » discret.
    await expect(cards.getByTestId('cardio-time')).toHaveText(['1 h 00', '11 min']);
    expect(await cards.getByTestId('cardio-bar').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['85 % du temps total', '15 % du temps total']);
    await expect(cards.nth(0).getByTestId('cardio-details')).toHaveText('2 fois · moy. 30 min · 1,2 km · moy. 1,2 km1/2 (distance notée 1 fois sur 2)');
    await expect(cards.nth(0).getByTestId('cardio-part').locator('[aria-hidden="true"]')).toHaveText('1/2');
    await expect(cards.nth(0).getByTestId('cardio-incline')).toHaveAttribute('aria-label', 'Inclinaison : neutre 25 %, moyenne 75 %, haute 0 %');
    await expect(cards.nth(0).locator('.cardio-legend')).toHaveText('neutremoyennehaute');
    // Un niveau à 0 % (haute) n'est pas dessiné : pas de séparateur orphelin (version 1.44.1).
    await expect(cards.nth(0).getByTestId('cardio-incline').locator('span')).toHaveCount(2);
    await expect(cards.nth(1).getByTestId('cardio-details')).toHaveText('2 fois · moy. 6 min · 1 km · moy. 1 km1/2 (distance notée 1 fois sur 2)');
    await expect(cards.nth(1).getByTestId('cardio-incline')).toHaveCount(0);
    await expect(cards.nth(1).locator('.cardio-legend')).toHaveCount(0);

    // Ce mois : le rameur du dimanche 1er en plus.
    await chips.nth(1).click();
    await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(total).toHaveText('Novembre 20261 h 21 · 5 fois · 2 machines');
    await expect(cards.nth(1).getByTestId('cardio-details')).toHaveText('3 fois · moy. 7 min · 3 km · moy. 1,5 km2/3 (distance notée 2 fois sur 3)');

    // Depuis le début : la machine retirée des réglages apparaît, triée par temps décroissant.
    await chips.nth(2).click();
    await expect(total).toHaveText('Depuis le 12 oct. 20262 h 21 · 7 fois · 3 machines');
    await expect(cards.locator('h2')).toHaveText(['Tapis de marche', 'Stepper', 'Rameur']);
    await expect(cards.nth(0).getByTestId('cardio-incline')).toHaveAttribute('aria-label', 'Inclinaison : neutre 19 %, moyenne 56 %, haute 25 %');
    await expect(cards.getByTestId('cardio-time')).toHaveText(['1 h 20', '40 min', '21 min']);
    await expect(cards.nth(1).getByTestId('cardio-details')).toHaveText('1 fois · moy. 40 min');
    await expect(cards.nth(1).getByTestId('cardio-part')).toHaveCount(0);
    // Barres : même blanc pour toutes les machines, longueur proportionnelle au total (80, 40 et 21 min sur 141) ;
    // inclinaison du tapis : fine barre séparée, sur toute la largeur (15, 45 et 20 min sur 80).
    const bars = await cards.getByTestId('cardio-bar').evaluateAll((els) => els.map((e) => {
      const fill = e.firstElementChild as HTMLElement;
      return [Math.round((fill.getBoundingClientRect().width / e.getBoundingClientRect().width) * 1000) / 10, getComputedStyle(fill).backgroundColor, e.getBoundingClientRect().height];
    }));
    expect(bars).toEqual([[56.7, 'rgb(238, 240, 244)', 16], [28.4, 'rgb(238, 240, 244)', 16], [14.9, 'rgb(238, 240, 244)', 16]]);
    const incline = await cards.nth(0).getByTestId('cardio-incline').evaluate((e) => {
      const kids = [...e.children];
      const widths = kids.map((c) => c.getBoundingClientRect().width);
      const sum = widths.reduce((a, b) => a + b, 0);
      return {
        height: e.getBoundingClientRect().height,
        full: Math.round(e.getBoundingClientRect().width) === Math.round(e.parentElement!.querySelector('.cardio-bar')!.getBoundingClientRect().width),
        classes: kids.map((c) => c.className),
        parts: widths.map((w) => (w / sum) * 100),
        gaps: kids.slice(1).map((c, i) => Math.round((c.getBoundingClientRect().left - kids[i]!.getBoundingClientRect().right) * 10) / 10),
        below: e.getBoundingClientRect().top > e.parentElement!.querySelector('.cardio-details')!.getBoundingClientRect().bottom,
      };
    });
    expect({ ...incline, parts: undefined }).toEqual({ height: 8, full: true, classes: ['incline-neutre', 'incline-moyenne', 'incline-haute'], parts: undefined, gaps: [2, 2], below: true });
    // Largeurs proportionnelles au temps (15, 45 et 20 min sur 80), séparateurs déduits.
    incline.parts.forEach((p, i) => expect(Math.abs(p - [18.75, 56.25, 25][i]!), `segment ${i}`).toBeLessThan(0.5));

    // Teintes (version 1.44.1) : neutre vide avec un contour gris, moyenne gris plein, haute blanc pur ; légende identique ;
    // au moins 3:1 entre deux teintes voisines et avec le fond.
    const tones = await cards.nth(0).evaluate((card) => {
      const style = (sel: string) => getComputedStyle(card.querySelector(sel)!);
      const ring = (sel: string) => /rgb\([^)]*\)/.exec(style(sel).boxShadow)?.[0] ?? '';
      return {
        bg: getComputedStyle(document.body).backgroundColor,
        neutre: [style('.cardio-incline .incline-neutre').backgroundColor, ring('.cardio-incline .incline-neutre')],
        moyenne: style('.cardio-incline .incline-moyenne').backgroundColor,
        haute: style('.cardio-incline .incline-haute').backgroundColor,
        legend: [style('.cardio-legend .incline-neutre').backgroundColor, ring('.cardio-legend .incline-neutre'), style('.cardio-legend .incline-moyenne').backgroundColor, style('.cardio-legend .incline-haute').backgroundColor],
      };
    });
    expect(tones).toEqual({
      bg: 'rgb(15, 17, 21)',
      neutre: ['rgba(0, 0, 0, 0)', 'rgb(144, 148, 158)'],
      moyenne: 'rgb(144, 148, 158)',
      haute: 'rgb(255, 255, 255)',
      legend: ['rgba(0, 0, 0, 0)', 'rgb(144, 148, 158)', 'rgb(144, 148, 158)', 'rgb(255, 255, 255)'],
    });
    const lum = (rgb: string) => {
      const [r, g, b] = rgb.match(/\d+/g)!.slice(0, 3).map((v) => {
        const c = Number(v) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    // Contour du neutre et gris de la moyenne contre le fond ; intérieur vide du neutre (le fond) contre la moyenne ;
    // moyenne contre haute ; haute contre le fond.
    for (const [a, b, name] of [[tones.neutre[1]!, tones.bg, 'contour neutre / fond'], [tones.moyenne, tones.bg, 'moyenne / fond'], [tones.bg, tones.moyenne, 'neutre (vide) / moyenne'], [tones.moyenne, tones.haute, 'moyenne / haute'], [tones.haute, tones.bg, 'haute / fond']] as const) {
      expect(contrast(a, b), name).toBeGreaterThanOrEqual(3);
    }

    // Rien ne dépasse de l'écran ni des cartes : les lignes passent à la ligne entre deux éléments, jamais au milieu.
    for (const width of [412, 360, 320]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width} px`).toBe(true);
      const outside = await cards.evaluateAll((els) =>
        els.flatMap((card) => [...card.querySelectorAll('span')].filter((s) => !s.closest('.visually-hidden') && s.getBoundingClientRect().right > card.getBoundingClientRect().right - 16 + 0.5).map((s) => s.textContent)),
      );
      expect(outside, `${width} px`).toEqual([]);
    }
    // Détails sur deux lignes à 320 px, chaque élément entier, « 1/3 » collé à la moyenne de distance.
    const details = cards.nth(0).getByTestId('cardio-details');
    await expect(details.locator(':scope > .nowrap')).toHaveText(['3 fois ·', 'moy. 27 min ·', '1,2 km ·', 'moy. 1,2 km1/3 (distance notée 1 fois sur 3)']);
    expect(await details.evaluate((p) => new Set([...p.querySelectorAll(':scope > .nowrap')].map((s) => Math.round(s.getBoundingClientRect().top))).size)).toBe(2);

    // Cartes neutres (pas de couleur de groupe), sans graphique.
    const frames = await cards.evaluateAll((els) => els.map((e) => [e.hasAttribute('data-frame'), e.hasAttribute('data-group-color'), getComputedStyle(e).borderTopColor]));
    for (const [framed, grouped, color] of frames) expect([framed, grouped, color]).toEqual([true, false, 'rgb(74, 81, 99)']);
    await expect(page.locator('main svg, main canvas')).toHaveCount(0);

    // Période gardée en revenant, « retour » vers Progrès.
    await page.locator('a.back').click();
    await expect(page).toHaveURL(/#\/progres$/);
    await page.getByRole('navigation', { name: 'Bilans' }).getByRole('link', { name: 'Cardio' }).click();
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
