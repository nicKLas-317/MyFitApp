import { expect, test, type Page } from '@playwright/test';
import type { CardioMachine, Session } from '../src/domain/types';
import { openSettingsSection, writeSessions } from './helpers';

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

/** Une fenêtre gelée en arrière-plan revient au premier plan. */
async function backToForeground(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test.describe('Réglages entre fenêtres et ordre des séances d’un même jour (version 1.41.2)', () => {
  test('299. Un réglage enregistré dans une fenêtre est repris par les autres : récapitulatif, machines de cardio ; une fenêtre restée ouverte n’écrase plus le réglage de l’autre', async ({ page, context }) => {
    // Appli installée, restée ouverte sur l'accueil ; onglet Chrome sur les réglages.
    await page.goto('./');
    const recap = page.getByTestId('weekly-recap');
    await expect(recap.locator('[data-group="pectoraux"]')).toBeVisible();
    await expect(recap.locator('[data-group="abdominaux"]')).toHaveCount(0);
    const other = await context.newPage();
    await other.goto('./#/reglages');
    const recapSection = await openSettingsSection(other, 'Récapitulatif de la semaine');
    await recapSection.getByRole('button', { name: 'Abdominaux' }).click();
    await expect(recapSection.getByRole('button', { name: 'Abdominaux' })).toHaveAttribute('aria-pressed', 'true');
    // L'accueil de la première fenêtre suit, sans rechargement.
    await expect(recap.locator('[data-group="abdominaux"]')).toBeVisible();

    // Machines : tapis décoché dans l'onglet ; la première fenêtre, ouverte sur ses réglages, le voit décoché.
    await page.goto('./#/reglages');
    const machinesHere = await openSettingsSection(page, 'Machines de cardio');
    const machinesThere = await openSettingsSection(other, 'Machines de cardio');
    const tapis = (scope: typeof machinesHere) => scope.getByRole('checkbox', { name: 'Compte pour les jambes : Tapis de marche', exact: true });
    await expect(tapis(machinesHere)).toBeChecked();
    await tapis(machinesThere).uncheck();
    await machinesThere.getByRole('button', { name: 'Enregistrer les machines' }).click();
    await expect(machinesThere.getByText('Machines enregistrées.')).toBeVisible();
    await expect(tapis(machinesHere)).not.toBeChecked();
    // Une machine ajoutée ensuite dans la première fenêtre garde le tapis décoché (avant : l'ancienne liste l'écrasait).
    await machinesHere.getByLabel('Nouvelle machine').fill('Marches');
    await machinesHere.getByRole('button', { name: 'Ajouter' }).click();
    await machinesHere.getByRole('button', { name: 'Enregistrer les machines' }).click();
    await expect(machinesHere.getByText('Machines enregistrées.')).toBeVisible();
    const saved = await readMachines(page);
    expect(saved.find((m) => m.id === 'tapis')?.legs).toBe(false);
    expect(saved.map((m) => m.name)).toContain('Marches');
    await expect(machinesThere.getByRole('textbox', { name: /^Nom de la machine/ })).toHaveCount(saved.length);

    // Fenêtre sans canal entre fenêtres (gelée en arrière-plan) : elle relit aussi les réglages en revenant au premier plan.
    const background = await context.newPage();
    await background.addInitScript(() => {
      delete (window as { BroadcastChannel?: unknown }).BroadcastChannel;
    });
    await background.goto('./');
    const backgroundRecap = background.getByTestId('weekly-recap');
    await expect(backgroundRecap.locator('[data-group="abdominaux"]')).toBeVisible();
    await recapSection.getByRole('button', { name: 'Abdominaux' }).click();
    await expect(recapSection.getByRole('button', { name: 'Abdominaux' })).toHaveAttribute('aria-pressed', 'false');
    await expect(backgroundRecap.locator('[data-group="abdominaux"]')).toBeVisible();
    await backToForeground(background);
    await expect(backgroundRecap.locator('[data-group="abdominaux"]')).toHaveCount(0);
  });

  test('299 bis. Séance importée sans heure et séance saisie le même jour : historique, « Dernière fois » et récents dans l’ordre du moteur (la séance sans heure en dernier)', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-21T12:00:00'));
    await page.goto('./');
    await expect(page.getByTestId('weekly-recap')).toBeVisible();
    const t = Date.parse('2026-10-20T18:00:00');
    const base = { date: '2026-10-20', state: 'done' as const };
    const sessions: Session[] = [
      // Saisie dans l'appli à 18 h : chest press et pec deck à 30 kg.
      {
        ...base, id: 'app', name: 'Séance du 20 octobre 2026 — 18 h 00', startedAt: t, endedAt: t + 3_600_000, createdAt: t, updatedAt: t, origin: 'app',
        performances: ['chest-press', 'pec-deck'].map((variantId) => ({ variantId, weightKg: 30, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' as const })),
      },
      // Importée sans heure, enregistrée avant (le matin) : pec deck à 35 kg et leg curl.
      {
        ...base, id: 'import', name: 'Séance importée', startedAt: null, endedAt: null, createdAt: t - 8 * 3_600_000, updatedAt: t - 8 * 3_600_000, origin: 'import',
        performances: ['pec-deck', 'leg-curl'].map((variantId) => ({ variantId, weightKg: 35, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' as const })),
      },
    ];
    await writeSessions(page, sessions);
    await page.reload();

    // Historique : la séance importée en premier (la plus récente pour le moteur), puis celle de 18 h.
    await page.goto('./#/historique');
    await expect(page.locator('.history-line')).toHaveCount(2);
    await expect(page.locator('.history-line').nth(0)).toHaveAttribute('href', '#/historique/import');
    await expect(page.locator('.history-line').nth(1)).toHaveAttribute('href', '#/historique/app');

    // Fiche : « Dernière fois » = la séance importée (35 kg), comme l'historique.
    await page.goto('./#/exercice/pec-deck');
    await expect(page.getByTestId('last-time').first()).toContainText('35');

    // Récents : leg curl et pec deck (séance importée) avant chest press.
    await page.goto('./#/bibliotheque');
    const recents = page.locator('section', { has: page.getByRole('heading', { name: 'Récents' }) });
    await expect(recents.locator('.pick-button')).toHaveText([/^Pec deck/, /^Leg curl/, /^Chest press/]);
  });
});
