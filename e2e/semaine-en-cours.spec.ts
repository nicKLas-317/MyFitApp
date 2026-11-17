import { expect, test, type Page } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { reloadAfterWrites, writeSessions } from './helpers';

/** Séance terminée le `d` du mois `m` (0 = janvier) à `hour` h ; chaque exercice : [variante, nombre de séries]. */
function session(m: number, d: number, hour: number, perfs: [string, number][], home = false): Session {
  const t = new Date(2026, m, d, hour).getTime();
  return {
    id: `s${m}-${d}-${hour}`, name: `Séance du ${d} 2026 — ${hour} h 00`, date: `2026-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    startedAt: t, endedAt: t + 1_800_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: perfs.map(([variantId, sets]) => ({ variantId, weightKg: 12, reps: Array<number>(sets).fill(8), targetReps: 8, plannedSets: sets, feeling: 'bien' })),
    ...(home ? { location: 'maison' as const } : {}),
  };
}

const chart = (page: Page) => page.getByRole('region', { name: 'Séries par semaine' }).getByTestId('chart-sets');

test.describe('Séries par semaine : semaine en cours, version 1.49.2', () => {
  test('317. La semaine en cours garde les teintes direct / indirect, avec un contour en pointillés à la couleur du groupe et « en cours » sous sa date', async ({ page }) => {
    // Le cas de l'utilisateur, mardi 17 novembre 2026 : 3 séries d'écarté couché haltères à la maison le matin
    // (directes, sans indirect) ; les semaines d'avant, chest press (direct) et dips assistés (pectoraux en secondaire).
    await page.clock.setFixedTime(new Date('2026-11-17T14:00:00'));
    await page.goto('./');
    await writeSessions(page, [
      session(9, 27, 18, [['chest-press', 3], ['dips-assistes', 3]]),
      session(10, 3, 18, [['chest-press', 3], ['dips-assistes', 3]]),
      session(10, 10, 18, [['chest-press', 3], ['dips-assistes', 3]]),
      session(10, 17, 8, [['ecarte-couche-halteres', 3]], true),
    ]);
    await reloadAfterWrites(page);
    // Récapitulatif : les 3 séries de la maison comptent en entier pour les pectoraux.
    await expect(page.locator('.recap-cell[data-group="pectoraux"]')).toContainText(/Pectoraux \(3\sséries\)/);

    await page.goto('./#/bilan-groupes/pectoraux/series');
    await expect(chart(page)).toHaveAttribute('data-bars', '4');
    const current = chart(page).locator('g[data-current]');
    await expect(current).toHaveAttribute('data-main', '3');
    await expect(current).toHaveAttribute('data-extra', '0');
    await expect(chart(page).getByTestId('bar-current')).toHaveText('en cours');

    for (const width of [412, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      // Le graphique se redessine à la largeur réelle (échelle 1) : attendre ce dessin avant de mesurer.
      await expect
        .poll(() => chart(page).evaluate((svg) => Math.abs(svg.getBoundingClientRect().width - Number(svg.getAttribute('viewBox')!.split(' ')[2])) < 1))
        .toBe(true);
      const look = await chart(page).evaluate((svg) => {
        const style = (e: Element) => getComputedStyle(e);
        const box = (e: Element) => e.getBoundingClientRect();
        const cur = svg.querySelector('g[data-current]')!;
        const done = [...svg.querySelectorAll('g[data-main]:not([data-current])')];
        const main = cur.querySelector('rect.bar-main')!;
        const outline = cur.querySelector('rect.bar-outline')!;
        const groupColor = style(svg).getPropertyValue('--group-color').trim();
        const probe = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        probe.style.fill = groupColor;
        svg.appendChild(probe);
        const color = style(probe).fill;
        probe.remove();
        const m = box(main);
        const o = box(outline);
        const previous = box(done.at(-1)!.querySelector('rect.bar-main')!);
        const dateText = [...svg.querySelectorAll('[data-date]')].at(-1)!;
        const belowText = svg.querySelector('[data-testid="bar-current"]')!;
        const date = box(dateText);
        const below = box(belowText);
        const chartBox = box(svg);
        const total = box(cur.parentElement!.querySelector(`[data-labels="${[...svg.querySelectorAll('g[data-main]')].indexOf(cur)}"] [data-total]`)!);
        return {
          // Partie directe de la semaine en cours : la même teinte et la même opacité qu'une semaine terminée…
          currentMain: [style(main).opacity, style(main).fill],
          doneMain: [...new Set(done.flatMap((g) => [...g.querySelectorAll('rect.bar-main')].map((r) => `${style(r).opacity}|${style(r).fill}`)))],
          // … et pas celle de l'indirect (clair).
          doneExtra: [...new Set(done.flatMap((g) => [...g.querySelectorAll('rect.bar-extra')].map((r) => style(r).opacity)))],
          color,
          // Contour en pointillés à la couleur du groupe, autour de la barre (sans la toucher), sans toucher la barre
          // précédente ni sortir du graphique.
          outline: [style(outline).fill, style(outline).stroke, style(outline).strokeDasharray !== 'none'],
          around: o.left < m.left - 1 && o.right > m.right + 1 && o.top < m.top - 1 && Math.abs(o.bottom - m.bottom) < 2,
          clear: o.left - previous.right >= 2,
          inside: o.left >= chartBox.left && o.right <= chartBox.right && o.top >= chartBox.top,
          // Le total (« 3 ») au-dessus du contour, sans le toucher.
          totalAbove: total.bottom <= o.top && total.top >= chartBox.top,
          // « en cours » sous la date, avec le même point d'ancrage (centré, ou aligné à droite quand les colonnes sont étroites).
          enCours:
            below.top >= date.bottom - 1 &&
            belowText.getAttribute('x') === dateText.getAttribute('x') &&
            belowText.getAttribute('text-anchor') === dateText.getAttribute('text-anchor'),
        };
      });
      expect(look.doneMain, `${width}px`).toEqual([`1|${look.color}`]);
      expect(look.currentMain, `${width}px`).toEqual(['1', look.color]);
      expect(look.doneExtra, `${width}px`).toEqual(['0.4']);
      expect(look.outline, `${width}px`).toEqual(['none', look.color, true]);
      expect(look, `${width}px`).toMatchObject({ around: true, clear: true, inside: true, totalAbove: true, enCours: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width}px`).toBe(true);
    }
    await page.setViewportSize({ width: 412, height: 915 });
    await test.info().attach('semaine-en-cours', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });
});
