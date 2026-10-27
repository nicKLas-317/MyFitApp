import { expect, test } from '@playwright/test';
import { addExercise, doExercise, finishSession, openScreen, readExercises, readSessions } from './helpers';

test.describe('Salle et maison (version 1.26.0)', () => {
  test('258. Séance libre à la maison : sans chronomètre, suivi de la maison à part ; lieu changé dans le détail, les deux suivis recalculés', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-26T18:00:00'));
    await page.goto('./');
    // Salle par défaut : le choix du lieu est sous le bouton de la séance libre.
    const place = page.getByRole('group', { name: 'Lieu de la séance libre' });
    await expect(place.getByRole('button', { name: 'Salle' })).toHaveAttribute('aria-pressed', 'true');
    await expect(place.getByRole('button', { name: 'Maison' })).toHaveAttribute('aria-pressed', 'false');

    // Lundi, à la salle : curl biceps haltères à 12 kg.
    await page.getByRole('button', { name: 'Démarrer une séance', exact: true }).click();
    await expect(page.getByTestId('chrono')).toBeVisible();
    await doExercise(await addExercise(page, 'curl biceps haltères', 'Curl biceps haltères', '12'), 3, 'Bien');
    await finishSession(page);
    await expect(page.getByTestId('duration')).toBeVisible();

    // Mardi, à la maison : pas de chronomètre ; le curl n'y a jamais été fait (poids de départ demandé).
    await page.clock.setFixedTime(new Date('2026-10-27T18:00:00'));
    await page.goto('./');
    await place.getByRole('button', { name: 'Maison' }).click();
    await expect(place.getByRole('button', { name: 'Maison' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Démarrer une séance à la maison' }).click();
    await expect(page.getByTestId('session-place')).toHaveText('À la maison');
    await expect(page.getByTestId('chrono')).toHaveCount(0);
    // Récents : le curl (de la salle) est proposé ; à la maison, il demande son poids de départ.
    const curl = await addExercise(page, 'curl biceps haltères', 'Curl biceps haltères', '6');
    await expect(curl.getByTestId('next-target')).toHaveText('3 × 8 à 6 kg');
    await expect(curl.getByTestId('last-time')).toContainText('jamais réalisé');
    await doExercise(curl, 3, 'Bien');
    await finishSession(page);
    await expect(page.getByRole('main')).toContainText('à la maison');
    await expect(page.getByTestId('duration')).toHaveCount(0);

    // Accueil : de nouveau la salle par défaut ; « dont 1 maison » dans le récapitulatif.
    await page.getByRole('button', { name: 'Retour à l’accueil' }).click();
    await expect(place).toBeVisible();
    await page.reload();
    await expect(place.getByRole('button', { name: 'Salle' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Démarrer une séance', exact: true })).toBeVisible();
    await expect(page.getByTestId('weekly-recap')).toContainText('2 séances · dont 1 maison');
    // Biceps : 1 à la salle, 3 séries à la maison (« +3 séries maison », version 1.28.0) ; épaules (secondaire du curl) : rien.
    await expect(page.getByTestId('weekly-recap').locator('[data-group="biceps"] .recap-count')).toHaveText(/^ \(1× · \+3\s+séries\s+maison\)$/);
    await expect(page.getByTestId('weekly-recap').locator('[data-group="biceps"]')).toHaveAttribute('data-color', 'orange');
    await expect(page.getByTestId('weekly-recap').locator('[data-group="epaules"] .recap-count')).toHaveCount(0);
    let saved = (await readSessions(page)).sort((a, b) => (a.date < b.date ? -1 : 1));
    expect(saved.map((s) => [s.date, s.location ?? 'salle', s.performances[0]?.weightKg])).toEqual([
      ['2026-10-26', 'salle', 12],
      ['2026-10-27', 'maison', 6],
    ]);

    // Fiche : la prochaine cible de la salle (12 kg), et celle de la maison à part (6 kg) ; historique « maison ».
    await page.goto('./#/exercice/curl-biceps-halteres');
    await expect(page.getByTestId('sheet-next')).toHaveText('3 × 8');
    await expect(page.getByTestId('next-target').first()).toHaveText('3 × 8 à 12 kg');
    const homeBlock = page.getByTestId('sheet-home');
    await expect(homeBlock).toContainText('Prochaine cible à la maison');
    await expect(homeBlock.getByTestId('sheet-next-home')).toHaveText('3 × 8');
    await expect(homeBlock.getByTestId('next-target')).toHaveText('3 × 8 à 6 kg');
    await expect(page.getByRole('list', { name: 'Historique de l’exercice' }).getByRole('listitem').first()).toContainText('maison');

    // Historique : « · maison » ; détail sans heures ni durée, lieu « Maison ».
    await openScreen(page, 'Historique');
    await expect(page.getByRole('main')).toContainText('1 ex. · maison');
    await page.goto(`./#/historique/${saved[1]!.id}`);
    await expect(page.getByRole('main')).toContainText('27 octobre 2026 · à la maison');
    await expect(page.getByRole('main')).not.toContainText(/\d+ h \d{2} –/);
    const detailPlace = page.getByRole('group', { name: 'Lieu de la séance' });
    await expect(detailPlace.getByRole('button', { name: 'Maison' })).toHaveAttribute('aria-pressed', 'true');

    // Lieu changé pour la salle : la séance rejoint le suivi de la salle (6 kg après 12 kg, palier choisi), plus de suivi
    // à la maison ; heures et durée réapparaissent.
    await detailPlace.getByRole('button', { name: 'Salle' }).click();
    await expect(detailPlace.getByRole('button', { name: 'Salle' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('main')).toContainText('27 octobre 2026 · 18 h 00');
    saved = (await readSessions(page)).sort((a, b) => (a.date < b.date ? -1 : 1));
    expect(saved[1]!.location).toBeUndefined();
    await page.goto('./#/exercice/curl-biceps-halteres');
    await expect(page.getByTestId('next-target').first()).toHaveText('3 × 8 à 6 kg');
    await expect(page.getByTestId('sheet-home')).toHaveCount(0);

    // Et de nouveau à la maison : tout redevient comme avant.
    await page.goto(`./#/historique/${saved[1]!.id}`);
    await page.getByRole('group', { name: 'Lieu de la séance' }).getByRole('button', { name: 'Maison' }).click();
    await expect(page.getByRole('main')).toContainText('27 octobre 2026 · à la maison');
    await page.goto('./#/exercice/curl-biceps-halteres');
    await expect(page.getByTestId('next-target').first()).toHaveText('3 × 8 à 12 kg');
    await expect(page.getByTestId('sheet-home').getByTestId('next-target')).toHaveText('3 × 8 à 6 kg');
    expect((await readSessions(page)).find((s) => s.id === saved[1]!.id)?.location).toBe('maison');

    // Plage de la maison réglable par exercice : 8 à 15 par défaut, enregistrée seulement si elle change.
    await page.goto('./#/modifier/curl-biceps-halteres');
    const standard = page.getByRole('group', { name: 'Variante standard' });
    await expect(standard.getByLabel('Maison : rép. min')).toHaveValue('8');
    await expect(standard.getByLabel('Maison : rép. max')).toHaveValue('15');
    await standard.getByLabel('Maison : rép. max').fill('20');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByTestId('sheet-home')).toBeVisible();
    expect((await readExercises(page)).find((e) => e.id === 'curl-biceps-halteres')?.variants[0]?.config).toEqual({ homeMaxReps: 20 });
  });
});
