import { expect, test } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { reloadAfterWrites, writeSessions } from './helpers';

function done(id: string, iso: string, variantIds: string[]): Session {
  const t = Date.parse(iso);
  return {
    id, name: 'Séance', date: iso.slice(0, 10), startedAt: t, endedAt: t + 3_600_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: variantIds.map((variantId) => ({ variantId, weightKg: 20, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' })),
  };
}

test.describe('Récapitulatif hebdomadaire : groupes secondaires (§19.6)', () => {
  test('187. Travail indirect compté pour moitié en séries, vert sous 3 séries, couleur et tri selon le score, « hier » compris ; lisible à 412, 360 et 320 px', async ({ page }) => {
    // Vendredi 23 octobre 2026, 9 h : curl le lundi, développé couché le mardi, tractions assistées jeudi soir.
    await page.clock.setFixedTime(new Date('2026-10-23T09:00:00'));
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    await writeSessions(page, [
      done('s1', '2026-10-19T18:00:00', ['curl-biceps-halteres']),
      done('s2', '2026-10-20T18:00:00', ['developpe-couche']),
      done('s3', '2026-10-22T18:00:00', ['tractions-assistees']),
    ]);
    await reloadAfterWrites(page);
    const recap = page.getByTestId('weekly-recap');
    await expect(recap.getByRole('heading')).toHaveText(/: 3\sséances$/);
    const cell = (g: string) => recap.locator(`[data-group="${g}"]`);
    // Version 1.45.0 : score en séries, indirectes ÷ 2. Biceps : 3 (curl) + 3 ÷ 2 (tractions) = 4,5 → orange ;
    // dos 3 et pectoraux 3 → orange ; triceps et épaules : 3 ÷ 2 (développé couché) = 1,5 → vert.
    await expect(cell('biceps')).toHaveText('Biceps (4,5 séries) · hier');
    await expect(cell('biceps')).toHaveAttribute('data-color', 'orange');
    await expect(cell('dos')).toHaveText('Dos (3 séries) · hier');
    await expect(cell('dos')).toHaveAttribute('data-color', 'orange');
    await expect(cell('pectoraux')).toHaveText('Pectoraux (3 séries)');
    await expect(cell('pectoraux')).toHaveAttribute('data-color', 'orange');
    await expect(cell('triceps')).toHaveText('Triceps (1,5 série)');
    await expect(cell('epaules')).toHaveText('Épaules (1,5 série)');
    await expect(cell('triceps')).toHaveAttribute('data-color', 'vert');
    await expect(cell('epaules')).toHaveAttribute('data-color', 'vert');
    await expect(cell('jambes')).toHaveText('Jambes');
    await expect(cell('jambes')).toHaveAttribute('data-color', 'vert');
    // Tri : le vert sans rien d'abord, puis les verts avec de l'indirect, puis les orange (« hier » en dernier, puis
    // score croissant : dos 3 avant biceps 4,5).
    expect(await recap.locator('li[data-group]').evaluateAll((els) => els.map((e) => e.getAttribute('data-group')))).toEqual(
      ['jambes', 'epaules', 'triceps', 'pectoraux', 'dos', 'biceps'],
    );

    // Toujours visible sans défilement, au-dessus du bouton de démarrage, malgré les cases sur plusieurs lignes.
    const box = (await recap.boundingBox())!;
    const start = (await page.getByRole('button', { name: 'Démarrer une séance' }).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(Math.min(start.y, page.viewportSize()!.height));

    // Toutes les cases restent dans le cadre du récapitulatif, sans défilement horizontal, sur chaque largeur.
    for (const width of [412, 360, 320]) {
      await page.setViewportSize({ width, height: 915 });
      const frame = (await recap.boundingBox())!;
      for (const box of await recap.locator('li[data-group]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))) {
        expect(box.left, `${width}px`).toBeGreaterThanOrEqual(frame.x);
        expect(box.right, `${width}px`).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width}px`).toBe(true);
      await test.info().attach(`recap-${width}`, { body: await recap.screenshot(), contentType: 'image/png' });
    }
  });
});
