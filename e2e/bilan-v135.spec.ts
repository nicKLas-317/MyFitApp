import { expect, test, type Page } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { writeSessions } from './helpers';

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
 * Ligne d'un groupe (version 1.36.0) : chiffres Séances / Indirect / Maison (« » pour une case vide, lue « 0 »), total
 * de la barre en séances et sa largeur rapportée au total le plus grand.
 */
const groupRow = (page: Page, group: string) =>
  section(page, 'Groupes travaillés')
    .locator(`tr[data-group="${group}"]`)
    .evaluate((tr) => {
      const bar = tr.querySelector<HTMLElement>('.groups-bar > span')!;
      return {
        cells: [...tr.querySelectorAll('td')].map((td) => (td.querySelector('.visually-hidden') ? '' : td.textContent)),
        total: Number(bar.dataset.total),
        width: Math.round((bar.getBoundingClientRect().width / bar.parentElement!.getBoundingClientRect().width) * 1000) / 1000,
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
    await page.reload();

    // Semaine du 19 : tuiles comparées à la semaine précédente (une séance, 10 min de cardio, aucune activité).
    await page.goto('./#/bilan-periode/semaine/2026-10-19');
    await expect(page.getByTestId('report-reference')).toHaveText('Par rapport à la semaine précédente');
    await expect(tile(page, 'Séances')).toHaveText(/^Séances3dont\s2 à la maison▲ \+2$/);
    await expect(tile(page, 'Durée en salle')).toHaveText(/^Durée en salle1\sh\s00.*= autant$/);
    await expect(tile(page, 'Cardio')).toHaveText(/^Cardio20\smin.*▲ \+10\smin$/);
    await expect(tile(page, 'Activités')).toHaveText(/^Activités1Futsal ×1, 1\sh\s00▲ \+1$/);
    // Pas de calendrier pour la semaine.
    await expect(page.getByTestId('report-calendar')).toHaveCount(0);
    // Barres : pectoraux 1 séance + maison plafonnée à ½ (11 séries) ; jambes ½ (futsal) ; dos vide, « non travaillé ».
    // Groupes (version 1.36.0) : pectoraux 1 séance, 11 séries à la maison plafonnées à ½ (total 1,5, la plus longue
    // barre) ; jambes ½ (futsal) ; dos non travaillé, cases vides.
    expect(await groupRow(page, 'pectoraux')).toEqual({ cells: ['1', '', '11'], total: 1.5, width: 1 });
    expect(await groupRow(page, 'jambes')).toEqual({ cells: ['', '1', ''], total: 0.5, width: 0.333 });
    expect(await groupRow(page, 'dos')).toEqual({ cells: ['', '', ''], total: 0, width: 0 });
    await expect(section(page, 'Groupes travaillés').locator('tr[data-group="dos"]')).toHaveAttribute('data-idle', 'true');
    // Case vide : rien d'affiché, « 0 » pour le lecteur d'écran ; en-têtes complets à 412 px.
    await expect(section(page, 'Groupes travaillés').locator('tr[data-group="dos"] td').first()).toHaveText('0');
    expect(await section(page, 'Groupes travaillés').locator('tr[data-group="dos"] td').first().evaluate((td) => (td as HTMLElement).getBoundingClientRect().width > 0 && td.querySelector('.visually-hidden') !== null)).toBe(true);
    await expect(section(page, 'Groupes travaillés').locator('thead .groups-long:visible')).toHaveText(['Séances', 'Indirect', /^Maison\s*\(séries\)$/]);
    await expect(section(page, 'Groupes travaillés').getByRole('columnheader')).toHaveText(['Barre : total', /Séances/, /Indirect/, /Maison/]);
    // Barre du total : 12 px, dans la couleur du groupe.
    expect(await section(page, 'Groupes travaillés').locator('tr[data-group="pectoraux"] .groups-bar').evaluate((e) => e.getBoundingClientRect().height)).toBe(12);
    // Couleur du groupe, jamais de couleur de statut.
    expect(await section(page, 'Groupes travaillés').locator('tr[data-group="pectoraux"] .groups-bar > span').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(62, 230, 238)');
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
    expect((await groupRow(page, 'pectoraux')).cells).toEqual(['2', '', '14']);
    await noOverflow(page);

    // Semaine en cours (vendredi 30) : comparée à lun.–ven. de la semaine dernière ; pas de calendrier.
    await page.clock.setFixedTime(new Date('2026-10-30T21:00:00'));
    await page.goto('./#/bilan-periode/semaine/2026-10-26');
    await page.reload();
    await expect(page.getByTestId('report-reference')).toHaveText('Par rapport à lun.–ven. de la semaine dernière');
    await expect(tile(page, 'Séances')).toHaveText(/^Séances1dont\s1 à la maison▼ −2$/);
    await expect(page.getByTestId('report-calendar')).toHaveCount(0);
    await noOverflow(page);
  });
});
