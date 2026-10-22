import { expect, test } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { writeSessions } from './helpers';

function done(id: string, iso: string, variantIds: string[]): Session {
  const t = Date.parse(iso);
  return {
    id, name: 'Séance', date: iso.slice(0, 10), startedAt: t, endedAt: t + 3_600_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: variantIds.map((variantId) => ({ variantId, weightKg: 20, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' })),
  };
}

test.describe('Récapitulatif hebdomadaire : groupes secondaires (§19.6)', () => {
  test('187. Travail indirect affiché sans fraction, couleur selon le score, « hier » compris ; lisible à 412, 360 et 320 px', async ({ page }) => {
    // Vendredi 23 octobre 2026, 9 h : curl le lundi, développé couché le mardi, tractions assistées jeudi soir.
    await page.clock.setFixedTime(new Date('2026-10-23T09:00:00'));
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    await writeSessions(page, [
      done('s1', '2026-10-19T18:00:00', ['curl-biceps-halteres']),
      done('s2', '2026-10-20T18:00:00', ['developpe-couche']),
      done('s3', '2026-10-22T18:00:00', ['tractions-assistees']),
    ]);
    await page.reload();
    const recap = page.getByTestId('weekly-recap');
    await expect(recap.getByRole('heading')).toHaveText(/: 3\sséances$/);
    const cell = (g: string) => recap.locator(`[data-group="${g}"]`);
    // Biceps : 1 + ½ = 1,5 → orange ; dos : 1 ; triceps et épaules : ½ chacun (développé couché).
    await expect(cell('biceps')).toHaveText('Biceps (1× · +1 indirect) · hier');
    await expect(cell('biceps')).toHaveAttribute('data-color', 'orange');
    await expect(cell('dos')).toHaveText('Dos (1×) · hier');
    await expect(cell('pectoraux')).toHaveText('Pectoraux (1×)');
    await expect(cell('triceps')).toHaveText('Triceps (+1 indirect)');
    await expect(cell('epaules')).toHaveText('Épaules (+1 indirect)');
    await expect(cell('triceps')).toHaveAttribute('data-color', 'orange');
    await expect(cell('jambes')).toHaveText('Jambes');
    await expect(cell('jambes')).toHaveAttribute('data-color', 'vert');
    await expect(recap.locator('li').first()).toHaveAttribute('data-group', 'jambes');

    // Toujours visible sans défilement, au-dessus du bouton de démarrage, malgré les cases sur plusieurs lignes.
    const box = (await recap.boundingBox())!;
    const start = (await page.getByRole('button', { name: 'Démarrer une séance' }).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(Math.min(start.y, page.viewportSize()!.height));

    // Toutes les cases restent dans le cadre du récapitulatif, sans défilement horizontal, sur chaque largeur.
    for (const width of [412, 360, 320]) {
      await page.setViewportSize({ width, height: 915 });
      const frame = (await recap.boundingBox())!;
      for (const box of await recap.locator('li').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))) {
        expect(box.left, `${width}px`).toBeGreaterThanOrEqual(frame.x);
        expect(box.right, `${width}px`).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px`).toBe(true);
      await test.info().attach(`recap-${width}`, { body: await recap.screenshot(), contentType: 'image/png' });
    }
  });
});
