import { expect, test, type Page } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { reloadAfterWrites, writeSessions } from './helpers';

/** Séance terminée le `d` octobre 2026 à 18 h ; chaque exercice : [variante, nombre de séries, cible]. */
function session(d: number, perfs: [string, number, number][], home = false, cardio = 0): Session {
  const t = new Date(2026, 9, d, 18).getTime();
  return {
    id: `r${d}${home ? 'm' : ''}`, name: `Séance du ${d} octobre 2026 — 18 h 00`, date: `2026-10-${String(d).padStart(2, '0')}`, startedAt: t, endedAt: t + 3_600_000,
    createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: perfs.map(([variantId, sets, target]) => ({
      variantId, weightKg: ['pompes', 'planche'].includes(variantId) ? 0 : 40, reps: Array<number>(sets).fill(target), targetReps: target, plannedSets: sets, feeling: 'bien',
    })),
    ...(home ? { location: 'maison' as const } : {}),
    ...(cardio ? { cardio: [{ id: `c${d}`, machineId: 'Tapis de marche', machine: 'Tapis de marche', minutes: cardio }] } : {}),
  };
}

// Première séance le lundi 12 octobre. Semaine du 19 : la salle le 20, la maison le 21 (5 séries de pectoraux) et le 22
// (6 séries : 11 en tout, plafonnées à ½), futsal le 23. Planche deux fois verte à 20 s : 25 s.
const SESSIONS: Session[] = [
  session(12, [['chest-press', 3, 10]], false, 10),
  session(20, [['chest-press', 3, 10], ['planche', 3, 20]], false, 20),
  session(21, [['pompes', 2, 10], ['pec-deck', 3, 10]], true),
  session(22, [['chest-press', 3, 10], ['pec-deck', 3, 10], ['planche', 3, 20]], true),
  session(27, [['pec-deck', 3, 10]], true),
];
const FUTSAL = { id: 'act-ponctuelle-futsal-2026-10-23', habitId: 'ponctuelle-futsal', date: '2026-10-23', name: 'Futsal', start: '00:00', end: '01:00', groups: ['jambes'], status: 'done', answeredAt: 0, oneOff: true };

function writeActivities(page: Page): Promise<void> {
  return page.evaluate(
    (activities) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onsuccess = () => {
          const tx = open.result.transaction('meta', 'readwrite');
          tx.objectStore('meta').put(activities, 'activities');
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    [FUTSAL],
  );
}

const STATUS_COLORS = ['rgb(74, 222, 128)', 'rgb(253, 186, 116)', 'rgb(252, 165, 165)'];
const section = (page: Page, title: string) => page.getByRole('region', { name: title });
const tile = (page: Page, label: string) => section(page, 'Séances').locator(`[data-testid="report-tile"][data-label="${label}"]`);
const rungs = (card: ReturnType<Page['locator']>) => card.locator('.rung').evaluateAll((els) => els.map((e) => `${e.textContent}:${e.className.split(' ')[1]}`).join(' '));
/**
 * Un groupe : chiffres de sa ligne du tableau Séances / Indirect / Maison (« » pour une case vide, lue « 0 »), total de
 * son bâton en séances et sa hauteur rapportée au plus grand (version 1.37.0).
 */
const groupRow = (page: Page, group: string) =>
  section(page, 'Groupes travaillés').evaluate((sec, g) => {
    const tr = sec.querySelector(`tr[data-group="${g}"]`)!;
    const stick = sec.querySelector<HTMLElement>(`.groups-stick[data-group="${g}"]`)!;
    const fill = stick.querySelector('.groups-stick-track > span')!;
    return {
      cells: [...tr.querySelectorAll('td')].map((td) => (td.querySelector('.visually-hidden') ? '' : td.textContent)),
      total: Number(stick.dataset.total),
      height: Math.round((fill.getBoundingClientRect().height / fill.parentElement!.getBoundingClientRect().height) * 1000) / 1000,
    };
  }, group);

/** Noms sous les bâtons : disposition choisie, chevauchements (texte seul) et noms hors du cadre. */
const stickNames = (page: Page) =>
  page.getByTestId('groups-chart').evaluate((c) => {
    const names = [...c.querySelectorAll('.groups-stick-label:not(.groups-stick-spacer)')];
    const boxes = names.map((l) => {
      const r = document.createRange();
      r.selectNodeContents(l);
      return r.getBoundingClientRect();
    });
    const frame = c.closest('section')!.getBoundingClientRect();
    let overlap = 0;
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i]!, boxes[j]!];
        if (a.left < b.right + 4 && b.left < a.right + 4 && a.top < b.bottom && b.top < a.bottom) overlap++;
      }
    return {
      layout: c.getAttribute('data-labels'),
      names: names.map((n) => n.textContent),
      rows: new Set(boxes.map((b) => Math.round(b.top))).size,
      overlap,
      outside: boxes.filter((b) => b.left < frame.left + 18 || b.right > frame.right - 18).length,
      fontSize: Math.min(...names.map((n) => parseFloat(getComputedStyle(n).fontSize))),
      tilted: names.filter((n) => getComputedStyle(n).transform !== 'none' || getComputedStyle(n).writingMode !== 'horizontal-tb').length,
    };
  });

async function noOverflow(page: Page): Promise<void> {
  for (const width of [412, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px`).toBe(true);
    // Tableau des groupes dans son cadre ; en-têtes abrégés seulement à 320 px.
    const table = page.locator('.groups-table');
    if (await table.count()) {
      const [t, frame] = await Promise.all([table.boundingBox(), section(page, 'Groupes travaillés').boundingBox()]);
      expect(t!.x + t!.width, `${width}px`).toBeLessThanOrEqual(frame!.x + frame!.width - 16);
      await expect(table.locator('thead .groups-short:visible')).toHaveCount(width === 320 ? 3 : 0);
    }
  }
  await page.setViewportSize({ width: 412, height: 915 });
}

test.describe('Bilan de la période, version 1.35.0', () => {
  test('285. Tuiles comparées (même portion en cours, rien la première période), barres des groupes, calendrier du mois, échelles de cycle ; mail inchangé', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-02T09:00:00'));
    await page.goto('./');
    await writeSessions(page, SESSIONS);
    await writeActivities(page);
    await reloadAfterWrites(page);

    // Semaine du 19 : tuiles comparées à la semaine précédente (une séance, 10 min de cardio, aucune activité).
    await page.goto('./#/bilan-periode/semaine/2026-10-19');
    await expect(page.getByTestId('report-reference')).toHaveText('Par rapport à la semaine précédente');
    await expect(tile(page, 'Séances')).toHaveText(/^Séances3dont\s2 à la maison▲ \+2$/);
    await expect(tile(page, 'Durée en salle')).toHaveText(/^Durée en salle1\sh\s00.*= autant$/);
    await expect(tile(page, 'Cardio')).toHaveText(/^Cardio20\smin.*▲ \+10\smin$/);
    await expect(tile(page, 'Activités')).toHaveText(/^Activités1Futsal ×1, 1\sh\s00▲ \+1$/);
    // Pas de calendrier pour la semaine.
    await expect(page.getByTestId('report-calendar')).toHaveCount(0);
    // Groupes (versions 1.36.0 et 1.37.0) : pectoraux 1 séance, 11 séries à la maison plafonnées à ½ (total 1,5, le plus
    // haut bâton) ; jambes ½ (futsal) ; dos non travaillé : cases vides, bâton vide.
    expect(await groupRow(page, 'pectoraux')).toEqual({ cells: ['1', '', '11'], total: 1.5, height: 1 });
    expect(await groupRow(page, 'jambes')).toEqual({ cells: ['', '1', ''], total: 0.5, height: 0.333 });
    expect(await groupRow(page, 'dos')).toEqual({ cells: ['', '', ''], total: 0, height: 0 });
    await expect(section(page, 'Groupes travaillés').locator('tr[data-group="dos"]')).toHaveAttribute('data-idle', 'true');
    // Case vide : rien d'affiché, « 0 » pour le lecteur d'écran ; en-têtes complets à 412 px ; plus de mini-barre.
    await expect(section(page, 'Groupes travaillés').locator('tr[data-group="dos"] td').first()).toHaveText('0');
    expect(await section(page, 'Groupes travaillés').locator('tr[data-group="dos"] td').first().evaluate((td) => (td as HTMLElement).getBoundingClientRect().width > 0 && td.querySelector('.visually-hidden') !== null)).toBe(true);
    await expect(section(page, 'Groupes travaillés').locator('thead .groups-long:visible')).toHaveText(['Séances', 'Indirect', /^Maison\s*\(séries\)$/]);
    await expect(section(page, 'Groupes travaillés').getByRole('columnheader')).toHaveText(['Groupe', /Séances/, /Indirect/, /Maison/]);
    await expect(section(page, 'Groupes travaillés').locator('table [style*="width"], .groups-bar')).toHaveCount(0);
    // Bâton dans la couleur du groupe, jamais de couleur de statut.
    expect(await section(page, 'Groupes travaillés').locator('.groups-stick[data-group="pectoraux"] .groups-stick-track > span').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(62, 230, 238)');
    const colors = await page.locator('main.period-report, main.period-report *').evaluateAll((els) => els.flatMap((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor, getComputedStyle(e).borderTopColor]));
    for (const c of STATUS_COLORS) expect(colors).not.toContain(c);
    // Échelles : chest press 10 → 11 (plage 8 à 12, puis « +kg ») ; planche 20 → 25 s (5 crans, sans « +kg »).
    const card = (name: string) => section(page, 'Progressions').getByTestId('report-progression').filter({ hasText: name });
    expect(await rungs(card('Chest press'))).toBe('8:rung-done 9:rung-done 10:rung-before 11:rung-now 12:rung-next +kg:rung-next');
    expect(await rungs(card('Planche'))).toBe('20:rung-before 25:rung-now 30:rung-next 35:rung-next 40:rung-next');
    await expect(card('Planche').locator('.prog-meta')).toHaveText('3 séries · en secondes · 22 oct.');
    // Lecteur d'écran : la phrase du mail ; l'échelle est masquée.
    await expect(card('Planche').locator('.visually-hidden')).toHaveText('Planche : 3×20 s → 3×25 s (22 oct.)');
    await expect(card('Planche').getByTestId('ladder')).toHaveAttribute('aria-hidden', 'true');
    // Le mail ne change pas : phrases, comparaisons et groupes en texte.
    const text = (await page.getByTestId('report-text').textContent())!;
    expect(text).toContain('SÉANCES\n- 3 séances (dont 2 à la maison), +2 par rapport à la semaine précédente\n- Durée en salle : 1 h 00, autant que la semaine précédente\n- Cardio : 20 min (Tapis de marche 20 min)\n- Activités : Futsal ×1, 1 h 00\n');
    expect(text).toContain('- Pectoraux : 1× · +11 séries maison\n');
    await noOverflow(page);
    await test.info().attach('bilan-semaine', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    // Semaine du 12 : la précédente est entièrement avant la première séance : « Première semaine suivie », aucun écart.
    await page.getByRole('button', { name: 'Semaine précédente' }).click();
    await expect(page.getByTestId('report-reference')).toHaveText('Première semaine suivie');
    await expect(section(page, 'Séances').locator('.kpi-delta')).toHaveCount(0);
    // Le mail aussi (version 1.35.1) : « première semaine suivie » au lieu de l'écart, durée sans comparaison.
    await expect(page.getByTestId('report-text')).toContainText('SÉANCES\n- 1 séance, première semaine suivie\n- Durée en salle : 1 h 00\n- Cardio : 10 min (Tapis de marche 10 min)\n');

    // Octobre : premier mois suivi ; calendrier au-dessus des tuiles (● salle, ○ maison, ◆ activité).
    await page.goto('./#/bilan-periode/mois/2026-10');
    await expect(page.getByTestId('report-reference')).toHaveText('Premier mois suivi');
    await expect(section(page, 'Séances').locator('.kpi-delta')).toHaveCount(0);
    expect(await page.getByTestId('report-text').textContent()).toContain('SÉANCES\n- 5 séances (dont 3 à la maison), premier mois suivi\n');
    const calendar = page.getByTestId('report-calendar');
    await expect(calendar.locator('li[data-date]')).toHaveCount(31);
    await expect(calendar.locator('li[data-date="2026-10-01"]')).toHaveAttribute('aria-label', '1 oct. : rien');
    await expect(calendar.locator('li[data-date="2026-10-20"]')).toHaveAttribute('aria-label', '20 oct. : 1 séance à la salle');
    await expect(calendar.locator('li[data-date="2026-10-21"]')).toHaveAttribute('aria-label', '21 oct. : 1 séance à la maison');
    await expect(calendar.locator('li[data-date="2026-10-23"]')).toHaveAttribute('aria-label', '23 oct. : 1 activité');
    expect(await calendar.locator('li[data-date="2026-10-20"] .mk').evaluateAll((m) => m.map((e) => e.className))).toEqual(['mk mk-gym']);
    expect(await calendar.locator('li[data-date="2026-10-21"] .mk').evaluateAll((m) => m.map((e) => e.className))).toEqual(['mk mk-home']);
    expect(await calendar.locator('li[data-date="2026-10-23"] .mk').evaluateAll((m) => m.map((e) => e.className))).toEqual(['mk mk-act']);
    // Le 1er octobre est un jeudi : trois cases vides avant.
    await expect(calendar.locator('li.cal-out')).toHaveCount(3);
    const [calBox, tilesBox] = [(await calendar.boundingBox())!, (await section(page, 'Séances').locator('.kpis').boundingBox())!];
    expect(calBox.y + calBox.height).toBeLessThan(tilesBox.y);
    // Maison plafonnée à ½ par semaine : ½ (semaine du 19) + 3/12 (semaine du 26), pas 14/12.
    expect((await groupRow(page, 'pectoraux')).total).toBe(2.75);
    expect((await groupRow(page, 'pectoraux')).height).toBe(1);
    expect((await groupRow(page, 'pectoraux')).cells).toEqual(['2', '', '14']);
    await noOverflow(page);

    // Semaine en cours (vendredi 30) : comparée à lun.–ven. de la semaine dernière ; pas de calendrier.
    await page.clock.setFixedTime(new Date('2026-10-30T21:00:00'));
    await page.goto('./#/bilan-periode/semaine/2026-10-26');
    await reloadAfterWrites(page);
    await expect(page.getByTestId('report-reference')).toHaveText('Par rapport à lun.–ven. de la semaine dernière');
    await expect(tile(page, 'Séances')).toHaveText(/^Séances1dont\s1 à la maison▼ −2$/);
    await expect(page.getByTestId('report-calendar')).toHaveCount(0);
    await noOverflow(page);
  });

  test('288. Bâtons verticaux des groupes au-dessus du tableau (version 1.37.0) : couleur et ordre fixe, hauteur = total, noms sur une ligne (entiers ou trois lettres), deux rangs seulement en dernier recours, sans chevauchement à 412, 360 et 320 px (texte agrandi compris), bâton vide grisé, totaux pour le lecteur d’écran', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-02T09:00:00'));
    await page.goto('./');
    await writeSessions(page, SESSIONS);
    await writeActivities(page);
    await reloadAfterWrites(page);
    await page.goto('./#/bilan-periode/semaine/2026-10-19');
    const chart = page.getByTestId('groups-chart');
    const sec = section(page, 'Groupes travaillés');
    // Au-dessus du tableau ; un bâton par groupe du récapitulatif, dans son ordre.
    const [chartBox, tableBox] = [(await chart.boundingBox())!, (await sec.locator('table').boundingBox())!];
    expect(chartBox.y + chartBox.height).toBeLessThanOrEqual(tableBox.y);
    await expect(chart.locator('.groups-stick')).toHaveCount(6);
    expect(await chart.locator('.groups-stick').evaluateAll((els) => els.map((e) => e.getAttribute('data-group')))).toEqual(['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes']);
    // Lecteur d'écran : les totaux par groupe ; pas de valeur écrite au-dessus des bâtons.
    await expect(chart).toHaveAttribute('role', 'img');
    await expect(chart).toHaveAttribute('aria-label', 'Total par groupe, en séances : pectoraux 1,5, dos 0, épaules 0,5, biceps 0, triceps 0,5, jambes 0,5.');
    expect(await chart.evaluate((c) => [...c.querySelectorAll('.groups-stick-label:not(.groups-stick-spacer)')].map((l) => l.textContent).join(' '))).toBe((await chart.innerText()).replace(/\s+/g, ' ').trim());
    // Hauteur = total ; le plus travaillé occupe toute la hauteur (96 px).
    expect(await chart.locator('.groups-stick[data-group="pectoraux"] .groups-stick-track > span').evaluate((e) => e.getBoundingClientRect().height)).toBe(96);
    expect(await groupRow(page, 'epaules')).toMatchObject({ total: 0.5, height: 0.333 });
    // Groupe non travaillé : bâton vide (pointillés), nom grisé.
    const dos = chart.locator('.groups-stick[data-group="dos"]');
    expect(await dos.locator('.groups-stick-track').evaluate((e) => getComputedStyle(e).borderTopStyle)).toBe('dashed');
    // Gris des textes secondaires (--muted, #9aa1b0).
    expect(await dos.locator('.groups-stick-label').evaluate((e) => getComputedStyle(e).color)).toBe('rgb(154, 161, 176)');
    // Noms (version 1.37.1) : toujours sur une ligne si possible ; six groupes : trois lettres à 412, 360 et 320 px, et
    // encore à 320 px avec le texte agrandi à 115 %.
    const largeText = () => page.addStyleTag({ content: ':root { font-size: calc(17px * 1.15) !important; }' });
    const six = ['Pec', 'Dos', 'Épa', 'Bic', 'Tri', 'Jam'];
    for (const width of [412, 360, 320] as const) {
      await page.setViewportSize({ width, height: 900 });
      await expect(chart).toHaveAttribute('data-labels', 'short');
      const names = await stickNames(page);
      expect(names, `${width}px`).toMatchObject({ names: six, rows: 1, overlap: 0, outside: 0, tilted: 0 });
      expect(names.fontSize, `${width}px`).toBeGreaterThanOrEqual(13);
    }
    let large = await largeText();
    await expect(chart).toHaveAttribute('data-labels', 'short');
    expect(await stickNames(page)).toMatchObject({ names: six, rows: 1, overlap: 0, outside: 0 });
    await large.evaluate((el) => (el as Element).remove());

    // Sept groupes (abdominaux au récapitulatif) : trois lettres sur une ligne à 320 px ; deux rangs alternés seulement en
    // dernier recours, à 320 px avec le texte agrandi, sans chevauchement ; de retour sur une ligne ensuite.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('myfitapp');
          open.onsuccess = () => {
            const tx = open.result.transaction('meta', 'readwrite');
            tx.objectStore('meta').put({ groups: ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux'], redThreshold: 2 }, 'weeklyRecap');
            tx.oncomplete = () => (open.result.close(), resolve());
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await reloadAfterWrites(page);
    await expect(chart.locator('.groups-stick')).toHaveCount(7);
    await expect(chart).toHaveAttribute('data-labels', 'short');
    expect(await stickNames(page)).toMatchObject({ names: [...six, 'Abd'], rows: 1, overlap: 0, outside: 0 });
    large = await largeText();
    await expect(chart).toHaveAttribute('data-labels', 'staggered');
    expect(await stickNames(page)).toMatchObject({ names: [...six, 'Abd'], rows: 2, overlap: 0, outside: 0, tilted: 0 });
    await page.setViewportSize({ width: 360, height: 900 });
    await expect(chart).toHaveAttribute('data-labels', 'short');
    await large.evaluate((el) => (el as Element).remove());
    await page.setViewportSize({ width: 320, height: 900 });
    await expect(chart).toHaveAttribute('data-labels', 'short');
  });
});
