import { expect, test, type Page } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { importedText, openScreen, openSettingsSection, reloadAfterWrites, waitForWrites, writeSessions } from './helpers';

/** Réglage du récapitulatif tel qu'il est enregistré dans la méta `weeklyRecap`. */
function readRecapMeta(page: Page): Promise<Record<string, unknown> | undefined> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('meta').objectStore('meta').get('weeklyRecap');
          req.onsuccess = () => (open.result.close(), resolve(req.result as Record<string, unknown> | undefined));
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

/** Écrit un réglage d'une version antérieure dans la méta, avant le chargement de l'appli (rechargement ensuite). */
function writeRecapMeta(page: Page, value: unknown): Promise<void> {
  return page.evaluate(
    (value) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('meta', 'readwrite');
          tx.objectStore('meta').put(value, 'weeklyRecap');
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    value,
  );
}

const DAY = '2026-11-10';
const START = Date.parse(`${DAY}T08:00:00`);

/**
 * Une séance du jour : pectoraux 10 séries (exercices d'isolation, sans groupe secondaire), triceps 15 séries, biceps 2
 * séries. En séances (avant la version 1.45.0, rouge à partir de 2), les pectoraux auraient été orange (1 séance).
 */
const SESSION: Session = {
  id: 'reglage-series', name: 'Séance du 10 novembre 2026 — 8 h 00', date: DAY, startedAt: START, endedAt: START + 3_600_000, createdAt: START, updatedAt: START,
  origin: 'app', state: 'done',
  performances: [
    { variantId: 'pec-deck', weightKg: 35, targetReps: 10, plannedSets: 4, reps: [10, 10, 10, 10], feeling: 'bien' },
    { variantId: 'ecarte-couche-halteres', weightKg: 10, targetReps: 10, plannedSets: 3, reps: [10, 10, 10], feeling: 'bien' },
    { variantId: 'ecarte-poulie', weightKg: 10, targetReps: 10, plannedSets: 3, reps: [10, 10, 10], feeling: 'bien' },
    { variantId: 'extension-triceps-poulie', weightKg: 20, targetReps: 10, plannedSets: 5, reps: [10, 10, 10, 10, 10], feeling: 'bien' },
    { variantId: 'extension-triceps-haltere-assis', weightKg: 14, targetReps: 10, plannedSets: 5, reps: [10, 10, 10, 10, 10], feeling: 'bien' },
    { variantId: 'kickback', weightKg: 8, targetReps: 10, plannedSets: 5, reps: [10, 10, 10, 10, 10], feeling: 'bien' },
    { variantId: 'curl-biceps-halteres', weightKg: 12, targetReps: 10, plannedSets: 2, reps: [10, 10], feeling: 'bien' },
  ],
};

const recapCell = (page: Page, group: string) => page.getByTestId('weekly-recap').locator(`[data-group="${group}"]`);

/** Couleurs des cases de la séance du jour. */
async function expectColors(page: Page, colors: Record<string, string>): Promise<void> {
  for (const [group, color] of Object.entries(colors)) await expect(recapCell(page, group), group).toHaveAttribute('data-color', color);
}

/** Section des réglages : éléments tactiles d'au moins 48 px, rien ne dépasse de l'écran, à 412, 360 et 320 px. */
async function expectLayout(page: Page): Promise<void> {
  for (const width of [412, 360, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const section = await openSettingsSection(page, 'Récapitulatif de la semaine');
    const stepper = section.getByRole('group', { name: 'Rouge à partir de (séries)' });
    await stepper.scrollIntoViewIfNeeded();
    for (const button of await section.getByRole('button').all()) {
      const box = (await button.boundingBox())!;
      expect(box.height, `${width} px : ${await button.getAttribute('aria-label') ?? await button.textContent()}`).toBeGreaterThanOrEqual(48);
      expect(box.x, `${width} px`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${width} px`).toBeLessThanOrEqual(width + 0.5);
    }
    // Largeur réelle de l'écran (§15) : jamais `innerWidth`, qui grandit quand la page est dézoomée.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width} px`).toBeLessThanOrEqual(0);
  }
}

test.describe('Seuil du rouge en séries (§19.6, version 1.45.0)', () => {
  test('307. « Rouge à partir de (séries) » : 10 par défaut, de 6 à 20, enregistré en `redSets` ; un ancien seuil en séances est converti (2 → 10, 3 → 15) ; export sans `redThreshold`', async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${DAY}T12:00:00`));
    await page.goto('./');
    await expect(page.getByTestId('weekly-recap')).toBeVisible();
    await writeSessions(page, [SESSION]);
    await reloadAfterWrites(page);
    await expect(recapCell(page, 'pectoraux')).toHaveText('Pectoraux (10 séries) · aujourd’hui');
    await expect(recapCell(page, 'triceps')).toHaveText('Triceps (15 séries) · aujourd’hui');
    await expect(recapCell(page, 'biceps')).toHaveText('Biceps (2 séries) · aujourd’hui');
    // Par défaut, rouge à partir de 10 séries ; vert sous 3.
    await expectColors(page, { pectoraux: 'rouge', triceps: 'rouge', biceps: 'vert', dos: 'vert' });

    // Réglages : 10 par défaut ; − jusqu'à 6 (bloqué), + jusqu'à 20 (bloqué) ; chaque valeur est enregistrée.
    await page.goto('./#/reglages');
    const section = await openSettingsSection(page, 'Récapitulatif de la semaine');
    const stepper = section.getByRole('group', { name: 'Rouge à partir de (séries)' });
    await expect(stepper).toContainText('Rouge à partir de (séries)');
    const value = stepper.locator('output');
    const minus = stepper.getByRole('button', { name: 'Rouge à partir de (séries) : moins' });
    const plus = stepper.getByRole('button', { name: 'Rouge à partir de (séries) : plus' });
    await expect(value).toHaveText('10');
    for (let v = 9; v >= 6; v--) {
      await minus.click();
      await expect(value).toHaveText(String(v));
    }
    // Bouton désactivé à sa borne : seule exception admise (§17).
    await expect(minus).toBeDisabled();
    await expect(plus).toBeEnabled();
    await waitForWrites(page);
    expect(await readRecapMeta(page)).toEqual({ groups: ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes'], redSets: 6 });
    for (let v = 7; v <= 20; v++) {
      await plus.click();
      await expect(value).toHaveText(String(v));
    }
    await expect(plus).toBeDisabled();
    await expect(minus).toBeEnabled();
    await waitForWrites(page);
    expect(await readRecapMeta(page)).toMatchObject({ redSets: 20 });
    expect(await readRecapMeta(page)).not.toHaveProperty('redThreshold');
    // À 20 séries, les triceps (15) passent orange.
    await page.goto('./');
    await expectColors(page, { pectoraux: 'orange', triceps: 'orange', biceps: 'vert' });

    // Éléments tactiles et largeur, à 412, 360 et 320 px.
    await page.goto('./#/reglages');
    await expectLayout(page);
    await page.setViewportSize({ width: 412, height: 915 });

    // Base d'une version antérieure : `redThreshold: 2` (séances) → 10 séries.
    await writeRecapMeta(page, { groups: ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes'], redThreshold: 2 });
    await reloadAfterWrites(page);
    const migrated = await openSettingsSection(page, 'Récapitulatif de la semaine');
    await expect(migrated.getByRole('group', { name: 'Rouge à partir de (séries)' }).locator('output')).toHaveText('10');
    await page.goto('./');
    await expect(recapCell(page, 'pectoraux')).toHaveText('Pectoraux (10 séries) · aujourd’hui');
    await expectColors(page, { pectoraux: 'rouge', triceps: 'rouge', biceps: 'vert' });

    // Export : le réglage converti, en séries, sans l'ancien champ.
    await openScreen(page, 'Importer / exporter');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter mes données' }).click();
    const download = await downloading;
    // Le fichier exporté est relu par l'appli (zone de saisie de l'import), comme au test 43.
    await page.getByLabel('Fichier à importer').setInputFiles(await download.path());
    const backup = JSON.parse(await importedText(page));
    expect(backup.settings.weeklyRecap).toEqual({ groups: ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes'], redSets: 10 });
    expect(backup.settings.weeklyRecap).not.toHaveProperty('redThreshold');

    // `redThreshold: 3` → 15 séries : les pectoraux (10) redeviennent orange, les triceps (15) restent rouges.
    await page.goto('./');
    await writeRecapMeta(page, { groups: ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes'], redThreshold: 3 });
    await reloadAfterWrites(page);
    await expectColors(page, { pectoraux: 'orange', triceps: 'rouge', biceps: 'vert' });
    await page.goto('./#/reglages');
    const fifteen = await openSettingsSection(page, 'Récapitulatif de la semaine');
    await expect(fifteen.getByRole('group', { name: 'Rouge à partir de (séries)' }).locator('output')).toHaveText('15');
  });
});
