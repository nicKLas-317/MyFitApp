import { expect, test } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { addExercise, readSessions, startSession, writeSessions } from './helpers';

function dips(id: string, date: string, weightKg: number, reps: number): Session {
  const t = Date.parse(`${date}T18:00:00`);
  return {
    id, name: id, date, startedAt: t, endedAt: t + 3_600_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: [{ variantId: 'dips-assistes', weightKg, targetReps: reps, plannedSets: 3, reps: [reps, reps, reps], feeling: 'bien' }],
  };
}

test.describe('Exercices assistés et données de départ', () => {
  test('88. Le fichier de départ s’importe sur un appareil vierge : triceps 3×9, chest press orange, dips assistés', async ({ page }) => {
    await page.goto('./#/donnees');
    await page.getByLabel('Fichier à importer').setInputFiles('docs/exemples/depart-exemple.json');
    await expect(page.getByTestId('plan-new')).toHaveText('2 séances à ajouter');
    await page.getByRole('button', { name: 'Ajouter à mes données' }).click();
    await expect(page.getByText('Import terminé : 2 séances ajoutées.')).toBeVisible();
    expect(await readSessions(page)).toHaveLength(2);

    await page.goto('./#/exercice/extension-triceps-haltere-assis');
    await expect(page.getByTestId('sheet-next')).toHaveText('3 × 9');
    await page.goto('./#/exercice/chest-press');
    await expect(page.locator('.sheet-status [data-status]')).toHaveAttribute('data-status', 'orange');
    await expect(page.getByRole('list', { name: 'Historique de l’exercice' })).toContainText('Moyen (+=)');
    await page.goto('./#/exercice/dips-assistes');
    await expect(page.getByTestId('assisted')).toBeVisible();
    await page.goto('./#/exercice/tirage-vertical--prise-tres-large');
    await expect(page.getByText('Variante : prise très large')).toBeVisible();
  });

  test('81. Après deux validations à 3×12, la séance affiche « Moins d’aide » et la cible repart à 3×8 avec moins d’aide', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    await writeSessions(page, [dips('d1', '2026-10-01', 23, 12), dips('d2', '2026-10-03', 23, 12)]);
    await page.reload();
    await startSession(page);
    const card = await addExercise(page, 'dips', 'Dips assistés');
    await expect(card.getByText('Moins d’aide', { exact: true })).toBeVisible();
    await expect(card.getByTestId('target')).toHaveText('3 × 12');
    await card.getByLabel('Aide (kg)').fill('18');
    await card.getByLabel('Aide (kg)').press('Enter');
    await expect(card.getByTestId('target')).toHaveText('3 × 8');
  });

  test('173. Une base où « += » était enregistré avec « Bien » est corrigée au lancement : chest press orange, cible conservée', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    const chest = (id: string, date: string, feeling: 'tres_bien' | 'bien', feelingSymbol: string): Session => {
      const t = Date.parse(`${date}T18:00:00`);
      return {
        id, name: id, date, startedAt: null, endedAt: null, createdAt: t, updatedAt: t, origin: 'import', state: 'done',
        performances: [{ variantId: 'chest-press', weightKg: 52, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling, feelingSymbol }],
      };
    };
    await writeSessions(page, [chest('c1', '2026-10-12', 'tres_bien', '++'), chest('c2', '2026-10-15', 'bien', '+=')]);
    // Base d'une version antérieure : la correction n'y a jamais été appliquée.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('myfitapp');
          open.onsuccess = () => {
            const tx = open.result.transaction('meta', 'readwrite');
            tx.objectStore('meta').delete('plusEqualFeelingFixed');
            tx.oncomplete = () => {
              open.result.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.goto('./#/exercice/chest-press');
    await page.reload();
    await expect(page.locator('.sheet-status [data-status]')).toHaveAttribute('data-status', 'orange');
    await expect(page.getByTestId('sheet-next')).toHaveText('3 × 8');
    await expect(page.getByRole('list', { name: 'Historique de l’exercice' })).toContainText('Moyen (+=)');
    const stored = await readSessions(page);
    expect(stored.find((s) => s.id === 'c2')?.performances[0]).toMatchObject({ feeling: 'moyen', feelingSymbol: '+=' });
    expect(stored.find((s) => s.id === 'c1')?.performances[0]).toMatchObject({ feeling: 'tres_bien', feelingSymbol: '++' });
  });
});
