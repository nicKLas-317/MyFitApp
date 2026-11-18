import { expect, test, type Page } from '@playwright/test';
import { ALERT_NOW, alertHistory, type AlertScenario } from '../src/analysis/__tests__/alertes-simulation';
import type { Session, SessionPlan } from '../src/domain/types';
import { defaultSessionName } from '../src/session/format';
import { openSettingsSection, reloadAfterWrites, tabBar, writeSessions } from './helpers';

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
 * Géométrie de l'accueil : hauteurs et écarts des éléments tactiles, débordement, alerte juste sous le récapitulatif,
 * « Démarrer » (ou « Démarrer la séance prévue ») entièrement au-dessus de la barre
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
    const list = document.querySelector('[data-testid="group-alerts"]');
    const start = [...document.querySelectorAll('main button')].find((b) => b.textContent?.startsWith('Démarrer'))!;
    const nav = document.querySelector('nav')!.getBoundingClientRect();
    return {
      minHeight: Math.min(...taps.map((r) => r.height)),
      closest,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      afterRecap: !list || recap.nextElementSibling === list,
      startVisible: start.getBoundingClientRect().bottom <= nav.top,
      /** De combien « Démarrer » dépasse sous la barre d'onglets (négatif : marge restante), pour le message d'échec. */
      startExcess: Math.round(start.getBoundingClientRect().bottom - nav.top),
      fontSize: list ? getComputedStyle(list.querySelector('li') ?? list).fontSize : null,
    };
  });
}

/** Tailles contrôlées : largeur, hauteur de l'écran, texte agrandi. */
// 320 px : un écran de 360 × 800 avec la taille d’affichage agrandie d’Android (× 1,125) donne 320 × 711.
const SIZES = [[412, 915, false], [360, 800, false], [320, 711, false], [360, 800, true]] as const;

/**
 * Cas le plus chargé de l'accueil (version 1.40.0), mercredi 11 nov. 12 h : question du badminton de lundi, 7 groupes au
 * récapitulatif, une alerte (vacances les deux dernières semaines : tous les groupes sous le seuil, une seule ligne
 * depuis la version 1.51.0 ; avant, une ligne de résumé pour 3 groupes), séance du matin à compléter, séance pour compléter la
 * semaine, rappel de sauvegarde ; avec ou sans séance prévue. Version 1.45.0 : la séance du matin a quatre exercices de
 * jambes (12 séries : un nombre à deux chiffres dans la case, « Jambes (12 séries) · aujourd’hui »). `cardio` (version
 * 1.41.0) : 50 min de tapis en plus dans la séance du matin, « Jambes (15 séries · +50 min cardio) · aujourd’hui » et
 * « · 50 min de cardio » dans l'en-tête.
 */
async function openLoaded(page: Page, withPlan: boolean, cardio = false): Promise<void> {
  await open(page, { vacations: ['2026-10-26', '2026-11-02'], dosDown: [], pecDown: [] });
  const t = new Date(2026, 10, 11, 8).getTime();
  const morning: Session = {
    id: 'matin-11', name: defaultSessionName(t), date: '2026-11-11', startedAt: t, endedAt: t + 3_600_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: ['presse-a-cuisses', 'leg-extension', 'leg-curl', 'adducteurs-machine'].map((variantId) => (
      { variantId, weightKg: 60, targetReps: 10, plannedSets: 3, reps: [10, 10, 10], feeling: 'bien' as const }
    )),
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
          meta.put({ groups: ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux'], redSets: 10 }, 'weeklyRecap');
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
  test('291. Ligne discrète sous le récapitulatif et pastille sur Progrès ; un appui ouvre les séries du groupe ; « Ignorer » jusqu’à la semaine suivante encore sous le seuil, le groupe suivant à sa place ; une seule ligne ; une semaine terminée seulement : rien ; cas le plus chargé : « Démarrer » à l’écran sans défiler', async ({ page }) => {
    // Dos sous 6 séries 2 semaines, pectoraux 1 semaine seulement, vacances fin septembre : le dos seul.
    await open(page);
    const line = alerts(page).getByRole('listitem');
    await expect(line).toHaveCount(1);
    await expect(line).toHaveAttribute('data-group', 'dos');
    // Ses chiffres (version 1.51.0) : les séries des 2 semaines, la plus ancienne d'abord, et le seuil.
    await expect(line.getByRole('link')).toHaveText('Dos : 3 et 3 séries ces 2 semaines (sous 6)');
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
    await expect(tabBar(page).getByRole('link', { name: 'Progrès : groupe moins travaillé' })).toBeVisible();
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
    // Mêmes séries que l'alerte : 3 et 3 les deux dernières semaines terminées (sans activité ni cardio, le graphique
    // et le score du récapitulatif sont égaux).
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
    await expect(alerts(page).getByRole('link')).toHaveText('Dos : 3 et 3 séries ces 2 semaines (sous 6)');

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

    // Une semaine plus tard, le dos encore sous le seuil : l'alerte revient.
    const later = new Date(2026, 10, 18, 12).getTime();
    await page.clock.setFixedTime(new Date(later));
    await writeSessions(page, alertHistory({ until: '2026-11-16', dosDown: ['2026-10-26', '2026-11-02', '2026-11-09'] }));
    await reloadAfterWrites(page);
    await expect(alerts(page).getByRole('link')).toHaveText('Dos : 3 et 3 séries ces 2 semaines (sous 6)');
    await expect(tabBar(page).getByTestId('group-alert-badge')).toBeVisible();

    // Vacances les deux dernières semaines : tous les groupes sous le seuil, une seule ligne (version 1.51.0 ; avant, une
    // ligne de résumé « 3 groupes sous ta moyenne ») : le plus bas, à égalité l'ordre des groupes, les pectoraux.
    await open(page, { vacations: ['2026-10-26', '2026-11-02'], dosDown: [], pecDown: [] });
    await expect(page.getByTestId('group-alerts-summary')).toHaveCount(0);
    await expect(alerts(page).getByRole('listitem')).toHaveCount(1);
    await expect(alerts(page).getByRole('link')).toHaveText('Pectoraux : 0 et 0 série ces 2 semaines (sous 6)');
    for (const [width, height, big] of SIZES) {
      await page.setViewportSize({ width, height });
      const restore = big ? await largeText(page) : null;
      const l = await layout(page);
      expect(l, `${width} px${big ? ', texte à 115 %' : ''}`).toMatchObject({ afterRecap: true, startVisible: true });
      expect(l.minHeight).toBeGreaterThanOrEqual(48);
      expect(l.closest).toBeGreaterThanOrEqual(8);
      expect(l.overflow).toBeLessThanOrEqual(0);
      // « (sous 6) » d'un bloc : jamais « 6) » seul en fin de ligne.
      const split = await alerts(page).getByRole('link').evaluateAll((links) =>
        links.filter((link) => {
          const node = [...link.querySelectorAll('span')].flatMap((e) => [...e.childNodes]).find((n) => n.nodeType === 3 && n.textContent!.includes('(sous'))!;
          const r = document.createRange();
          r.setStart(node, node.textContent!.indexOf('(sous'));
          r.setEnd(node, node.textContent!.length);
          return new Set([...r.getClientRects()].map((c) => Math.round(c.top))).size > 1;
        }).length,
      );
      expect(split, `${width} px${big ? ', texte à 115 %' : ''}`).toBe(0);
      await restore?.();
    }
    await page.setViewportSize({ width: 412, height: 915 });
    // Onglet Progrès : la même ligne ; ignorée, le groupe suivant prend sa place (le dos), puis les épaules.
    await tabBar(page).getByRole('link', { name: /^Progrès/ }).click();
    await expect(page.getByRole('heading', { name: 'Progrès', exact: true })).toBeVisible();
    await expect(alerts(page).getByRole('link')).toHaveText('Pectoraux : 0 et 0 série ces 2 semaines (sous 6)');
    await alerts(page).getByRole('button', { name: 'Ignorer l’alerte : Pectoraux' }).click();
    await expect(alerts(page).getByRole('link')).toHaveText('Dos : 0 et 0 série ces 2 semaines (sous 6)');
    await alerts(page).getByRole('button', { name: 'Ignorer l’alerte : Dos' }).click();
    await expect(alerts(page).getByRole('link')).toHaveText('Épaules : 0 et 0 série ces 2 semaines (sous 6)');
    await expect(tabBar(page).getByTestId('group-alert-badge')).toBeVisible();
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
    await expect(tabBar(page).getByRole('link', { name: 'Progrès : bilan prêt, groupe moins travaillé' })).toBeVisible();

    // Une seule semaine terminée (première séance le 2 nov.), le dos pourtant à 3 : ni ligne ni pastille ; dès 2
    // semaines terminées (première séance le 26 oct.), l'alerte (version 1.51.0 : plus de 6 semaines ni de référence).
    await open(page, { from: '2026-11-02' });
    await expect(alerts(page)).toHaveCount(0);
    await expect(tabBar(page).locator('.tab-badge')).toHaveCount(0);
    await open(page, { from: '2026-10-26' });
    await expect(alerts(page).getByRole('link')).toHaveText('Dos : 3 et 3 séries ces 2 semaines (sous 6)');
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
      await expect(page.getByTestId('weekly-recap').locator('.recap-cell[data-group]')).toHaveCount(7);
      await expect(page.getByTestId('weekly-recap').locator('[data-group="jambes"]')).toHaveText('Jambes (12\u00a0séries) · aujourd’hui');
      await expect(alerts(page).getByRole('link')).toHaveText('Pectoraux : 0 et 0 série ces 2 semaines (sous 6)');
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
        expect(l, `${size} ${JSON.stringify(l)}`).toMatchObject({ afterRecap: true, startVisible: true });
        expect(l.minHeight, size).toBeGreaterThanOrEqual(48);
        expect(l.closest, size).toBeGreaterThanOrEqual(8);
        expect(l.overflow, size).toBeLessThanOrEqual(0);
        await restore?.();
      }
      await page.setViewportSize({ width: 412, height: 915 });
    }
    // Avec 50 min de tapis dans la séance du matin (versions 1.41.0 et 1.41.1) : « Démarrer » à l'écran à toutes les
    // tailles. Le titre du récapitulatif n'est raccourci que s'il le faut : complet à 412 × 915, 360 × 800 et 360 × 800
    // avec le texte à 115 % (« Démarrer » y tient déjà) ; à 320 × 711, sans le cardio, puis sans les noms de jours, puis
    // (version 1.45.0, forme « compact ») la case Jambes sans « +50 min cardio ».
    for (const withPlan of [false, true]) {
      await openLoaded(page, withPlan, true);
      await expect(page.getByTestId('weekly-recap').locator('[data-group="jambes"]')).toHaveText('Jambes (15\u00a0séries · +50\u00a0min\u00a0cardio) · aujourd’hui');
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
          form === 'short' || form === 'compact' ? /^Semaine du 9 au 15\snov\.\s: 2\sséances$/ : /^Semaine du lun\.\s9 au dim\.\s15\snov\.\s: 2\sséances(\s·\s50\smin\sde cardio)?$/,
        );
        if (form === 'noCardio') await expect(title, size).not.toContainText('cardio');
        // Forme « compact » (version 1.45.0) : la case Jambes sans la mention du cardio (ses 3 séries restent comptées).
        await expect(page.getByTestId('weekly-recap').locator('[data-group="jambes"]'), size).toHaveText(
          form === 'compact' ? 'Jambes (15\u00a0séries) · aujourd’hui' : 'Jambes (15\u00a0séries · +50\u00a0min\u00a0cardio) · aujourd’hui',
        );
        if (width !== 320) expect(form, size).not.toBe('compact');
        const l = await layout(page);
        expect(l, `${size} ${JSON.stringify(l)}`).toMatchObject({ afterRecap: true, startVisible: true });
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
  test('319. Seuil de l’alerte réglable (6 par défaut, de 3 à 9), strictement sous le seuil les 2 semaines ; score du récapitulatif : une activité du groupe compte ; abdominaux jamais', async ({ page }) => {
    await open(page);
    await expect(alerts(page).getByRole('link')).toHaveText('Dos : 3 et 3 séries ces 2 semaines (sous 6)');
    const readRecap = () =>
      page.evaluate(
        () =>
          new Promise<unknown>((resolve) => {
            const open = indexedDB.open('myfitapp');
            open.onsuccess = () => {
              const req = open.result.transaction('meta').objectStore('meta').get('weeklyRecap');
              req.onsuccess = () => (open.result.close(), resolve(req.result));
            };
          }),
      );

    // Réglages › Récapitulatif de la semaine : 6 par défaut ; − jusqu'à 3 (bloqué), + jusqu'à 9 (bloqué).
    await page.goto('./#/reglages');
    const section = await openSettingsSection(page, 'Récapitulatif de la semaine');
    const name = 'Alerte « moins travaillé » sous (séries)';
    const stepper = section.getByRole('group', { name });
    await expect(stepper).toContainText(name);
    const value = stepper.locator('output');
    const minus = stepper.getByRole('button', { name: `${name} : moins` });
    const plus = stepper.getByRole('button', { name: `${name} : plus` });
    await expect(value).toHaveText('6');
    for (let v = 5; v >= 3; v--) {
      await minus.click();
      await expect(value).toHaveText(String(v));
    }
    await expect(minus).toBeDisabled();
    await expect(plus).toBeEnabled();
    await expect.poll(readRecap).toMatchObject({ redSets: 10, alertSets: 3 });
    // À 3, le dos (3 et 3) n'est plus strictement sous le seuil : plus d'alerte, plus de pastille.
    await page.goto('./');
    await expect(page.getByTestId('weekly-recap')).toBeVisible();
    await expect(alerts(page)).toHaveCount(0);
    await expect(tabBar(page).locator('.tab-badge')).toHaveCount(0);
    await page.goto('./#/reglages');
    const again = await openSettingsSection(page, 'Récapitulatif de la semaine');
    for (let v = 4; v <= 9; v++) {
      await again.getByRole('button', { name: `${name} : plus` }).click();
      await expect(again.getByRole('group', { name }).locator('output')).toHaveText(String(v));
    }
    await expect(again.getByRole('button', { name: `${name} : plus` })).toBeDisabled();
    await expect.poll(readRecap).toMatchObject({ alertSets: 9 });
    // Éléments tactiles et largeur, à 412, 360 et 320 px et avec le texte à 115 % : rien ne dépasse, 48 px.
    for (const [width, height, big] of SIZES) {
      await page.setViewportSize({ width, height });
      const restore = big ? await largeText(page) : null;
      const box = await again.getByRole('group', { name }).evaluate((g) => {
        const r = g.getBoundingClientRect();
        return { right: r.right, buttons: [...g.querySelectorAll('button')].map((b) => b.getBoundingClientRect().height) };
      });
      expect(box.right, `${width} px`).toBeLessThanOrEqual(width);
      for (const h of box.buttons) expect(h).toBeGreaterThanOrEqual(48);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await restore?.();
    }
    await page.setViewportSize({ width: 412, height: 915 });
    // À 9 : tous les groupes sont sous le seuil ; une seule ligne, le plus bas (le dos, 3 + 3).
    await page.goto('./');
    await expect(alerts(page).getByRole('listitem')).toHaveCount(1);
    await expect(alerts(page).getByRole('link')).toHaveText('Dos : 3 et 3 séries ces 2 semaines (sous 9)');

    // Score du récapitulatif (version 1.51.0) : une escalade (dos) chaque semaine en baisse, 3 + 3 = 6 séries, plus
    // d'alerte au seuil de 6 ; le graphique, lui, n'a que les séries (3 et 3).
    await open(page);
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('myfitapp');
          open.onsuccess = () => {
            const tx = open.result.transaction('meta', 'readwrite');
            const climb = (date: string) => ({ id: `act-escalade-${date}`, habitId: 'escalade', date, name: 'Escalade', start: '10:00', end: '11:30', groups: ['dos'], status: 'done', answeredAt: 0 });
            tx.objectStore('meta').put([climb('2026-10-31'), climb('2026-11-07')], 'activities');
            tx.objectStore('meta').put({ groups: ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes'], redSets: 10, alertSets: 6 }, 'weeklyRecap');
            tx.oncomplete = () => (open.result.close(), resolve());
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await reloadAfterWrites(page);
    await expect(page.getByTestId('weekly-recap')).toBeVisible();
    await expect(alerts(page)).toHaveCount(0);
    await expect(tabBar(page).locator('.tab-badge')).toHaveCount(0);

    // Abdominaux au récapitulatif, jamais travaillés (0 chaque semaine), les autres groupes à 6 ou plus : aucune alerte.
    await open(page, { dosDown: [], pecDown: [] });
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('myfitapp');
          open.onsuccess = () => {
            const tx = open.result.transaction('meta', 'readwrite');
            tx.objectStore('meta').put({ groups: ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux'], redSets: 10, alertSets: 6 }, 'weeklyRecap');
            tx.oncomplete = () => (open.result.close(), resolve());
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await reloadAfterWrites(page);
    await expect(page.getByTestId('weekly-recap').locator('.recap-cell[data-group="abdominaux"]')).toHaveText('Abdominaux');
    await expect(alerts(page)).toHaveCount(0);
  });
});
