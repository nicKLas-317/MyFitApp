import { expect, test, type Page } from '@playwright/test';
import { ALERT_NOW, alertHistory, type AlertScenario } from '../src/analysis/__tests__/alertes-simulation';
import type { Session, SessionPlan } from '../src/domain/types';
import { defaultSessionName } from '../src/session/format';
import { reloadAfterWrites, tabBar, writeSessions } from './helpers';

/** Taille de police Android agrandie (simulation) : tout le texte à 115 %. */
async function largeText(page: Page): Promise<() => Promise<void>> {
  const style = await page.addStyleTag({ content: ':root { font-size: calc(17px * 1.15) !important; }' });
  return () => style.evaluate((el) => (el as Element).remove());
}

/**
 * Données simulées, l'horloge au `now` donné ; bilans de la semaine et du mois déjà ouverts (seule l'alerte compte),
 * aucune alerte ignorée.
 */
async function open(page: Page, scenario: AlertScenario = {}, now = ALERT_NOW): Promise<void> {
  await page.clock.setFixedTime(new Date(now));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onsuccess = () => {
          const tx = open.result.transaction(['sessions', 'meta'], 'readwrite');
          tx.objectStore('sessions').clear();
          tx.objectStore('meta').put({ week: '2026-11-09', month: '2026-11' }, 'reportsSeen');
          tx.objectStore('meta').delete('groupAlertsIgnored');
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await writeSessions(page, alertHistory(scenario));
  await reloadAfterWrites(page);
  await expect(page.getByTestId('weekly-recap')).toBeVisible();
}

const alerts = (page: Page) => page.getByTestId('group-alerts');

/**
 * Géométrie de l'accueil : hauteurs et écarts des éléments tactiles, débordement, alertes juste sous le récapitulatif
 * (liste ou ligne de résumé), « Démarrer » (ou « Démarrer la séance prévue ») entièrement au-dessus de la barre
 * d'onglets, sans défiler.
 */
function layout(page: Page) {
  return page.evaluate(() => {
    window.scrollTo(0, 0);
    const taps = [...document.querySelectorAll('main a, main button')].filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getBoundingClientRect());
    let closest = Infinity;
    for (let i = 0; i < taps.length; i++)
      for (let j = i + 1; j < taps.length; j++) {
        const a = taps[i]!;
        const b = taps[j]!;
        const dx = Math.max(0, b.left - a.right, a.left - b.right);
        const dy = Math.max(0, b.top - a.bottom, a.top - b.bottom);
        closest = Math.min(closest, Math.max(dx, dy));
      }
    const recap = document.querySelector('[data-testid="weekly-recap"]')!;
    const list = document.querySelector('[data-testid="group-alerts"], [data-testid="group-alerts-summary"]');
    const start = [...document.querySelectorAll('main button')].find((b) => b.textContent?.startsWith('Démarrer'))!;
    const nav = document.querySelector('nav')!.getBoundingClientRect();
    return {
      minHeight: Math.min(...taps.map((r) => r.height)),
      closest,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      afterRecap: !list || recap.nextElementSibling === list,
      startVisible: start.getBoundingClientRect().bottom <= nav.top,
      fontSize: list ? getComputedStyle(list.querySelector('li') ?? list).fontSize : null,
    };
  });
}

/** Tailles contrôlées : largeur, hauteur de l'écran, texte agrandi. */
// 320 px : un écran de 360 × 800 avec la taille d’affichage agrandie d’Android (× 1,125) donne 320 × 711.
const SIZES = [[412, 915, false], [360, 800, false], [320, 711, false], [360, 800, true]] as const;

/**
 * Cas le plus chargé de l'accueil (version 1.40.0), mercredi 11 nov. 12 h : question du badminton de lundi, 7 groupes au
 * récapitulatif, 3 alertes (vacances les deux dernières semaines), séance du matin à compléter, séance pour compléter la
 * semaine, rappel de sauvegarde ; avec ou sans séance prévue. `cardio` (version 1.41.0) : 50 min de tapis dans la séance
 * du matin, « Jambes (1× · +50 min cardio) · aujourd’hui » et « · 50 min de cardio » dans l'en-tête.
 */
async function openLoaded(page: Page, withPlan: boolean, cardio = false): Promise<void> {
  await open(page, { vacations: ['2026-10-26', '2026-11-02'], dosDown: [], pecDown: [] });
  const t = new Date(2026, 10, 11, 8).getTime();
  const morning: Session = {
    id: 'matin-11', name: defaultSessionName(t), date: '2026-11-11', startedAt: t, endedAt: t + 3_600_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: [{ variantId: 'presse-a-cuisses', weightKg: 60, targetReps: 10, plannedSets: 3, reps: [10, 10, 10], feeling: 'bien' }],
    ...(cardio ? { cardio: [{ id: 'matin-11-tapis', machineId: 'tapis', machine: 'Tapis de marche', incline: 'neutre' as const, minutes: 50 }] } : {}),
  };
  const plan: SessionPlan | null = withPlan
    ? { id: 'plan-charge', createdAt: t, updatedAt: t, items: [{ kind: 'exercise', variantId: 'chest-press' }, { kind: 'exercise', variantId: 'pec-deck' }, { kind: 'exercise', variantId: 'tirage-vertical' }] }
    : null;
  await writeSessions(page, [morning]);
  await page.evaluate(
    (plan) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onsuccess = () => {
          const tx = open.result.transaction('meta', 'readwrite');
          const meta = tx.objectStore('meta');
          meta.put({ groups: ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux'], redThreshold: 2 }, 'weeklyRecap');
          for (const key of ['activities', 'lastExportAt', 'plan']) meta.delete(key);
          if (plan) meta.put(plan, 'plan');
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    plan,
  );
  await reloadAfterWrites(page);
  await expect(page.getByTestId('weekly-recap')).toBeVisible();
}

test.describe('Alerte « groupe moins travaillé »', () => {
  test('291. Ligne discrète sous le récapitulatif (une ligne de résumé à partir de 2 groupes) et pastille sur Progrès ; un appui ouvre les séries du groupe ; « Ignorer » jusqu’à la semaine suivante encore sous la moyenne ; 3 lignes au plus ; historique trop court : rien ; cas le plus chargé : « Démarrer » à l’écran sans défiler', async ({ page }) => {
    // Dos en baisse 2 semaines, pectoraux 1 semaine seulement, vacances fin septembre : le dos seul.
    await open(page);
    const line = alerts(page).getByRole('listitem');
    await expect(line).toHaveCount(1);
    await expect(line).toHaveAttribute('data-group', 'dos');
    // Ses propres chiffres (version 1.38.1) : séries des 2 semaines et moyenne de l'alerte, arrondie à une décimale
    // (5,25 → 5,3 ; le graphique garde sa moyenne, 4,8).
    await expect(line.getByRole('link')).toHaveText('Dos : 3 séries par semaine depuis 2 semaines (ta moyenne : 5,3)');
    // Sans soulignement, seul le nom en gras ; toute la ligne est le lien.
    const look = await line.getByRole('link').evaluate((a) => ({
      underline: [a, ...a.querySelectorAll('*')].some((e) => getComputedStyle(e).textDecorationLine.includes('underline')),
      bold: getComputedStyle(a.querySelector('strong')!).fontWeight,
      rest: getComputedStyle(a).fontWeight,
      covers: (() => {
        const r = document.createRange();
        r.selectNodeContents(a);
        const t = r.getBoundingClientRect();
        const b = a.getBoundingClientRect();
        return t.left >= b.left - 0.5 && t.right <= b.right + 0.5 && t.top >= b.top - 0.5 && t.bottom <= b.bottom + 0.5;
      })(),
    }));
    expect(look).toEqual({ underline: false, bold: '700', rest: '400', covers: true });
    await expect(line.getByRole('link')).toHaveAttribute('href', '#/bilan-groupes/dos/series');
    await expect(line.getByRole('button', { name: 'Ignorer l’alerte : Dos' })).toHaveText('Ignorer');
    // Pastille sur l'onglet Progrès, nommée pour le lecteur d'écran.
    await expect(tabBar(page).getByTestId('group-alert-badge')).toBeVisible();
    await expect(tabBar(page).getByRole('link', { name: 'Progrès : groupe sous ta moyenne' })).toBeVisible();
    await expect(tabBar(page).getByTestId('report-badge')).toHaveCount(0);
    // Discrète (15 px), sous le récapitulatif, « Démarrer une séance » toujours à l'écran ; rien ne dépasse.
    for (const [width, height, big] of SIZES) {
      await page.setViewportSize({ width, height });
      const restore = big ? await largeText(page) : null;
      const l = await layout(page);
      expect(l, `${width} px${big ? ', texte à 115 %' : ''}`).toMatchObject({ afterRecap: true, startVisible: true });
      expect(l.minHeight).toBeGreaterThanOrEqual(48);
      expect(l.closest).toBeGreaterThanOrEqual(8);
      expect(l.overflow).toBeLessThanOrEqual(0);
      expect(l.fontSize).toBe(big ? '17.25px' : '15px');
      await restore?.();
    }
    await page.setViewportSize({ width: 412, height: 915 });

    // Un appui : le graphique du dos, sur les séries par semaine, dans l'onglet Progrès ; « retour » ramène à la Séance.
    await line.getByRole('link').click();
    await expect(page.getByRole('heading', { name: 'Par groupe musculaire' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Groupe musculaire' }).getByRole('button', { name: 'Dos' })).toHaveAttribute('aria-pressed', 'true');
    const sets = page.getByRole('region', { name: 'Séries par semaine' });
    await expect(sets).toBeInViewport();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    // Mêmes séries que l'alerte : 3 et 3 les deux dernières semaines terminées, sous la moyenne du graphique.
    const bars = sets.locator('g[data-main]');
    expect((await bars.evaluateAll((gs) => gs.map((g) => g.getAttribute('data-main')))).slice(-3)).toEqual(['3', '3', '0']);
    // Onze semaines : dates sous les barres sans chevauchement (plus de « 26 oct. » collée à « 9 nov. »), à 412, 360 et 320 px.
    for (const width of [412, 360, 320]) {
      await page.setViewportSize({ width, height: 915 });
      await expect(sets.locator('text[data-date]')).toHaveText(['31 août', '28 sept.', '9 nov.']);
      const gaps = await sets.locator('text[data-date]').evaluateAll((ts) => {
        const r = ts.map((t) => t.getBoundingClientRect());
        return r.slice(1).map((b, i) => b.left - r[i]!.right);
      });
      for (const gap of gaps) expect(gap, `${width} px`).toBeGreaterThanOrEqual(8);
    }
    await page.setViewportSize({ width: 412, height: 915 });
    await expect(tabBar(page).getByRole('link', { name: /^Progrès/ })).toHaveAttribute('aria-current', 'page');
    await page.goBack();
    await expect(page.getByTestId('weekly-recap')).toBeVisible();

    // Onglet Progrès : la même ligne, sous les bilans prêts, au-dessus des bilans.
    await tabBar(page).getByRole('link', { name: /^Progrès/ }).click();
    await expect(page.getByRole('heading', { name: 'Progrès', exact: true })).toBeVisible();
    await expect(alerts(page).getByRole('link')).toHaveText('Dos : 3 séries par semaine depuis 2 semaines (ta moyenne : 5,3)');

    // « Ignorer » : la ligne et la pastille disparaissent, même après relance (mémorisé sur l'appareil).
    await alerts(page).getByRole('button', { name: 'Ignorer l’alerte : Dos' }).click();
    await expect(alerts(page)).toHaveCount(0);
    await expect(tabBar(page).getByTestId('group-alert-badge')).toHaveCount(0);
    await expect(tabBar(page).getByRole('link', { name: 'Progrès', exact: true })).toBeVisible();
    await page.goto('./');
    await reloadAfterWrites(page);
    await expect(page.getByTestId('weekly-recap')).toBeVisible();
    await expect(alerts(page)).toHaveCount(0);
    expect(await page.evaluate(() => new Promise((resolve) => {
      const open = indexedDB.open('myfitapp');
      open.onsuccess = () => {
        const req = open.result.transaction('meta').objectStore('meta').get('groupAlertsIgnored');
        req.onsuccess = () => (open.result.close(), resolve(req.result));
      };
    }))).toEqual({ dos: '2026-11-02' });

    // Une semaine plus tard, le dos encore sous sa moyenne : l'alerte revient.
    const later = new Date(2026, 10, 18, 12).getTime();
    await page.clock.setFixedTime(new Date(later));
    await writeSessions(page, alertHistory({ until: '2026-11-16', dosDown: ['2026-10-26', '2026-11-02', '2026-11-09'] }));
    await reloadAfterWrites(page);
    await expect(alerts(page).getByRole('link')).toHaveText('Dos : 3 séries par semaine depuis 2 semaines (ta moyenne : 5)');
    await expect(tabBar(page).getByTestId('group-alert-badge')).toBeVisible();

    // Vacances les deux dernières semaines : tous les groupes sous leur moyenne, 3 au plus, dans l'ordre des groupes.
    // Onglet Séance (version 1.40.0) : une seule ligne de résumé, qui mène à l'onglet Progrès (sans « Ignorer »).
    await open(page, { vacations: ['2026-10-26', '2026-11-02'], dosDown: [], pecDown: [] });
    await expect(alerts(page)).toHaveCount(0);
    const summary = page.getByTestId('group-alerts-summary');
    await expect(summary).toHaveText('3 groupes sous ta moyenne : Pectoraux, Dos, Épaules');
    await expect(summary).toHaveAttribute('href', '#/progres');
    expect(await summary.evaluate((a) => [getComputedStyle(a).textDecorationLine, getComputedStyle(a.querySelector('strong')!).fontWeight, getComputedStyle(a).fontSize])).toEqual(['none', '700', '15px']);
    for (const [width, height, big] of SIZES) {
      await page.setViewportSize({ width, height });
      const restore = big ? await largeText(page) : null;
      const l = await layout(page);
      expect(l, `${width} px${big ? ', texte à 115 %' : ''}`).toMatchObject({ afterRecap: true, startVisible: true });
      expect(l.minHeight).toBeGreaterThanOrEqual(48);
      expect(l.closest).toBeGreaterThanOrEqual(8);
      expect(l.overflow).toBeLessThanOrEqual(0);
      await restore?.();
    }
    await page.setViewportSize({ width: 412, height: 915 });
    // Onglet Progrès : le détail, une ligne par groupe avec « Ignorer ».
    await summary.click();
    await expect(page.getByRole('heading', { name: 'Progrès', exact: true })).toBeVisible();
    await expect(alerts(page).getByRole('link')).toHaveText([
      'Pectoraux : 0 série par semaine depuis 2 semaines (ta moyenne : 6)',
      'Dos : 0 série par semaine depuis 2 semaines (ta moyenne : 6)',
      'Épaules : 0 série par semaine depuis 2 semaines (ta moyenne : 4,5)',
    ]);
    await expect(alerts(page).getByRole('button', { name: /^Ignorer l’alerte/ })).toHaveCount(3);
    for (const [width, height, big] of SIZES) {
      await page.setViewportSize({ width, height });
      const restore = big ? await largeText(page) : null;
      // « (ta moyenne : 6) » d'un bloc (version 1.38.1) : jamais « 6) » seul en fin de ligne.
      const split = await alerts(page).getByRole('link').evaluateAll((links) =>
        links.filter((link) => {
          const node = [...link.querySelectorAll('span')].flatMap((e) => [...e.childNodes]).find((n) => n.nodeType === 3 && n.textContent!.includes('(ta'))!;
          const r = document.createRange();
          r.setStart(node, node.textContent!.indexOf('(ta'));
          r.setEnd(node, node.textContent!.length);
          return new Set([...r.getClientRects()].map((c) => Math.round(c.top))).size > 1;
        }).length,
      );
      expect(split, `${width} px${big ? ', texte à 115 %' : ''}`).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await restore?.();
    }
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto('./');
    // Avec un bilan prêt en plus : une seule pastille, les deux raisons pour le lecteur d'écran.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const open = indexedDB.open('myfitapp');
          open.onsuccess = () => {
            const tx = open.result.transaction('meta', 'readwrite');
            tx.objectStore('meta').delete('reportsSeen');
            tx.oncomplete = () => (open.result.close(), resolve());
          };
        }),
    );
    await reloadAfterWrites(page);
    await expect(tabBar(page).locator('.tab-badge')).toHaveCount(1);
    await expect(tabBar(page).getByRole('link', { name: 'Progrès : bilan prêt, groupe sous ta moyenne' })).toBeVisible();

    // Historique trop court (5 semaines terminées, du 5 oct.), le dos pourtant en baisse : ni ligne ni pastille.
    await open(page, { from: '2026-10-05' });
    await expect(alerts(page)).toHaveCount(0);
    await expect(tabBar(page).locator('.tab-badge')).toHaveCount(0);
    // Pectoraux en baisse une seule semaine : rien.
    await open(page, { dosDown: [] });
    await expect(alerts(page)).toHaveCount(0);

    // Cas le plus chargé (version 1.40.0), sans puis avec séance prévue : « Démarrer » entièrement à l'écran sans
    // défiler, au-dessus de la barre d'onglets, à 412, 360 et 320 px et à 360 px avec le texte à 115 % ; 48 px, 8 px,
    // rien ne dépasse.
    for (const withPlan of [false, true]) {
      await openLoaded(page, withPlan);
      const label = withPlan ? 'avec séance prévue' : 'sans séance prévue';
      await expect(page.locator('.activity-banner')).toContainText('Badminton lundi soir');
      await expect(page.getByTestId('weekly-recap').locator('.recap-cell')).toHaveCount(7);
      await expect(page.getByTestId('group-alerts-summary')).toHaveText('3 groupes sous ta moyenne : Pectoraux, Dos, Épaules');
      await expect(page.getByRole('button', { name: 'Compléter la séance de ce matin' })).toBeVisible();
      await expect(page.getByTestId('week-suggestion')).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: 'Pense à sauvegarder tes séances.' })).toBeVisible();
      await expect(page.getByRole('button', { name: withPlan ? 'Démarrer la séance prévue' : 'Démarrer une séance' })).toBeVisible();
      await expect(page.getByTestId('plan-summary')).toHaveCount(withPlan ? 1 : 0);
      for (const [width, height, big] of SIZES) {
        await page.setViewportSize({ width, height });
        const restore = big ? await largeText(page) : null;
        const l = await layout(page);
        const size = `${label}, ${width} × ${height} px${big ? ', texte à 115 %' : ''}`;
        expect(l, size).toMatchObject({ afterRecap: true, startVisible: true });
        expect(l.minHeight, size).toBeGreaterThanOrEqual(48);
        expect(l.closest, size).toBeGreaterThanOrEqual(8);
        expect(l.overflow, size).toBeLessThanOrEqual(0);
        await restore?.();
      }
      await page.setViewportSize({ width: 412, height: 915 });
    }
    // Avec 50 min de tapis dans la séance du matin (versions 1.41.0 et 1.41.1) : « Démarrer » à l'écran à toutes les
    // tailles. Le titre du récapitulatif n'est raccourci que s'il le faut : complet à 412 × 915, 360 × 800 et 360 × 800
    // avec le texte à 115 % (« Démarrer » y tient déjà) ; à 320 × 711, sans le cardio (puis sans les noms de jours si
    // besoin).
    for (const withPlan of [false, true]) {
      await openLoaded(page, withPlan, true);
      await expect(page.getByTestId('weekly-recap').locator('[data-group="jambes"]')).toHaveText('Jambes (1× · +50\u00a0min\u00a0cardio) · aujourd’hui');
      for (const [width, height, big] of SIZES) {
        await page.setViewportSize({ width, height });
        const restore = big ? await largeText(page) : null;
        const size = `avec cardio, ${withPlan ? 'avec' : 'sans'} séance prévue, ${width} × ${height} px${big ? ', texte à 115 %' : ''}`;
        const title = page.getByTestId('weekly-recap').getByRole('heading');
        // Forme attendue : la plus complète qui laisse « Démarrer » à l'écran.
        if (width === 320) await expect(title, size).not.toHaveAttribute('data-form', 'full');
        else await expect(title, size).toHaveAttribute('data-form', 'full');
        const form = await title.getAttribute('data-form');
        await expect(title, size).toHaveText(
          form === 'short' ? /^Semaine du 9 au 15\snov\.\s: 2\sséances$/ : /^Semaine du lun\.\s9 au dim\.\s15\snov\.\s: 2\sséances(\s·\s50\smin\sde cardio)?$/,
        );
        if (form === 'noCardio') await expect(title, size).not.toContainText('cardio');
        const l = await layout(page);
        expect(l, size).toMatchObject({ afterRecap: true, startVisible: true });
        expect(l.minHeight, size).toBeGreaterThanOrEqual(48);
        expect(l.closest, size).toBeGreaterThanOrEqual(8);
        expect(l.overflow, size).toBeLessThanOrEqual(0);
        await restore?.();
      }
      await page.setViewportSize({ width: 412, height: 915 });
    }
    // Sans cardio, rien à raccourcir à 320 × 711 si « Démarrer » tient déjà : titre complet.
    await openLoaded(page, false);
    await page.setViewportSize({ width: 320, height: 711 });
    await expect(page.getByTestId('weekly-recap').getByRole('heading')).toHaveAttribute('data-form', 'full');
    await page.setViewportSize({ width: 412, height: 915 });
  });
});
