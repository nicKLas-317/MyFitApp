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

/** Séance terminée le `d` du mois `m` (0 = janvier) ; chaque exercice : [variante, nombre de séries]. */
function session(m: number, d: number, perfs: [string, number][], home = false): Session {
  const t = new Date(2026, m, d, 18).getTime();
  return {
    id: `s${m}-${d}`, name: `Séance du ${d} 2026 — 18 h 00`, date: `2026-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, startedAt: t, endedAt: t + 3_600_000,
    createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: perfs.map(([variantId, sets]) => ({ variantId, weightKg: 40, reps: Array<number>(sets).fill(8), targetReps: 8, plannedSets: sets, feeling: 'bien' })),
    ...(home ? { location: 'maison' as const } : {}),
  };
}

const setsSection = (page: Page) => page.getByRole('region', { name: 'Séries par semaine' });
const chart = (page: Page) => setsSection(page).getByTestId('chart-sets');

test.describe('Séries par semaine, version 1.34.0', () => {
  test('283. Barres depuis la semaine de la première séance (vacances gardées), moyenne en pointillés étiquetée, sans la semaine en cours ; pas de ligne sous le seuil', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
    await page.goto('./');
    await writeSessions(page, [
      // Première séance : mardi 6 octobre, à la maison, abdos seuls.
      session(9, 6, [['crunch-sol', 3]], true),
      // Pectoraux : 6 séries la semaine du 12, rien la semaine du 19 (vacances), 3 celle du 26, 2 la semaine en cours.
      session(9, 13, [['chest-press', 3], ['pec-deck', 3]]),
      session(9, 27, [['chest-press', 3]]),
      session(10, 3, [['chest-press', 2]]),
    ]);
    await page.reload();
    await page.goto('./#/bilan-groupes/pectoraux');

    // Cinq barres : du 5 oct. (première séance) au 2 nov. ; plus de semaines vides avant.
    await expect(chart(page)).toHaveAttribute('data-bars', '5');
    await expect(chart(page).locator('[data-date]').first()).toHaveText('5 oct.');
    // Légende courte, sur deux lignes au plus à 412 et 360 px ; l'explication complète est dans le texte du lecteur d'écran.
    const legend = setsSection(page).getByTestId('sets-legend');
    await expect(legend).toHaveText('Plein\u00a0: direct\u00a0· Clair\u00a0: indirect (÷\u00a02)\u00a0· Pointillés\u00a0: moyenne');
    for (const width of [412, 360]) {
      await page.setViewportSize({ width, height: 900 });
      const { height, line } = await legend.evaluate((el) => ({ height: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight) }));
      expect(height, `${width}px`).toBeLessThan(line * 2.5);
    }
    await page.setViewportSize({ width: 412, height: 915 });
    // Moyenne : (6 + 0 + 3) ÷ 3, de la semaine du 12 à celle du 26 ; ni le 5 oct. (avant les pectoraux), ni la semaine en cours.
    await expect(chart(page)).toHaveAttribute('data-average', '3.00');
    await expect(chart(page).getByTestId('chart-average')).toContainText('Moyenne : 3');
    await expect(chart(page)).toHaveAttribute(
      'aria-label',
      'Séries par semaine pectoraux : semaine du 5 oct. 0, semaine du 12 oct. 6, semaine du 19 oct. 0, semaine du 26 oct. 3, semaine du 2 nov. 2 (en cours). ' +
        'Moyenne : 3, semaine en cours exclue. Depuis ta première séance, 12 semaines au plus, du lundi au dimanche ; en plein, les séries des exercices ' +
        'dont c’est le groupe principal ; en clair, les séries indirectes, comptées pour moitié ; en pointillés, la moyenne par semaine.',
    );
    // Ligne pointillée à la hauteur de la moyenne : moitié de la barre de 6 ; l'étiquette ne touche ni barre ni total.
    const geometry = await chart(page).evaluate((svg) => {
      const box = (e: Element) => e.getBoundingClientRect();
      const [line, , label] = [...svg.querySelectorAll('[data-testid="chart-average"] > *')];
      const tall = [...svg.querySelectorAll('rect.bar-main')].map(box).sort((a, b) => b.height - a.height)[0]!;
      const others = [...svg.querySelectorAll('g[data-main] > *, [data-labels] > *')].map(box);
      const l = box(label!);
      // Totaux dessinés après la ligne et détourés de la couleur du fond : la ligne s'interrompt sous le chiffre.
      const totals = [...svg.querySelectorAll('[data-total]')];
      const order = line!.compareDocumentPosition(totals[0]!) & Node.DOCUMENT_POSITION_FOLLOWING;
      const halo = totals.map((t) => getComputedStyle(t)).map((c) => `${c.paintOrder} ${c.strokeWidth} ${c.stroke === getComputedStyle(svg).backgroundColor}`);
      // Semaine en cours : la dernière barre, plus transparente, avec un contour, « en cours » sous sa date.
      const current = svg.querySelector('g[data-current]')!;
      const opacity = (sel: string) => [...svg.querySelectorAll(sel)].map((r) => getComputedStyle(r).opacity);
      const date = box([...svg.querySelectorAll('[data-date]')].at(-1)!);
      const below = box(svg.querySelector('[data-testid="bar-current"]')!);
      return {
        order,
        halo: [...new Set(halo)],
        currentIndex: [...svg.querySelectorAll('g[data-main]')].indexOf(current),
        currentOpacity: [...current.querySelectorAll('rect.bar-main')].map((r) => getComputedStyle(r).opacity),
        doneOpacity: [...new Set(opacity('g[data-main]:not([data-current]) rect.bar-main'))],
        outline: getComputedStyle(current.querySelector('rect.bar-outline')!).fill,
        sameRow: new Set([...svg.querySelectorAll('[data-date]')].map((t) => Math.round(box(t).top))).size === 1,
        enCours: below.top >= date.bottom - 1 && Math.abs((below.left + below.right) / 2 - (date.left + date.right) / 2) < 1,
        dashed: getComputedStyle(line!).strokeDasharray,
        lineY: box(line!).top,
        half: tall.bottom - tall.height / 2,
        overlaps: others.filter((o) => o.left < l.right && l.left < o.right && o.top < l.bottom && l.top < o.bottom).length,
        widest: Math.max(...[...svg.querySelectorAll('rect')].map((r) => box(r).width)),
      };
    });
    expect(geometry.dashed).not.toBe('none');
    expect(Math.abs(geometry.lineY - geometry.half)).toBeLessThan(1);
    expect(geometry.overlaps).toBe(0);
    expect(geometry.order).toBeTruthy();
    expect(geometry.halo).toEqual(['stroke 4px true']);
    expect(geometry).toMatchObject({ currentIndex: 4, currentOpacity: ['0.45'], doneOpacity: ['1'], outline: 'none', sameRow: true, enCours: true });
    await expect(chart(page).getByTestId('bar-current')).toHaveText('en cours');
    // Peu de semaines : barres plafonnées à 32 px.
    expect(geometry.widest).toBeLessThanOrEqual(32);
    await noOverflow(page);
    await test.info().attach('series-moyenne', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    // Lundi 9 novembre : la semaine du 2 nov. est terminée, elle entre dans la moyenne : (6 + 0 + 3 + 2) ÷ 4.
    await page.clock.setFixedTime(new Date('2026-11-09T08:00:00'));
    await page.reload();
    await expect(chart(page)).toHaveAttribute('data-bars', '6');
    await expect(chart(page).getByTestId('chart-average')).toContainText('Moyenne : 2,8');

    // Abdominaux : une seule semaine avec des séries, sous le seuil : ni graphique ni moyenne.
    await page.getByRole('group', { name: 'Groupe musculaire' }).getByRole('button', { name: 'Abdominaux' }).click();
    await expect(setsSection(page).getByTestId('sets-not-enough')).toHaveText('Pas encore assez de données pour analyser ta progression : 1 semaine sur 3 nécessaires.');
    await expect(page.getByTestId('chart-average')).toHaveCount(0);
  });
});
