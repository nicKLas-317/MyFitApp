import { expect, test, type Page } from '@playwright/test';
import type { CardioMachine, Session } from '../src/domain/types';
import { finishSession, openSettingsSection, reloadAfterWrites, startSession, writeSessions } from './helpers';

function done(id: string, iso: string, variantIds: string[], cardio: [string, string, number][]): Session {
  const t = Date.parse(iso);
  return {
    id, name: 'Séance', date: iso.slice(0, 10), startedAt: t, endedAt: t + 3_600_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: variantIds.map((variantId) => ({ variantId, weightKg: 30, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' })),
    cardio: cardio.map(([machineId, machine, minutes], i) => ({ id: `${id}-c${i}`, machineId, machine, minutes, ...(machineId === 'tapis' ? { incline: 'neutre' as const } : {}) })),
  };
}

function readMachines(page: Page): Promise<CardioMachine[]> {
  return page.evaluate(
    () =>
      new Promise<CardioMachine[]>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onsuccess = () => {
          const req = open.result.transaction('meta').objectStore('meta').get('cardioMachines');
          req.onsuccess = () => (open.result.close(), resolve(req.result as CardioMachine[]));
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

test.describe('Cardio pour les jambes (version 1.41.0)', () => {
  test('297. Récapitulatif : « +45 min cardio » dans la case Jambes à partir de 45 min (rameur exclu) ; case « Compte pour les jambes » des réglages ; bilans de la semaine et du mois ; lisible à 412, 360 et 320 px', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00'));
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    // Lundi : chest press, 20 min de tapis et 15 de rameur ; mercredi : tirage, 15 min d'elliptique. Comptées : 35 min.
    await writeSessions(page, [
      done('s1', '2026-10-26T18:00:00', ['chest-press'], [['tapis', 'Tapis de marche', 20], ['rameur', 'Rameur', 15]]),
      done('s2', '2026-10-28T18:00:00', ['tirage-vertical'], [['elliptique', 'Vélo elliptique', 15]]),
    ]);
    await reloadAfterWrites(page);
    const recap = page.getByTestId('weekly-recap');
    const legs = recap.locator('[data-group="jambes"]');
    await expect(recap.getByRole('heading')).toHaveText(/: 2\sséances · 50\smin\sde cardio$/);
    await expect(legs).toHaveText('Jambes');

    // Une séance de cardio seul, 10 min de vélo : 45 min → « Jambes (3 séries · +45 min cardio) », orange (version 1.45.0 :
    // 3 séries, orange à partir de 3).
    await startSession(page);
    await page.getByRole('button', { name: 'Ajouter du cardio' }).click();
    const form = page.getByRole('form', { name: 'Cardio' });
    await form.getByRole('button', { name: 'Vélo', exact: true }).click();
    await form.getByLabel('Durée (min)').fill('10');
    await form.getByRole('button', { name: 'Valider', exact: true }).click();
    await finishSession(page);
    await page.getByRole('button', { name: 'Retour à l’accueil' }).click();
    await expect(legs).toHaveText('Jambes (3 séries · +45 min cardio)');
    await expect(legs).toHaveAttribute('data-color', 'orange');
    // Aucune autre case ne change ; pas de « hier » / « aujourd'hui » pour le cardio.
    await expect(recap.locator('[data-group="pectoraux"]')).toHaveText('Pectoraux (3 séries)');
    await expect(recap.locator('[data-group="dos"]')).toHaveText('Dos (3 séries) · hier');

    // Réglages : « Compte pour les jambes », cochée par défaut, décochée pour le rameur ; une nouvelle machine est cochée.
    await page.goto('./#/reglages');
    const machines = await openSettingsSection(page, 'Machines de cardio');
    const legsBox = (name: string) => machines.getByRole('checkbox', { name: `Compte pour les jambes : ${name}`, exact: true });
    for (const name of ['Tapis de marche', 'Vélo elliptique', 'Vélo', 'Autre']) await expect(legsBox(name)).toBeChecked();
    await expect(legsBox('Rameur')).not.toBeChecked();
    await machines.getByLabel('Nouvelle machine').fill('Marches');
    await machines.getByRole('button', { name: 'Ajouter' }).click();
    await expect(legsBox('Marches')).toBeChecked();
    // Les cases tiennent dans leur ligne, 48 px de haut, à 412, 360 et 320 px.
    for (const width of [412, 360, 320]) {
      await page.setViewportSize({ width, height: 800 });
      for (const label of await machines.locator('.machine-legs').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))) {
        expect(label.height, `${width}px`).toBeGreaterThanOrEqual(48);
        expect(label.right, `${width}px`).toBeLessThanOrEqual(width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width}px`).toBe(true);
    }
    await page.setViewportSize({ width: 412, height: 915 });
    // Rameur coché, elliptique décoché : 20 + 15 + 10 = 45 → toujours 3 séries ; enregistré (la case de chaque machine changée).
    await legsBox('Rameur').check();
    await legsBox('Vélo elliptique').uncheck();
    await machines.getByRole('button', { name: 'Enregistrer les machines' }).click();
    await expect(machines.getByText('Machines enregistrées.')).toBeVisible();
    expect((await readMachines(page)).map((m) => [m.name, m.legs])).toEqual([
      ['Tapis de marche', undefined], ['Rameur', true], ['Vélo elliptique', false], ['Vélo', undefined], ['Autre', undefined], ['Marches', undefined],
    ]);
    await reloadAfterWrites(page);
    await openSettingsSection(page, 'Machines de cardio');
    await expect(legsBox('Rameur')).toBeChecked();
    await expect(legsBox('Vélo elliptique')).not.toBeChecked();
    // Tapis décoché aussi : 25 min (rameur 15, vélo 10) → plus rien.
    await legsBox('Tapis de marche').uncheck();
    await machines.getByRole('button', { name: 'Enregistrer les machines' }).click();
    await page.goto('./');
    await expect(legs).toHaveText('Jambes');
    await page.goto('./#/reglages');
    await openSettingsSection(page, 'Machines de cardio');
    await legsBox('Tapis de marche').check();
    await machines.getByRole('button', { name: 'Enregistrer les machines' }).click();
    await page.goto('./');
    await expect(legs).toHaveText('Jambes (3 séries · +45 min cardio)');

    // Le récapitulatif reste dans son cadre, sans défilement horizontal.
    for (const width of [412, 360, 320]) {
      await page.setViewportSize({ width, height: 915 });
      const frame = (await recap.boundingBox())!;
      const cell = (await legs.boundingBox())!;
      expect(cell.x + cell.width, `${width}px`).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width}px`).toBe(true);
      await test.info().attach(`recap-${width}`, { body: await recap.screenshot(), contentType: 'image/png' });
    }

    // Bilan de la semaine : bâton des jambes à 3 séries, phrase sous le tableau, texte du mail (version 1.45.0).
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto('./#/bilan-periode/semaine/2026-10-26');
    const chart = page.getByTestId('groups-chart');
    await expect(chart.locator('[data-group="jambes"]')).toHaveAttribute('data-total', '3');
    await expect(chart.locator('[data-group="jambes"]')).not.toHaveClass(/groups-idle/);
    await expect(page.getByTestId('groups-cardio')).toHaveText('Jambes : +3 séries pour 45 min de cardio.');
    await expect(page.getByTestId('report-text')).toContainText('- Jambes : 3 séries (+45 min cardio)\n');
    await expect(page.getByTestId('report-text')).not.toContainText('Non travaillés : Jambes');
    // Bilan du mois : 3 séries par semaine, ici une seule semaine.
    await page.goto('./#/bilan-periode/mois/2026-10');
    await expect(page.getByTestId('groups-cardio')).toHaveText('Jambes : +3 séries pour le cardio, 1 semaine à 45 min ou plus (45 min).');
    await expect(page.getByTestId('report-text')).toContainText('- Jambes : 3 séries (+45 min cardio sur 1 semaine)\n');
    for (const width of [412, 360, 320]) {
      await page.setViewportSize({ width, height: 915 });
      const note = (await page.getByTestId('groups-cardio').boundingBox())!;
      expect(note.x + note.width, `${width}px`).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width}px`).toBe(true);
    }
  });
});
