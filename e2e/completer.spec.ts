import { expect, test } from '@playwright/test';
import { addExercise, doExercise, exerciseCard, finishSession, readSessions } from './helpers';

test.describe('Compléter une séance terminée le même jour (version 1.28.0)', () => {
  test('266. Lien discret sur l’accueil, bouton principal dans le détail ; ce qui était fait reste fermé ; une seule séance, durée sans la pause', async ({ page }) => {
    // Mardi 8 h, à la maison : développé incliné haltères 3 × 8.
    await page.clock.setFixedTime(new Date('2026-10-27T08:00:00'));
    await page.goto('./');
    const place = page.getByRole('group', { name: 'Lieu de la séance libre' });
    await expect(page.getByRole('button', { name: /^Compléter la séance/ })).toHaveCount(0);
    await place.getByRole('button', { name: 'Maison' }).click();
    await page.getByRole('button', { name: 'Démarrer une séance à la maison' }).click();
    await doExercise(await addExercise(page, 'développé incliné haltères', 'Développé incliné — Haltères', '10'), 3, 'Bien');
    await page.clock.setFixedTime(new Date('2026-10-27T08:30:00'));
    await finishSession(page);
    await page.getByRole('button', { name: 'Retour à l’accueil' }).click();
    // La fin de séance est écrite en base avant de recharger.
    await expect.poll(async () => (await readSessions(page))[0]?.state).toBe('done');

    // Accueil : un lien discret (pas un bouton plein), sous le choix du lieu, au style de « Préparer ma prochaine séance ».
    await page.clock.setFixedTime(new Date('2026-10-27T09:00:00'));
    await page.reload();
    const link = page.getByRole('button', { name: 'Compléter la séance de ce matin' });
    await expect(link).toHaveClass(/\blink\b/);
    await expect(link).not.toHaveClass(/\bbtn\b/);
    const prepare = page.getByRole('button', { name: 'Préparer ma prochaine séance' });
    expect((await link.boundingBox())!.y).toBeLessThan((await prepare.boundingBox())!.y);
    expect((await place.boundingBox())!.y).toBeLessThan((await link.boundingBox())!.y);
    await expect(page.getByRole('button', { name: 'Démarrer une séance', exact: true })).toBeVisible();

    // Rouverte, à la maison : le développé est fermé (« déjà fait », ne s'ouvre pas) ; « Annuler les ajouts » sans ajout
    // rend la séance du matin telle quelle.
    await link.click();
    await expect(page.getByTestId('session-place')).toHaveText('À la maison');
    const incline = exerciseCard(page, 'Développé incliné — Haltères');
    await expect(incline.getByTestId('locked')).toHaveText(' · déjà fait');
    await expect(incline.locator('button.card-header')).toHaveCount(0);
    await expect(incline.getByRole('button', { name: /^Actions : / })).toHaveCount(0);
    await expect.poll(async () => (await readSessions(page))[0]?.state).toBe('active');
    const before = (await readSessions(page))[0]!;
    expect(before).toMatchObject({ state: 'active', locked: { variantIds: ['developpe-incline--halteres'], cardioIds: [] } });
    await page.getByRole('button', { name: 'Actions : Séance' }).click();
    await page.getByRole('menuitem', { name: 'Annuler les ajouts' }).click();
    const sheet = page.getByRole('dialog', { name: 'Annuler les ajouts ?' });
    await expect(sheet.getByTestId('cancel-loss')).toHaveText('Rien n’a été saisi. La séance terminée reste enregistrée.');
    await sheet.getByRole('button', { name: 'Oui, annuler les ajouts' }).click();
    await expect(link).toBeVisible();
    await expect.poll(async () => (await readSessions(page))[0]?.state).toBe('done');
    let saved = await readSessions(page);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ state: 'done', endedAt: new Date('2026-10-27T08:30:00').getTime(), location: 'maison' });
    expect(saved[0]).not.toHaveProperty('locked');
    expect(saved[0]!.performances.map((p) => p.variantId)).toEqual(['developpe-incline--halteres']);

    // Complétée avec 2 séries de pompes : une seule séance, deux exercices ; récapitulatif « +5 séries maison », vert.
    await link.click();
    await doExercise(await addExercise(page, 'pompes', 'Pompes — Classiques'), 2, 'Bien');
    await expect(incline.getByTestId('locked')).toBeVisible();
    await finishSession(page);
    await expect(page.locator('.recap-item')).toHaveCount(2);
    await expect.poll(async () => (await readSessions(page))[0]?.performances.length).toBe(2);
    await expect.poll(async () => (await readSessions(page))[0]?.state).toBe('done');
    saved = await readSessions(page);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ state: 'done', location: 'maison' });
    expect(saved[0]).not.toHaveProperty('locked');
    expect(saved[0]!.performances.map((p) => [p.variantId, p.reps])).toEqual([
      ['developpe-incline--halteres', [8, 8, 8]],
      ['pompes', [10, 10]],
    ]);
    await page.getByRole('button', { name: 'Retour à l’accueil' }).click();
    const recap = page.getByTestId('weekly-recap');
    await expect(recap).toContainText('1 séance · dont 1 maison');
    await expect(recap.locator('[data-group="pectoraux"] .recap-count')).toHaveText(/^ \(\+5\s+séries\s+maison\)$/);
    await expect(recap.locator('[data-group="pectoraux"]')).toHaveAttribute('data-color', 'vert');

    // À la salle, 12 h – 12 h 30 ; complétée à 18 h depuis le détail (bouton principal), terminée à 18 h 15 : 45 min.
    await page.clock.setFixedTime(new Date('2026-10-27T12:00:00'));
    await page.reload();
    await page.getByRole('button', { name: 'Démarrer une séance', exact: true }).click();
    await doExercise(await addExercise(page, 'pec deck', 'Pec deck', '40'), 3, 'Bien');
    await page.clock.setFixedTime(new Date('2026-10-27T12:30:00'));
    await finishSession(page);
    await expect(page.getByTestId('duration')).toHaveText('30 min');
    await page.clock.setFixedTime(new Date('2026-10-27T18:00:00'));
    await page.goto('./');
    await expect(page.getByRole('button', { name: 'Compléter la séance de cet après-midi' })).toBeVisible();
    await expect.poll(async () => (await readSessions(page)).find((s) => !s.location)?.state).toBe('done');
    const gym = (await readSessions(page)).find((s) => !s.location)!;
    await page.goto(`./#/historique/${gym.id}`);
    const complete = page.getByRole('button', { name: 'Compléter cette séance' });
    await expect(complete).toHaveClass(/\bprimary\b/);
    await expect(page.getByRole('button', { name: 'Nouvelle séance à partir de celle-ci' })).not.toHaveClass(/\bprimary\b/);
    await complete.click();
    await expect(page.getByTestId('chrono')).toHaveText('30:00');
    await expect(exerciseCard(page, 'Pec deck').getByTestId('locked')).toBeVisible();
    await page.getByRole('link', { name: 'Ajouter un exercice' }).click();
    await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill('pompes');
    await page.getByRole('button', { name: /^Pompes Classiques/ }).first().click();
    await doExercise(exerciseCard(page, 'Pompes — Classiques'), 2, 'Bien');
    await page.clock.setFixedTime(new Date('2026-10-27T18:15:00'));
    await finishSession(page);
    await expect(page.getByTestId('duration')).toHaveText('45 min');
    await expect.poll(async () => (await readSessions(page)).find((s) => s.id === gym.id)?.endedAt).toBe(new Date('2026-10-27T18:15:00').getTime());
    const after = (await readSessions(page)).find((s) => s.id === gym.id)!;
    expect(after).toMatchObject({ state: 'done', endedAt: new Date('2026-10-27T18:15:00').getTime(), pauseMs: 330 * 60_000 });
    await page.goto(`./#/historique/${gym.id}`);
    await expect(page.getByRole('main')).toContainText('12 h 00 – 18 h 15 · 45 min');

    // Le lendemain : plus de lien, plus de bouton « Compléter » dans le détail.
    await page.clock.setFixedTime(new Date('2026-10-28T09:00:00'));
    await page.goto(`./#/historique/${gym.id}`);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Nouvelle séance à partir de celle-ci' })).toHaveClass(/\bprimary\b/);
    await expect(page.getByRole('button', { name: 'Compléter cette séance' })).toHaveCount(0);
    await page.goto('./');
    await expect(page.getByRole('button', { name: /^Compléter la séance/ })).toHaveCount(0);
  });
});
