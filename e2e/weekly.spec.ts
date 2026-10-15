import { expect, test } from '@playwright/test';
import { addExercise, doExercise, finishSession, readSessions, startSession } from './helpers';

test.describe('Récapitulatif hebdomadaire de l’accueil (§19.6)', () => {
  test('visible sans clic ni défilement sur smartphone ; mis à jour après une séance terminée puis supprimée', async ({ page }) => {
    await page.goto('./');
    const recap = page.getByTestId('weekly-recap');
    await expect(recap).toBeVisible();
    await expect(recap.getByRole('heading')).toHaveText(/^Semaine du lun\.\s\d+(\s\S+)? au dim\.\s\d+\s\S+\s: 0\sséance$/);
    await expect(recap.locator('[data-color="vert"]')).toHaveCount(6);
    await expect(recap.locator('[data-group="abdominaux"]')).toHaveCount(0);

    // Entièrement visible dans la fenêtre du téléphone, au-dessus du bouton de démarrage, sans défilement.
    const viewport = page.viewportSize()!;
    const box = (await recap.boundingBox())!;
    const button = (await page.getByRole('button', { name: 'Démarrer une séance' }).boundingBox())!;
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.y + box.height).toBeLessThanOrEqual(button.y);

    // Une séance en cours ne compte pas ; terminée, elle apparaît au retour sur l'accueil.
    await startSession(page);
    const card = await addExercise(page, 'pec deck', 'Pec deck', '30');
    await doExercise(card, 3, 'Bien');
    await page.goto('./#/');
    await expect(recap.locator('[data-group="pectoraux"]')).toHaveAttribute('data-color', 'vert');
    await page.goto('./#/seance');
    await finishSession(page);
    await page.getByRole('button', { name: 'Garder ce nom' }).click();
    await expect(recap.getByRole('heading')).toHaveText(/: 1\sséance$/);
    const pecs = recap.locator('[data-group="pectoraux"]');
    await expect(pecs).toHaveAttribute('data-color', 'orange');
    await expect(pecs).toHaveText('Pectoraux (1×) · aujourd’hui');
    // L'orange passe après les verts.
    await expect(recap.locator('li').last()).toHaveAttribute('data-group', 'pectoraux');

    // Suppression de la séance : le récapitulatif redevient vert.
    const [session] = await readSessions(page);
    await page.goto(`./#/historique/${session!.id}`);
    await page.getByRole('button', { name: 'Supprimer la séance' }).click();
    await page.getByRole('button', { name: 'Oui, supprimer' }).click();
    await expect(page.getByRole('searchbox', { name: 'Rechercher une séance' })).toBeVisible();
    await page.goto('./#/');
    await expect(recap.getByRole('heading')).toHaveText(/: 0\sséance$/);
    await expect(pecs).toHaveAttribute('data-color', 'vert');
  });
});
