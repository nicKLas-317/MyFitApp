import { expect, test } from '@playwright/test';
import { ALERT_NOW, alertHistory } from '../src/analysis/__tests__/alertes-simulation';
import { alerts, largeText, layout, open, openLoaded, SIZES, THREE_DOWN, THREE_TEXT } from './alertes-accueil';
import { openSettingsSection, reloadAfterWrites, tabBar, writeSessions } from './helpers';

test.describe('Alerte « groupe moins travaillé »', () => {
  test('291. Bandeau jaune sous le récapitulatif (version 1.52.0) et pastille sur Progrès ; un appui ouvre les séries du groupe ; croix « Ignorer » jusqu’à la semaine suivante encore sous le seuil ; plusieurs groupes dans un seul bandeau (version 1.52.1), la croix les masque tous ; une semaine terminée seulement : rien ; cas le plus chargé : « Démarrer » à l’écran sans défiler', async ({ page }) => {
    // Dos sous 6 séries 2 semaines, pectoraux 1 semaine seulement, vacances fin septembre : le dos seul.
    await open(page);
    const line = alerts(page).getByRole('listitem');
    await expect(line).toHaveCount(1);
    await expect(line).toHaveAttribute('data-group', 'dos');
    // Ses chiffres (version 1.51.0) : les séries des 2 semaines, la plus ancienne d'abord, et le seuil.
    await expect(line.getByRole('link')).toHaveText('Dos : 3 et 3 séries ces 2 semaines (sous 6)');
    // Sans soulignement, seul le nom en gras ; tout le texte est le lien.
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
    // Bandeau (version 1.52.0) : fond jaune, texte foncé (contraste AA au moins), coins arrondis, icône d'avertissement
    // à gauche, croix « Ignorer » à droite dans le bandeau (sans texte visible, nommée pour le lecteur d'écran, 48 px).
    const ignore = line.getByRole('button', { name: 'Ignorer l’alerte : Dos' });
    await expect(ignore).toHaveText('');
    const banner = await line.evaluate((li) => {
      const rgb = (c: string) => c.match(/\d+/g)!.slice(0, 3).map(Number);
      const lum = (c: string) => {
        const [r, g, b] = rgb(c).map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      const ratio = (a: string, b: string) => {
        const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
        return (x! + 0.05) / (y! + 0.05);
      };
      const style = getComputedStyle(li);
      const box = li.getBoundingClientRect();
      const icon = li.querySelector('.group-alert-icon')!.getBoundingClientRect();
      const link = li.querySelector('a')!;
      const cross = li.querySelector('button')!.getBoundingClientRect();
      return {
        background: style.backgroundColor,
        radius: style.borderTopLeftRadius,
        text: ratio(getComputedStyle(link).color, style.backgroundColor) >= 4.5 && ratio(getComputedStyle(link.querySelector('strong')!).color, style.backgroundColor) >= 4.5,
        cross: ratio(getComputedStyle(li.querySelector('button')!).color, style.backgroundColor) >= 3,
        iconLeft: icon.left >= box.left && icon.right <= link.querySelector('span')!.getBoundingClientRect().left,
        crossRight: cross.right <= box.right + 0.5 && cross.left >= link.getBoundingClientRect().right,
        crossSize: [Math.round(cross.width), Math.round(cross.height)],
      };
    });
    expect(banner).toEqual({ background: 'rgb(247, 208, 70)', radius: '14px', text: true, cross: true, iconLeft: true, crossRight: true, crossSize: [48, 48] });
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
      // Texte du bandeau en 13 px sous 340 px de large (version 1.52.1), 15 px sinon.
      expect(l.fontSize).toBe(big ? '17.25px' : width < 340 ? '13px' : '15px');
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

    // Plusieurs groupes en alerte (version 1.52.1) : un seul bandeau les cite tous, du plus bas au plus haut, « sous 6
    // séries ces 2 semaines » ; l'appui mène aux séries du premier, la croix les masque tous.
    await open(page, { dosDown: [] }, ALERT_NOW, THREE_DOWN);
    await expect(page.getByTestId('group-alerts-summary')).toHaveCount(0);
    await expect(alerts(page).getByRole('listitem')).toHaveCount(1);
    await expect(alerts(page).getByRole('link')).toHaveText(THREE_TEXT);
    await expect(alerts(page).getByRole('link')).toHaveAttribute('href', '#/bilan-groupes/epaules/series');
    await expect(alerts(page).getByRole('link').locator('strong')).toHaveText('Épaules, Triceps, Pectoraux');
    for (const [width, height, big] of SIZES) {
      await page.setViewportSize({ width, height });
      const restore = big ? await largeText(page) : null;
      const l = await layout(page);
      expect(l, `${width} px${big ? ', texte à 115 %' : ''}`).toMatchObject({ afterRecap: true, startVisible: true });
      expect(l.minHeight).toBeGreaterThanOrEqual(48);
      expect(l.closest).toBeGreaterThanOrEqual(8);
      expect(l.overflow).toBeLessThanOrEqual(0);
      // Version 1.52.1 : 13 px sous 340 px de large, 15 px sinon (texte agrandi : 115 %).
      expect(l.fontSize, `${width} px`).toBe(big ? '17.25px' : width < 340 ? '13px' : '15px');
      // « sous 6 séries » d'un bloc : jamais « séries » seul en début de ligne.
      const split = await alerts(page).getByRole('link').evaluateAll((links) =>
        links.filter((link) => {
          const node = [...link.querySelectorAll('span')].flatMap((e) => [...e.childNodes]).find((n) => n.nodeType === 3 && n.textContent!.includes('sous'))!;
          const r = document.createRange();
          r.setStart(node, node.textContent!.indexOf('sous'));
          r.setEnd(node, node.textContent!.indexOf('séries') + 'séries'.length);
          return new Set([...r.getClientRects()].map((c) => Math.round(c.top))).size > 1;
        }).length,
      );
      expect(split, `${width} px${big ? ', texte à 115 %' : ''}`).toBe(0);
      await restore?.();
    }
    await page.setViewportSize({ width: 412, height: 915 });
    // Onglet Progrès : le même bandeau ; la croix masque l'alerte des trois groupes à la fois (méta `groupAlertsIgnored`).
    await tabBar(page).getByRole('link', { name: /^Progrès/ }).click();
    await expect(page.getByRole('heading', { name: 'Progrès', exact: true })).toBeVisible();
    await expect(alerts(page).getByRole('link')).toHaveText(THREE_TEXT);
    await alerts(page).getByRole('button', { name: 'Ignorer l’alerte : Épaules, Triceps, Pectoraux' }).click();
    await expect(alerts(page)).toHaveCount(0);
    await expect(tabBar(page).getByTestId('group-alert-badge')).toHaveCount(0);
    expect(await page.evaluate(() => new Promise((resolve) => {
      const open = indexedDB.open('myfitapp');
      open.onsuccess = () => {
        const req = open.result.transaction('meta').objectStore('meta').get('groupAlertsIgnored');
        req.onsuccess = () => (open.result.close(), resolve(req.result));
      };
    }))).toEqual({ epaules: '2026-11-02', triceps: '2026-11-02', pectoraux: '2026-11-02' });
    // Vacances les deux dernières semaines : les six groupes dans le même bandeau (ni abdominaux, ni ligne de résumé).
    await open(page, { vacations: ['2026-10-26', '2026-11-02'], dosDown: [], pecDown: [] });
    await expect(alerts(page).getByRole('link')).toHaveText('Pectoraux, Dos, Épaules, Biceps, Triceps, Jambes : sous 6 séries ces 2 semaines');
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
      await expect(alerts(page).getByRole('link')).toHaveText(THREE_TEXT);
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
        // Version 1.52.1 : avec 3 groupes cités, à 360 px et texte à 115 %, le bandeau fait 3 lignes : le titre perd
        // « · 50 min de cardio » (repli du §19.6, le cardio reste dans la case Jambes) pour garder « Démarrer » à l'écran.
        if (width === 320) await expect(title, size).not.toHaveAttribute('data-form', 'full');
        else if (big) await expect(title, size).toHaveAttribute('data-form', 'noCardio');
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
    // Sans cardio, à 320 × 711 (version 1.52.1, choix de l'utilisateur) : avec 3 groupes cités, le bandeau fait 55 px et
    // le titre perd les noms de jours (repli du §19.6) pour que « Démarrer » tienne ; complet à 412 et 360 px.
    await openLoaded(page, false);
    await page.setViewportSize({ width: 320, height: 711 });
    const shortTitle = page.getByTestId('weekly-recap').getByRole('heading');
    await expect(shortTitle).not.toHaveAttribute('data-form', 'full');
    await expect(shortTitle).toHaveText(/^Semaine du 9 au 15\snov\.\s: 2\sséances$/);
    expect(await layout(page)).toMatchObject({ startVisible: true });
    for (const [width, height] of [[412, 915], [360, 800]] as const) {
      await page.setViewportSize({ width, height });
      await expect(shortTitle, `${width} px`).toHaveAttribute('data-form', 'full');
    }
    await page.setViewportSize({ width: 412, height: 915 });
  });
  test('319. Seuil de l’alerte réglable (6 par défaut, de 3 à 9), strictement sous le seuil les 2 semaines ; score du récapitulatif : une activité du groupe compte ; abdominaux jamais ; même bandeau sur l’accueil et dans Progrès (version 1.52.0) ; plusieurs groupes dans un seul bandeau, ligne du bilan de la semaine (version 1.52.1)', async ({ page }) => {
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
    // À 9 : tous les groupes sont sous le seuil ; un seul bandeau les cite tous, du plus bas au plus haut (version 1.52.1).
    await page.goto('./');
    await expect(alerts(page).getByRole('listitem')).toHaveCount(1);
    await expect(alerts(page).getByRole('link')).toHaveText('Dos, Pectoraux, Triceps, Jambes, Épaules, Biceps : sous 9 séries ces 2 semaines');
    await expect(alerts(page).getByRole('link')).toHaveAttribute('href', '#/bilan-groupes/dos/series');
    // Même bandeau sur l'accueil et dans Progrès (version 1.52.0) : fond, texte, coins, icône et croix identiques.
    const look = () =>
      alerts(page).getByRole('listitem').evaluate((li) => {
        const s = getComputedStyle(li);
        const b = li.querySelector('button')!;
        return {
          background: s.backgroundColor, color: getComputedStyle(li.querySelector('a')!).color, radius: s.borderTopLeftRadius, padding: s.padding,
          icon: li.querySelectorAll('.group-alert-icon').length, cross: [b.getAttribute('aria-label'), b.textContent, Math.round(b.getBoundingClientRect().width), Math.round(b.getBoundingClientRect().height)],
        };
      });
    const home = await look();
    expect(home).toMatchObject({ icon: 1, cross: ['Ignorer l’alerte : Dos, Pectoraux, Triceps, Jambes, Épaules, Biceps', '', 48, 48] });
    await tabBar(page).getByRole('link', { name: /^Progrès/ }).click();
    await expect(page.getByRole('heading', { name: 'Progrès', exact: true })).toBeVisible();
    expect(await look()).toEqual(home);
    // La croix masque l'alerte des six groupes à la fois.
    await alerts(page).getByRole('button', { name: 'Ignorer l’alerte : Dos, Pectoraux, Triceps, Jambes, Épaules, Biceps' }).click();
    await expect(alerts(page)).toHaveCount(0);
    await expect(tabBar(page).locator('.tab-badge')).toHaveCount(0);

    // Bilan de la semaine terminée du 2 nov. (version 1.52.1) : la ligne de l'alerte sous les groupes, même ignorée, sans
    // fond jaune, au format du bandeau avec les séries de chaque groupe ; aussi dans le texte du mail.
    await page.goto('./#/bilan-periode/semaine/2026-11-02');
    const reportAlert = page.getByRole('region', { name: 'Groupes travaillés' }).getByTestId('groups-alert');
    const detail = 'Dos, Pectoraux, Triceps, Jambes, Épaules, Biceps : sous 9 séries ces 2 semaines (Dos 3 et 3, Pectoraux 6 et 3, Triceps 6 et 6, Jambes 6 et 6, Épaules 7,5 et 7,5, Biceps 7,5 et 7,5)';
    await expect(reportAlert).toHaveText(detail);
    await expect(reportAlert.locator('strong')).toHaveText('Dos, Pectoraux, Triceps, Jambes, Épaules, Biceps');
    await expect(reportAlert.locator('.group-alert-icon')).toHaveCount(1);
    expect(await reportAlert.evaluate((p) => [getComputedStyle(p).backgroundColor, getComputedStyle(p).fontSize])).toEqual(['rgba(0, 0, 0, 0)', '15px']);
    // Sous le tableau des groupes, dans la même section.
    expect(await reportAlert.evaluate((p) => p.previousElementSibling?.matches('table, .groups-cardio'))).toBe(true);
    await expect(page.getByTestId('report-text')).toContainText(`\n- ${detail}\n`);
    // Rien pour la semaine en cours, ni dans le bilan du mois.
    for (const route of ['semaine/2026-11-09', 'mois/2026-10', 'mois/2026-11']) {
      await page.goto(`./#/bilan-periode/${route}`);
      await expect(page.getByTestId('report-title')).toBeVisible();
      await expect(page.getByTestId('groups-alert'), route).toHaveCount(0);
      await expect(page.getByTestId('report-text'), route).not.toContainText('ces 2 semaines');
    }


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
