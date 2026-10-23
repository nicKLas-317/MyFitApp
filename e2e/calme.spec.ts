import { expect, test, type Locator, type Page } from '@playwright/test';
import { simulatedHistory } from '../src/analysis/__tests__/simulation';
import { activeSession, exerciseCard, openScreen, openSettingsSection, writeSessions } from './helpers';

/** Données simulées (1er juin – 19 oct. 2026), du cardio sur la dernière séance, et une activité confirmée. */
async function seed(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-10-22T19:30:00'));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
  const sessions = simulatedHistory('2026-10-19');
  sessions.at(-1)!.cardio = [{ id: 'c1', machineId: 'rameur', machine: 'Rameur', minutes: 20 }];
  await writeSessions(page, sessions);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onsuccess = () => {
          const tx = open.result.transaction('meta', 'readwrite');
          tx.objectStore('meta').put(
            [{ id: 'act-badminton-2026-10-19', habitId: 'badminton', date: '2026-10-19', name: 'Badminton', start: '21:00', end: '22:30', groups: ['epaules', 'jambes'], status: 'done', answeredAt: 0 }],
            'activities',
          );
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
}

/** Taille de police Android agrandie (simulation) : tout le texte à 115 %. */
async function largeText(page: Page): Promise<() => Promise<void>> {
  const style = await page.addStyleTag({ content: ':root { font-size: calc(17px * 1.15) !important; }' });
  return () => style.evaluate((el) => (el as Element).remove());
}

/** Nombre de lignes de texte d'un élément. */
function lines(el: Locator): Promise<number> {
  return el.evaluate((e) => {
    const range = document.createRange();
    range.selectNodeContents(e);
    return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
  });
}

/** Hauts des éléments : tous égaux = une seule rangée. */
function tops(list: Locator): Promise<number[]> {
  return list.evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))]);
}

/** À 412, 360 et 360 px avec le texte à 115 % : `check`, et rien ne dépasse de l'écran. */
async function atWidths(page: Page, check: (where: string) => Promise<void>): Promise<void> {
  for (const [width, large] of [[412, false], [360, false], [360, true]] as const) {
    await page.setViewportSize({ width, height: 800 });
    const restore = large ? await largeText(page) : null;
    const where = `${width} px${large ? ', texte à 115 %' : ''}`;
    await check(where);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), where).toBeLessThanOrEqual(0);
    await restore?.();
  }
  await page.setViewportSize({ width: 412, height: 915 });
}

test.describe('Écrans au calme allégés (version 1.21.0)', () => {
  test('231. Historique : regroupé par mois, une ligne compacte par séance et par activité, titres sur une ligne, suppression dans le détail seulement', async ({ page }) => {
    await seed(page);
    await openScreen(page, 'Historique');
    await expect(page.locator('.history-month h2')).toHaveText(['Octobre 2026', 'Septembre 2026', 'Août 2026', 'Juillet 2026', 'Juin 2026']);
    const october = page.getByRole('list', { name: 'Séances : Octobre 2026' });
    // Séance : date, nombre d'exercices, cardio ; activité : nom et durée.
    await expect(october.getByRole('link').first()).toHaveAccessibleName(/^19 octobre 2026 : Badminton · 1 h 30 activité/);
    await expect(october.locator('.session-link').first()).toHaveAccessibleName(/^19 octobre 2026 : .* 5 ex\. · 20 min cardio$/);
    await expect(october.locator('.session-link').first().locator('.history-day')).toHaveText('lun.19');
    // Un seul cadre par mois, pas un cadre par séance.
    await expect(page.locator('.history-month [data-frame]')).toHaveCount(5);
    await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);

    await atWidths(page, async (where) => {
      for (const title of await page.locator('.history-title').all()) expect(await lines(title), where).toBe(1);
      const heights = await page.locator('.history-line').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      expect(Math.max(...heights), where).toBeLessThanOrEqual(64);
    });

    // Séance : « Supprimer la séance » dans le détail, avec confirmation.
    await october.locator('.session-link').first().click();
    await page.getByRole('button', { name: 'Supprimer la séance' }).click();
    await expect(page.getByRole('group', { name: 'Supprimer la séance' })).toContainText('Supprimer définitivement cette séance ?');
    await page.getByRole('button', { name: 'Annuler' }).click();
    // Activité : son détail, et « Supprimer l'activité » avec confirmation.
    await page.goBack();
    await october.getByRole('link', { name: /Badminton/ }).click();
    await expect(page.getByRole('main')).toContainText('19 octobre 2026 · 21 h – 22 h 30');
    await page.getByRole('button', { name: 'Supprimer l’activité' }).click();
    await expect(page.getByRole('group', { name: 'Supprimer l’activité' })).toBeVisible();
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByRole('button', { name: 'Supprimer l’activité' })).toBeVisible();
  });

  test('232. Bibliothèque et ajout d’un exercice : puces de filtre par groupe, « Récents » en tête, prises regroupées en une entrée', async ({ page }) => {
    await seed(page);
    await openScreen(page, 'Bibliothèque d’exercices');
    const filters = page.getByRole('group', { name: 'Filtrer par groupe musculaire' });
    await expect(filters.getByRole('button')).toHaveText(['Tous', 'Dos', 'Pectoraux', 'Épaules', 'Biceps', 'Triceps', 'Jambes', 'Abdominaux']);
    expect(await tops(filters.getByRole('button'))).toHaveLength(1);
    await expect(page.locator('main h2').first()).toHaveText('Récents');

    // Prises du tirage vertical : une seule entrée, une puce par prise (dernier poids et statut sur la moyenne).
    // Dans « Récents », une seule prise (la moyenne) : entrée simple ; dans « Dos », les trois prises en une entrée.
    await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Récents' }) }).locator('li[data-variant="tirage-vertical"]')).toContainText('Prise moyenne');
    const grips = page.locator('.grip-item[data-exercise="tirage-vertical"]');
    await expect(grips).toHaveCount(1);
    await expect(grips.locator('strong')).toHaveText('Tirage vertical');
    await expect(grips.getByRole('button')).toHaveText(['Très large', /^Moyenne45 kg/, 'Serrée']);

    // Filtre « Dos » : les récents du dos, puis la section du dos, rien d'autre.
    await filters.getByRole('button', { name: 'Dos' }).click();
    await expect(filters.getByRole('button', { name: 'Dos' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('main h2')).toHaveText(['Récents', 'Dos']);
    expect(await page.locator('.pick-item').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-group-color')))])).toEqual(['dos']);
    // Une puce ouvre la fiche de sa variante.
    await grips.last().getByRole('button', { name: 'Tirage vertical Prise très large' }).click();
    await expect(page.getByText('Variante : Prise très large')).toBeVisible();
    await page.goBack();
    // Filtre gardé au retour ; un nouvel appui (ou « Tous ») réaffiche tout.
    await expect(filters.getByRole('button', { name: 'Dos' })).toHaveAttribute('aria-pressed', 'true');
    await filters.getByRole('button', { name: 'Dos' }).click();
    await expect(filters.getByRole('button', { name: 'Tous' })).toHaveAttribute('aria-pressed', 'true');

    // Recherche d'une seule prise : entrée simple, avec sa variante.
    await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill('tirage vertical wide grip');
    await expect(page.getByRole('list', { name: 'Résultats' }).locator('.pick-item')).toHaveCount(1);
    await expect(page.getByRole('list', { name: 'Résultats' })).toContainText('Prise très large');
    await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill('');

    await atWidths(page, async (where) => {
      expect(await tops(filters.getByRole('button')), where).toHaveLength(1);
      for (const chip of await grips.first().getByRole('button').all()) expect((await chip.boundingBox())!.height, where).toBeGreaterThanOrEqual(48);
    });

    // Ajout pendant une séance : la puce « Serrée » ajoute cette variante, exercice-variante distinct.
    await page.goto('./');
    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    await page.getByRole('link', { name: 'Ajouter un exercice' }).click();
    await expect(page.locator('main h2').first()).toHaveText('Récents');
    await page.getByRole('group', { name: 'Filtrer par groupe musculaire' }).getByRole('button', { name: 'Tous' }).click();
    await page.locator('.grip-item[data-exercise="tirage-vertical"]').first().getByRole('button', { name: 'Tirage vertical Prise serrée' }).click();
    await page.getByLabel('Poids de départ (kg)').fill('40');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(exerciseCard(page, 'Tirage vertical — Prise serrée')).toBeVisible();
    expect((await activeSession(page)).performances.map((p) => p.variantId)).toEqual(['tirage-vertical--prise-serree']);
    // Déjà dans la séance : la puce le signale et rouvre l'exercice.
    await page.getByRole('link', { name: 'Ajouter un exercice' }).click();
    await page.locator('.grip-item[data-exercise="tirage-vertical"]').first().getByRole('button', { name: 'Tirage vertical Prise serrée, dans la séance' }).click();
    await expect(exerciseCard(page, 'Tirage vertical — Prise serrée')).toBeVisible();
    expect((await activeSession(page)).performances).toHaveLength(1);
  });

  test('233. Fiche : cible et dernière fois en premier, illustration réduite agrandie au toucher, historique compact limité à 5 séances avec « Voir tout »', async ({ page }) => {
    await seed(page);
    await page.goto('./#/exercice/chest-press');
    const status = page.locator('.sheet-status');
    await expect(status).toBeInViewport();
    expect(await status.evaluate((el) => !!(el.compareDocumentPosition(document.querySelector('.sheet-head')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await expect(status).toContainText('Dernière fois');

    // Illustration réduite : vignette seulement ; au toucher, l'image agrandie et l'attribution dessous.
    await expect(page.locator('figure.illustration')).toHaveCount(0);
    const thumb = page.getByRole('button', { name: 'Agrandir l’illustration' });
    expect((await thumb.boundingBox())!.height).toBeLessThanOrEqual(80);
    await thumb.click();
    const [img, attribution] = [page.locator('figure.illustration img'), page.getByTestId('attribution')];
    await expect(img).toBeVisible();
    await expect(attribution).toContainText('Everkinetic');
    expect((await attribution.boundingBox())!.y).toBeGreaterThanOrEqual((await img.boundingBox())!.y + (await img.boundingBox())!.height);
    await page.getByRole('button', { name: 'Réduire l’illustration' }).first().click();
    await expect(page.locator('figure.illustration')).toHaveCount(0);

    // Historique : un seul cadre, lignes compactes, les 5 dernières séances ; « Voir tout » montre le reste.
    const history = page.getByRole('list', { name: 'Historique de l’exercice' });
    await expect(history).toHaveAttribute('data-frame', '');
    await expect(history.locator('[data-frame]')).toHaveCount(0);
    await expect(history.getByRole('listitem')).toHaveCount(5);
    await expect(history.getByRole('listitem').first()).toContainText('45 kg · 11-11-11');
    await expect(history.getByRole('listitem').first()).toContainText('cible 3 × 11 · Bien passé');
    const all = page.getByRole('button', { name: /^Voir tout \(\d+ séances\)$/ });
    const total = Number((await all.textContent())!.match(/\d+/)![0]);
    expect(total).toBeGreaterThan(5);
    await all.click();
    await expect(history.getByRole('listitem')).toHaveCount(total);
    await page.getByRole('button', { name: 'Voir les 5 dernières' }).click();
    await expect(history.getByRole('listitem')).toHaveCount(5);
    await atWidths(page, async (where) => {
      const heights = await history.getByRole('listitem').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      expect(Math.max(...heights), where).toBeLessThanOrEqual(72);
    });
  });

  test('234. Bilan de progression : une seule rangée de filtres, « Trop tôt », une ligne par évolution', async ({ page }) => {
    await seed(page);
    await openScreen(page, 'Bilan de progression');
    const filters = page.getByRole('group', { name: 'Filtrer par catégorie' }).getByRole('button');
    await expect(filters.last()).toHaveText(/^…Trop tôt\d+$/);
    await expect(page.getByText('Trop tôt pour conclure')).toHaveCount(0);
    const changes = page.getByRole('region', { name: 'Dernières évolutions' }).getByRole('listitem');
    await expect(changes.first()).toHaveText(/^\d\d\/\d\d.+(rép\.|kg)$/);
    await atWidths(page, async (where) => {
      expect(await tops(filters), where).toHaveLength(1);
      // Une ligne : la hauteur de l'évolution est celle du nom de l'exercice (sur une ligne, tronqué au besoin).
      for (const item of await changes.all()) {
        const [row, name] = [(await item.boundingBox())!.height, (await item.locator('.change-name').boundingBox())!.height];
        expect(row, where).toBeLessThanOrEqual(name + 1);
      }
    });
  });

  test('235. Réglages : accès aux exercices en haut, sections repliables (la première ouverte), activité sur une ligne, machines espacées et « Retirer » dans un menu', async ({ page }) => {
    await seed(page);
    await openScreen(page, 'Réglages');
    const main = page.getByRole('main');
    const exercises = main.getByRole('link', { name: 'Exercices, variantes et réglages par exercice' });
    expect((await exercises.boundingBox())!.y).toBeLessThan((await page.locator('details.settings-section').first().boundingBox())!.y);
    await expect(page.locator('details.settings-section summary')).toHaveText(['Taille', 'Récapitulatif de la semaine', 'Bilans de la semaine et du mois', 'Activités habituelles', 'Machines de cardio']);
    expect(await page.locator('details.settings-section').evaluateAll((els) => els.map((e) => (e as HTMLDetailsElement).open))).toEqual([true, false, false, false, false]);
    await expect(page.getByLabel('Taille (cm)')).toBeVisible();
    await expect(page.getByLabel('Nouvelle machine')).toBeHidden();

    const habits = await openSettingsSection(page, 'Activités habituelles');
    const machines = await openSettingsSection(page, 'Machines de cardio');
    await expect(machines.getByRole('button', { name: /Retirer/ })).toHaveCount(0);
    await atWidths(page, async (where) => {
      // Jour, début et fin de l'activité sur une ligne (à 412 et 360 px) ; le jour n'est jamais tronqué.
      const day = habits.getByLabel('Jour : Badminton');
      expect(await day.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), where).toBe(true);
      if (!where.includes('115')) expect(await tops(habits.locator('.habit-when select, .habit-when input')), where).toHaveLength(1);
      // Machines : 8 px au moins entre deux lignes.
      const rows = await machines.locator('.machine-row').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
      for (let i = 1; i < rows.length; i++) expect(rows[i]!.top - rows[i - 1]!.bottom, where).toBeGreaterThanOrEqual(8);
    });

    // « Retirer » : dans le menu « ⋯ » de la machine ; effectif à l'enregistrement.
    await machines.getByRole('button', { name: 'Actions : Rameur', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Retirer' }).click();
    await expect(machines.locator('.machine-row input')).toHaveCount(4);
    await machines.getByRole('button', { name: 'Annuler' }).click();
    await expect(machines.locator('.machine-row input')).toHaveCount(5);
  });

  test('236. Mon poids : date courte, une pesée par ligne à 412 et 360 px ; « Taille » sans séparateur isolé quand le lien passe à la ligne', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-22T19:30:00'));
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    const dates = ['06-02', '06-16', '06-30', '07-14', '07-28', '08-11', '08-25', '09-08', '09-22', '10-06', '10-20'];
    await page.evaluate(
      (weights) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('myfitapp-corps');
          open.onsuccess = () => {
            const tx = open.result.transaction(['weighIns', 'meta'], 'readwrite');
            for (const w of weights) tx.objectStore('weighIns').put(w);
            tx.objectStore('meta').put(178, 'heightCm');
            tx.oncomplete = () => (open.result.close(), resolve());
            tx.onerror = () => reject(tx.error);
          };
        }),
      dates.map((d, i) => ({ date: `2026-${d}`, weightKg: Math.round((80.4 - i * 0.3) * 10) / 10 })),
    );
    await page.goto('./#/poids');
    await page.reload();
    const rows = page.getByRole('list', { name: 'Historique des pesées' }).getByRole('listitem');
    await expect(rows).toHaveCount(11);
    await expect(rows.locator('.history-date')).toContainText(['20 oct. 2026', '6 oct. 2026', '22 sept. 2026', '8 sept. 2026', '25 août 2026', '11 août 2026', '28 juil. 2026']);

    /** Pesées dont le poids et « Corriger » sont passés sous la date. */
    const wrapped = () =>
      rows.evaluateAll((els) =>
        els.filter((li) => {
          const [date, value] = [li.querySelector('.history-date')!, li.querySelector('.weigh-value')!].map((e) => e.getBoundingClientRect());
          return value!.top >= date!.bottom - 1;
        }).map((li) => li.querySelector('.history-date')!.textContent),
      );
    /** Séparateur « · » devant le lien : visible (dans la ligne) ou rogné (hors du bord gauche). */
    const separator = () =>
      page.locator('.height-line').evaluate((p) => {
        const [label, link] = [...p.querySelectorAll(':scope > span > span')].map((e) => e.getBoundingClientRect());
        return { sameLine: link!.top < label!.bottom && label!.top < link!.bottom, visible: link!.left >= p.getBoundingClientRect().left };
      });

    await atWidths(page, async (where) => {
      if (!where.includes('115')) expect(await wrapped(), where).toEqual([]);
      const sep = await separator();
      // Sur la même ligne, le « · » sépare ; quand le lien passe à la ligne, il n'est jamais visible.
      expect(sep.visible, where).toBe(sep.sameLine);
    });
    await page.setViewportSize({ width: 412, height: 915 });
    expect((await separator()).sameLine).toBe(true);
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await separator()).toEqual({ sameLine: false, visible: false });
  });
});

