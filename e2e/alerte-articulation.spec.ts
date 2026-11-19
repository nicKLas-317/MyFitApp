import { expect, test, type Page } from '@playwright/test';
import { alertHistory } from '../src/analysis/__tests__/alertes-simulation';
import { ELBOW_EXTRA, JOINT_NOW, jointHistory, withExercises } from '../src/analysis/__tests__/articulations-simulation';
import { alerts, largeText, layout, openLoaded, openSessions, SIZES, THREE_DOWN } from './alertes-accueil';
import { reloadAfterWrites, tabBar } from './helpers';

/**
 * Alerte « articulation trop sollicitée » (§19.14, version 1.53.0). Données : `articulations-simulation.ts`, base
 * complète (chaque groupe du récapitulatif à 6 séries : aucune alerte « groupe moins travaillé »), épaule 12, coude 12,
 * genou 6 par semaine ; la semaine du 9 nov. avec quatre exercices de plus pour le coude : 24 contre 12.
 */
const joints = (page: Page) => page.getByTestId('joint-alerts');
/** Épaule (+9 : élévations latérales machine, oiseau, face pull) et genou (+6 : leg curl, squat kettlebell) en plus. */
const ALL_THREE = [...ELBOW_EXTRA, 'elevations-laterales-machine', 'oiseau', 'face-pull', 'leg-curl', 'squat-kettlebell'];

function ignoredJoints(page: Page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('myfitapp');
        open.onsuccess = () => {
          const req = open.result.transaction('meta').objectStore('meta').get('jointAlertsIgnored');
          req.onsuccess = () => (open.result.close(), resolve(req.result));
        };
      }),
  );
}

/** Apparence du bandeau : couleurs, contrastes, coins, icône, croix, taille du texte, pas de lien. */
function look(page: Page) {
  return joints(page)
    .getByRole('listitem')
    .evaluate((li) => {
      const rgb = (c: string) => c.match(/\d+/g)!.slice(0, 3).map(Number);
      const lum = (c: string) => {
        const [r, g, b] = rgb(c).map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      const ratio = (a: string, b: string) => {
        const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
        return (x! + 0.05) / (y! + 0.05);
      };
      const s = getComputedStyle(li);
      const cross = li.querySelector('button')!;
      const box = cross.getBoundingClientRect();
      const r = li.getBoundingClientRect();
      const icon = li.querySelector('.group-alert-icon')!;
      return {
        bg: s.backgroundColor,
        color: s.color,
        contrast: ratio(s.color, s.backgroundColor) >= 4.5,
        crossContrast: ratio(getComputedStyle(cross).color, s.backgroundColor) >= 3,
        radius: s.borderTopLeftRadius,
        // Icône : un cercle (pas le triangle du bandeau jaune), à gauche du texte.
        circleIcon: icon.querySelector('circle[r="9.6"]') !== null && icon.querySelector('path[d^="M12 2.5"]') === null,
        iconLeft: icon.getBoundingClientRect().left < li.querySelector('strong')!.getBoundingClientRect().left,
        cross: [Math.round(box.width), Math.round(box.height)],
        crossInside: box.right <= r.right + 0.5 && box.left >= r.left,
        crossText: cross.textContent,
        links: li.querySelectorAll('a').length,
        bold: getComputedStyle(li.querySelector('strong')!).fontWeight,
        fontSize: s.fontSize,
      };
    });
}

test.describe('Alerte « articulation trop sollicitée »', () => {
  test('323. Bandeau lavande sous le récapitulatif (et sous le bandeau jaune), dans Progrès, pastille ; texte court ; croix jusqu’au lundi suivant ; ligne du bilan de la semaine et du mail, même ignorée ; plusieurs articulations ; muette avant 4 semaines', async ({ page }) => {
    // Lundi 16 nov. 9 h, la semaine du 9 avec quatre exercices de plus pour le coude, 24 séries contre 12 : le coude.
    // Le lundi suivant, la semaine du 16 encore en hausse (24 contre 15).
    await openSessions(page, jointHistory({ full: true, until: '2026-11-23', extra: { '2026-11-09': ELBOW_EXTRA, '2026-11-16': ELBOW_EXTRA } }), JOINT_NOW);
    await expect(alerts(page)).toHaveCount(0);
    const line = joints(page).getByRole('listitem');
    await expect(line).toHaveCount(1);
    await expect(line).toHaveAttribute('data-joints', 'coude');
    // Texte court (choix de l'utilisateur) : les chiffres, la moyenne arrondie, ni conseil ni « semaine dernière ».
    await expect(line).toHaveText('Coude : 24 séries contre 12 d’habitude');
    await expect(line.locator('strong')).toHaveText('Coude');
    const cross = line.getByRole('button', { name: 'Ignorer l’alerte : Coude' });
    await expect(cross).toBeVisible();
    // Juste sous le récapitulatif.
    expect(await page.evaluate(() => document.querySelector('[data-testid="weekly-recap"]')!.nextElementSibling?.getAttribute('data-testid'))).toBe('joint-alerts');
    const home = await look(page);
    expect(home).toEqual({
      bg: 'rgb(196, 181, 253)', color: 'rgb(30, 16, 54)', contrast: true, crossContrast: true, radius: '14px', circleIcon: true, iconLeft: true,
      cross: [48, 48], crossInside: true, crossText: '', links: 0, bold: '700', fontSize: '15px',
    });
    await expect(tabBar(page).getByRole('link', { name: 'Progrès : articulation trop sollicitée' })).toBeVisible();
    // Aux quatre tailles : rien ne dépasse, 48 px, 8 px, « Démarrer » à l'écran ; 13 px sous 340 px de large.
    for (const [width, height, big] of SIZES) {
      await page.setViewportSize({ width, height });
      const restore = big ? await largeText(page) : null;
      const l = await layout(page);
      expect(l, `${width} ${big}`).toMatchObject({ overflow: 0, startVisible: true });
      expect(l.minHeight, `${width} ${big}`).toBeGreaterThanOrEqual(48);
      expect(l.closest, `${width} ${big}`).toBeGreaterThanOrEqual(8);
      expect((await look(page)).fontSize, `${width} ${big}`).toBe(width < 340 ? '13px' : big ? '17.25px' : '15px');
      await restore?.();
    }
    await page.setViewportSize({ width: 412, height: 915 });

    // Onglet Progrès : le même bandeau.
    await tabBar(page).getByRole('link', { name: /^Progrès/ }).click();
    await expect(page.getByRole('heading', { name: 'Progrès', exact: true })).toBeVisible();
    await expect(joints(page).getByRole('listitem')).toHaveText('Coude : 24 séries contre 12 d’habitude');
    expect(await look(page)).toEqual(home);

    // La croix : bandeau et pastille disparus, même après relance (méta `jointAlertsIgnored`).
    await joints(page).getByRole('button', { name: 'Ignorer l’alerte : Coude' }).click();
    await expect(joints(page)).toHaveCount(0);
    await expect(tabBar(page).locator('.tab-badge')).toHaveCount(0);
    await page.goto('./');
    await reloadAfterWrites(page);
    await expect(page.getByTestId('weekly-recap')).toBeVisible();
    await expect(joints(page)).toHaveCount(0);
    expect(await ignoredJoints(page)).toEqual({ coude: '2026-11-09' });

    // Bilan de la semaine du 9 nov. : la ligne complète, avec le conseil, même ignorée ; sans fond, 15 px, icône ; aussi
    // dans le texte du mail.
    const full = 'Coude : forte hausse cette semaine (24 séries contre 12 d’habitude). Échauffe-toi bien et surveille les douleurs.';
    await page.goto('./#/bilan-periode/semaine/2026-11-09');
    const reportLine = page.getByRole('region', { name: 'Groupes travaillés' }).getByTestId('joints-alert');
    await expect(reportLine).toHaveText(full);
    await expect(reportLine.locator('strong')).toHaveText('Coude');
    await expect(reportLine.locator('.group-alert-icon circle[r="9.6"]')).toHaveCount(1);
    expect(await reportLine.evaluate((p) => [getComputedStyle(p).backgroundColor, getComputedStyle(p).fontSize])).toEqual(['rgba(0, 0, 0, 0)', '15px']);
    await expect(page.getByTestId('report-text')).toContainText(`\n- ${full}\n`);
    // Rien pour la semaine en cours, la semaine d'avant, ni le mois.
    for (const route of ['semaine/2026-11-16', 'semaine/2026-11-02', 'mois/2026-11', 'mois/2026-10']) {
      await page.goto(`./#/bilan-periode/${route}`);
      await expect(page.getByTestId('report-title')).toBeVisible();
      await expect(page.getByTestId('joints-alert'), route).toHaveCount(0);
      await expect(page.getByTestId('report-text'), route).not.toContainText('forte hausse');
    }

    // Lundi 23 nov. : la semaine du 16 encore en hausse, 24 contre 15 : le bandeau revient.
    await page.clock.setFixedTime(new Date(2026, 10, 23, 9));
    await page.goto('./');
    await reloadAfterWrites(page);
    await expect(joints(page).getByRole('listitem')).toHaveText('Coude : 24 séries contre 15 d’habitude');
    await expect(tabBar(page).getByRole('link', { name: 'Progrès : bilan prêt, articulation trop sollicitée' })).toBeVisible();

    // Trois articulations : un seul bandeau, de la plus forte hausse à la plus faible, « forte hausse » ; la croix les
    // masque toutes.
    await openSessions(page, jointHistory({ full: true, extra: { '2026-11-09': ALL_THREE } }), JOINT_NOW);
    await expect(joints(page).getByRole('listitem')).toHaveText('Coude, Épaule, Genou : forte hausse');
    await expect(joints(page).getByRole('listitem')).toHaveAttribute('data-joints', 'coude epaule genou');
    await joints(page).getByRole('button', { name: 'Ignorer l’alerte : Coude, Épaule, Genou' }).click();
    await expect(joints(page)).toHaveCount(0);
    expect(await ignoredJoints(page)).toEqual({ coude: '2026-11-09', epaule: '2026-11-09', genou: '2026-11-09' });

    // Moins de 4 semaines terminées avant la semaine du 9 nov. : muette ; une semaine ordinaire : rien.
    await openSessions(page, jointHistory({ full: true, from: '2026-10-19' }), JOINT_NOW);
    await expect(joints(page)).toHaveCount(0);
    await expect(tabBar(page).locator('.tab-badge')).toHaveCount(0);
    await openSessions(page, jointHistory({ full: true, extra: {} }), JOINT_NOW);
    await expect(joints(page)).toHaveCount(0);
  });

  test('323. Cas le plus chargé (§3.7) avec le bandeau lavande : « Démarrer » à l’écran, une ou trois articulations ; avec le bandeau jaune en plus, limite acceptée', async ({ page }) => {
    // Semaine du 2 nov. des données de l'alerte « groupe moins travaillé » sans baisse : épaule 15, coude 13,5, genou 6 ;
    // le jeudi 5 nov., trois exercices pour le coude (22,5 contre 14 d'habitude, le texte le plus long) ; ou, en plus,
    // trois pour l'épaule et deux pour le genou.
    const elbow = ['curl-biceps-barre-droite', 'curl-biceps-poulie-corde', 'barre-au-front'];
    const cases = [
      ['Coude : 22,5 séries contre 14 d’habitude', elbow],
      ['Épaule, Coude, Genou : forte hausse', [...elbow, 'elevations-laterales-machine', 'oiseau', 'face-pull', 'leg-curl', 'squat-kettlebell']],
    ] as const;
    for (const [text, extra] of cases) {
      for (const withPlan of [false, true]) {
        await page.setViewportSize({ width: 412, height: 915 });
        await openLoaded(page, withPlan, false, withExercises(alertHistory({ dosDown: [], pecDown: [] }), '2026-11-05', [...extra]));
        await expect(alerts(page)).toHaveCount(0);
        await expect(joints(page).getByRole('listitem')).toHaveText(text);
        for (const [width, height, big] of SIZES) {
          await page.setViewportSize({ width, height });
          const restore = big ? await largeText(page) : null;
          const l = await layout(page);
          const label = `${text} ${withPlan} ${width} ${big}`;
          expect(l, `${label} (dépasse de ${l.startExcess} px)`).toMatchObject({ overflow: 0, startVisible: true });
          expect(l.minHeight, label).toBeGreaterThanOrEqual(48);
          expect(l.closest, label).toBeGreaterThanOrEqual(8);
          // Titre du récapitulatif complet à toutes les tailles : le bandeau tient sur une ligne ou deux.
          await expect(page.locator('h2.recap-title'), label).toHaveAttribute('data-form', 'full');
          await restore?.();
        }
      }
    }

    // Les deux bandeaux ensemble (limite acceptée, §3.7) : le jaune puis le lavande, 8 px entre eux ; « Démarrer » non
    // contrôlé.
    await page.setViewportSize({ width: 412, height: 915 });
    await openLoaded(page, false, false, withExercises(THREE_DOWN(alertHistory({ dosDown: [] })), '2026-11-05', [...elbow, 'curl-pupitre']));
    await expect(alerts(page)).toHaveCount(1);
    await expect(joints(page).getByRole('listitem')).toHaveText('Coude : 21 séries contre 12 d’habitude');
    const gap = await page.evaluate(() => {
      const yellow = document.querySelector('[data-testid="group-alerts"]')!;
      const lavender = document.querySelector('[data-testid="joint-alerts"]')!;
      return [yellow.nextElementSibling === lavender, Math.round(lavender.getBoundingClientRect().top - yellow.getBoundingClientRect().bottom)];
    });
    expect(gap).toEqual([true, 8]);
    expect((await layout(page)).overflow).toBe(0);
  });
});
