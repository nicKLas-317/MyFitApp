import { expect, test, type Page } from '@playwright/test';
import type { Exercise, Session } from '../src/domain/types';
import { readExercises, readSessions, writeSessions, openIllustration } from './helpers';

/** Remet la base dans l'état d'une installation en bibliothèque version 8 : ancien tirage horizontal, sans poulie basse. */
function asVersion8(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['exercises', 'meta'], 'readwrite');
          const exercises = tx.objectStore('exercises');
          const req = exercises.get('tirage-horizontal');
          req.onsuccess = () => {
            const e = req.result as Exercise;
            exercises.put({
              ...e,
              name: 'Tirage horizontal',
              synonyms: ['Seated row', 'Rowing assis', 'Tirage poulie basse'],
              variants: e.variants.map((v) => (v.id === e.id ? { ...v, synonyms: ['Seated row horizontal'] } : v)),
            });
          };
          exercises.delete('tirage-horizontal-poulie-basse');
          tx.objectStore('meta').put(8, 'seedVersion');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

test.describe('Bibliothèque version 9 : tirage horizontal machine (appui pectoral) et poulie basse (§4.0)', () => {
  test('178. Une installation existante est migrée au lancement : machine renommée avec son historique, poulie basse ajoutée', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    const t = Date.parse('2026-10-15T18:00:00');
    const old: Session = {
      id: 'th1', name: 'Séance du 15 octobre', date: '2026-10-15', startedAt: t, endedAt: t + 3_600_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
      performances: [{ variantId: 'tirage-horizontal', weightKg: 48, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' }],
    };
    await writeSessions(page, [old]);
    await asVersion8(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();

    // Base corrigée : même identifiant, nouveau nom et synonymes, synonyme appris gardé ; poulie basse ajoutée.
    await expect.poll(async () => (await readExercises(page)).find((e) => e.id === 'tirage-horizontal')?.name).toBe('Tirage horizontal machine (appui pectoral)');
    const exercises = await readExercises(page);
    const machine = exercises.find((e) => e.id === 'tirage-horizontal')!;
    expect(machine.synonyms).not.toContain('Tirage poulie basse');
    expect(machine.variants.map((v) => v.name)).toEqual(['Prise moyenne', 'Prise très large', 'Prise serrée']);
    expect(machine.variants[0]!.synonyms).toEqual(['Seated row horizontal']);
    expect(exercises.find((e) => e.id === 'tirage-horizontal-poulie-basse')).toMatchObject({ name: 'Tirage horizontal poulie basse', equipment: 'poulie' });
    expect(await readSessions(page)).toEqual([old]);

    // Fiche de la machine : nouveau nom, historique conservé, pictogramme (aucun dessin libre de cette machine).
    await page.goto('./#/exercice/tirage-horizontal');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tirage horizontal machine (appui pectoral)');
    await expect(page.getByRole('list', { name: 'Historique de l’exercice' })).toContainText('48 kg');
    await expect(page.locator('figure.illustration')).toHaveCount(0);

    // Fiche de la poulie basse : dessin du tirage à la poulie, aucun historique.
    await page.goto('./#/exercice/tirage-horizontal-poulie-basse');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tirage horizontal poulie basse');
    await expect(await openIllustration(page)).toBeVisible();
    await expect(page.getByTestId('attribution')).toContainText('Everkinetic');
    await expect(page.getByRole('list', { name: 'Historique de l’exercice' })).toHaveCount(0);

    // Recherche : « seated row » → la machine d'abord ; « poulie basse » et « cable row » → la poulie basse seule.
    await page.goto('./#/bibliotheque');
    const searchbox = page.getByRole('searchbox', { name: 'Rechercher un exercice' });
    const results = page.getByRole('list', { name: 'Résultats' }).locator('.pick-item strong');
    await searchbox.fill('seated row');
    await expect(results.first()).toHaveText('Tirage horizontal machine (appui pectoral)');
    for (const q of ['poulie basse', 'cable row']) {
      await searchbox.fill(q);
      await expect(results.first()).toHaveText('Tirage horizontal poulie basse');
      expect(await results.allTextContents(), q).not.toContain('Tirage horizontal machine (appui pectoral)');
    }
  });
});
