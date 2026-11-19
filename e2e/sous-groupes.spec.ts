import { expect, test, type Page } from '@playwright/test';
import { ALERT_NOW, alertHistory } from '../src/analysis/__tests__/alertes-simulation';
import { largeText, openSessions, SIZES } from './alertes-accueil';
import { reloadAfterWrites } from './helpers';

/**
 * Sous-groupes musculaires (§19.15, version 1.54.0). Données de l'alerte « groupe moins travaillé » (§19.11), mercredi
 * 11 nov. : les 4 dernières semaines terminées vont du 12 oct. au 8 nov. ; jamais d'oiseau ni de face pull (épaule arrière
 * à 0), lombaires seulement les semaines ordinaires.
 */
const SESSIONS = alertHistory();
/**
 * Attendu pour chaque groupe (onglet, sous-groupe, libellé, séries). Épaules : avant 18 (développé épaules 12 + chest
 * press ½), côté 18 (élévations 12 + développé ½), arrière 0 ; dos : lombaires les semaines ordinaires seulement (12 et
 * 19 oct.), aucun rowing ; abdominaux : rien.
 */
const EXPECTED: [string, [string, string, number][]][] = [
  ['Pectoraux', [['pec-haut', 'Haut', 0], ['pec-milieu', 'Milieu', 21], ['pec-bas', 'Bas', 0]]],
  ['Dos', [['dos-largeur', 'Largeur', 12], ['dos-epaisseur', 'Épaisseur', 0], ['dos-lombaires', 'Lombaires', 6]]],
  ['Épaules', [['ep-avant', 'Avant', 18], ['ep-cote', 'Côté', 18], ['ep-arriere', 'Arrière', 0]]],
  ['Biceps', [['bi-longue', 'Longue portion', 12], ['bi-courte', 'Courte portion', 6], ['bi-brachial', 'Brachial / avant-bras', 18]]],
  ['Triceps', [['tri-longue', 'Longue portion', 0], ['tri-laterale', 'Portion latérale', 24], ['tri-mediale', 'Portion médiale', 6]]],
  ['Jambes', [['quadriceps', 'Quadriceps', 24], ['ischio-jambiers', 'Ischio-jambiers', 0], ['fessiers', 'Fessiers', 6], ['adducteurs', 'Adducteurs', 0], ['mollets', 'Mollets', 0]]],
  ['Abdominaux', [['abdo-droit', 'Grand droit', 0], ['abdo-obliques', 'Obliques', 0], ['abdo-transverse', 'Transverse', 0]]],
];
const region = (page: Page) => page.getByRole('region', { name: 'Sous-groupes' });

/** Géométrie et couleurs des lignes : barres proportionnelles, à la couleur du groupe ; tout dans le cadre. */
function rows(page: Page) {
  return region(page).evaluate((section) => {
    const frame = section.getBoundingClientRect();
    const items = [...section.querySelectorAll('li')];
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      inside: [...section.querySelectorAll('li *')].every((e) => {
        const r = e.getBoundingClientRect();
        return r.left >= frame.left - 0.5 && r.right <= frame.right + 0.5;
      }),
      minFont: Math.min(...[...section.querySelectorAll('li span')].map((e) => parseFloat(getComputedStyle(e).fontSize))),
      rows: items.map((li) => {
        const bar = li.querySelector<HTMLElement>('.sub-group-bar > span');
        const track = li.querySelector<HTMLElement>('.sub-group-bar');
        return {
          sub: li.dataset['sub'],
          name: li.querySelector('.sub-group-name')!.textContent,
          sets: li.querySelector('.sub-group-sets')!.firstChild!.textContent,
          zero: li.hasAttribute('data-zero'),
          none: li.querySelector('.sub-group-none')?.textContent ?? null,
          nameColor: getComputedStyle(li.querySelector('.sub-group-name')!).color,
          ratio: bar && track ? bar.getBoundingClientRect().width / track.getBoundingClientRect().width : null,
          barColor: bar ? getComputedStyle(bar).backgroundColor : null,
        };
      }),
    };
  });
}

test.describe('Sous-groupes musculaires', () => {
  test('327. « Par groupe musculaire » : barres des 4 dernières semaines terminées pour les 7 groupes, 0 en gris « pas travaillé » ; bilans de la semaine et du mois : section repliable, fermée, groupes travaillés seuls, liste indentée ; une ligne par groupe dans le mail ; format smartphone', async ({ page }) => {
    await openSessions(page, SESSIONS, ALERT_NOW);
    await page.goto('./#/bilan-groupes/epaules');
    await expect(region(page).getByTestId('sub-groups-period')).toHaveText('4 dernières semaines terminées (du 12 oct. au 8 nov.)');
    const epaules = await rows(page);
    expect(epaules.rows).toEqual([
      { sub: 'ep-avant', name: 'Avant', sets: '18', zero: false, none: null, nameColor: 'rgb(238, 240, 244)', ratio: 1, barColor: 'rgb(255, 228, 74)' },
      { sub: 'ep-cote', name: 'Côté', sets: '18', zero: false, none: null, nameColor: 'rgb(238, 240, 244)', ratio: 1, barColor: 'rgb(255, 228, 74)' },
      { sub: 'ep-arriere', name: 'Arrière', sets: '0', zero: true, none: 'pas travaillé', nameColor: 'rgb(154, 161, 176)', ratio: null, barColor: null },
    ]);
    // Lecteur d'écran : « 0 série, pas travaillé ».
    await expect(region(page).locator('[data-sub="ep-arriere"]')).toContainText('0 série, pas travaillé');

    // Les 7 groupes : leurs sous-groupes, dans l'ordre, chiffres et barres proportionnelles au plus travaillé.
    for (const [label, want] of EXPECTED) {
      await page.getByRole('group', { name: 'Groupe musculaire' }).getByRole('button', { name: label, exact: true }).click();
      await expect(region(page).locator('li')).toHaveCount(want.length);
      const max = Math.max(...want.map(([, , sets]) => sets));
      const got = await rows(page);
      expect(got.rows.map((r) => [r.sub, r.name, r.sets, r.zero]), label).toEqual(want.map(([id, name, sets]) => [id, name, String(sets), sets === 0]));
      for (const [i, r] of got.rows.entries()) if (!r.zero) expect(r.ratio!, `${label} ${r.sub}`).toBeCloseTo(want[i]![2] / max, 2);
    }

    // Lisible aux quatre tailles : rien ne dépasse, tout dans le cadre, 13 px au moins (biceps : « Brachial / avant-bras »).
    for (const group of ['biceps', 'jambes'] as const) {
      await page.goto(`./#/bilan-groupes/${group}`);
      for (const [width, height, big] of SIZES) {
        await page.setViewportSize({ width, height });
        const restore = big ? await largeText(page) : null;
        const l = await rows(page);
        expect([l.overflow, l.inside], `${group} ${width} ${big}`).toEqual([0, true]);
        expect(l.minFont, `${group} ${width} ${big}`).toBeGreaterThanOrEqual(13);
        await restore?.();
      }
    }
    await page.setViewportSize({ width: 412, height: 915 });

    // Bilan de la semaine du 2 nov. : section « Sous-groupes » repliable, fermée à l'ouverture ; seulement les groupes
    // travaillés (ici les six du récapitulatif) ; une liste indentée, le groupe en gras, un sous-groupe à 0 en gris ; le
    // mail, une ligne par groupe, les mêmes groupes.
    await page.goto('./#/bilan-periode/semaine/2026-11-02');
    const fold = page.getByTestId('report-sub-groups');
    await expect(fold).not.toHaveAttribute('open', '');
    await expect(fold.locator('.sub-group-list')).toBeHidden();
    // Juste après « Groupes travaillés ».
    expect(await fold.evaluate((d) => d.previousElementSibling?.getAttribute('aria-label'))).toBe('Groupes travaillés');
    await fold.locator('summary').click();
    await expect(fold).toHaveAttribute('open', '');
    const groups = [
      ['Pectoraux', ['haut 0', 'milieu 3', 'bas 0']],
      ['Dos', ['largeur 3', 'épaisseur 0', 'lombaires 0']],
      ['Épaules', ['avant 4,5', 'côté 4,5', 'arrière 0']],
      ['Biceps', ['longue 3', 'courte 1,5', 'brachial 4,5']],
      ['Triceps', ['longue 0', 'latérale 6', 'médiale 1,5']],
      ['Jambes', ['quadriceps 6', 'ischio-jambiers 0', 'fessiers 1,5', 'adducteurs 0', 'mollets 0']],
    ] as const;
    const list = await fold.evaluate((d) =>
      [...d.querySelectorAll('.sub-group-list > li')].map((li) => {
        const strong = li.querySelector('strong')!;
        const items = [...li.querySelectorAll('.sub-group-items > li')];
        return {
          name: strong.textContent,
          bold: getComputedStyle(strong).fontWeight,
          items: items.map((i) => i.textContent),
          grey: items.map((i) => i.hasAttribute('data-zero') && getComputedStyle(i).color === 'rgb(154, 161, 176)'),
          indent: Math.round(items[0]!.getBoundingClientRect().left - strong.getBoundingClientRect().left),
        };
      }),
    );
    expect(list).toEqual(
      groups.map(([name, items]) => ({
        name: `${name}\u00a0:`,
        bold: '700',
        items: items.map((i) => `–\u00a0${i.replace(' ', '\u00a0')}`),
        grey: items.map((i) => i.endsWith(' 0')),
        indent: 16,
      })),
    );
    await expect(page.getByTestId('report-text')).toContainText(
      `\nSOUS-GROUPES\n${groups.map(([name, items]) => `- ${name} : ${items.join(', ')}`).join('\n')}\n`,
    );

    // Groupes non travaillés omis : abdominaux au récapitulatif, à 0 cette semaine : ni à l'écran ni dans le mail.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('myfitapp');
          open.onsuccess = () => {
            const tx = open.result.transaction('meta', 'readwrite');
            tx.objectStore('meta').put({ groups: ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux'], redSets: 10 }, 'weeklyRecap');
            tx.oncomplete = () => (open.result.close(), resolve());
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.goto('./#/bilan-periode/semaine/2026-11-02');
    await reloadAfterWrites(page);
    await page.getByTestId('report-sub-groups').locator('summary').click();
    await expect(page.getByTestId('report-sub-groups').locator('.sub-group-list > li')).toHaveCount(6);
    await expect(page.getByTestId('report-text')).not.toContainText('- Abdominaux :');
    // Bilan du mois d'octobre : la même section, fermée.
    await page.goto('./#/bilan-periode/mois/2026-10');
    await expect(page.getByTestId('report-sub-groups')).not.toHaveAttribute('open', '');
    await expect(page.getByTestId('report-sub-groups').locator('.sub-group-list > li')).toHaveCount(6);

    // Ouverte, aux quatre tailles : rien ne dépasse, tout dans le cadre ; hauteurs relevées pour le compte rendu.
    await page.goto('./#/bilan-periode/semaine/2026-11-02');
    const section = page.getByTestId('report-sub-groups');
    for (const [width, height, big] of SIZES) {
      await page.setViewportSize({ width, height });
      const restore = big ? await largeText(page) : null;
      const closed = await section.evaluate((d) => Math.round(d.getBoundingClientRect().height));
      if (!(await section.getAttribute('open'))) await section.locator('summary').click();
      const box = await section.evaluate((d) => ({
        height: Math.round(d.getBoundingClientRect().height),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        inside: [...d.querySelectorAll('li')].every((li) => li.getBoundingClientRect().right <= d.getBoundingClientRect().right + 0.5),
      }));
      console.log(`Sous-groupes du bilan, ${width} px${big ? ' texte à 115 %' : ''} : fermée ${closed} px, ouverte ${box.height} px`);
      expect([box.overflow, box.inside], `${width} ${big}`).toEqual([0, true]);
      await section.locator('summary').click();
      await restore?.();
    }
  });
});
