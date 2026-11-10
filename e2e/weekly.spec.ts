import { expect, test, type Page } from '@playwright/test';
import type { Session } from '../src/domain/types';
import type { ActivityRecord } from '../src/activities/model';
import { addExercise, doExercise, finishSession, openSettingsSection, readSessions, reloadAfterWrites, startSession, writeSessions } from './helpers';

/** Séance terminée à la salle (semaine fictive d'octobre 2026, heure de Paris), 3 séries par exercice, toutes vertes. */
function gym(id: string, iso: string, variantIds: string[], cardioMinutes = 0): Session {
  const t = Date.parse(iso);
  return {
    id, name: 'Séance', date: iso.slice(0, 10), startedAt: t, endedAt: t + 3_600_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: variantIds.map((variantId) => ({ variantId, weightKg: 20, targetReps: 10, plannedSets: 3, reps: [10, 10, 10], feeling: 'bien' })),
    ...(cardioMinutes ? { cardio: [{ id: `${id}-tapis`, machineId: 'tapis', machine: 'Tapis de marche', incline: 'neutre' as const, minutes: cardioMinutes }] } : {}),
  };
}

/** Cases du récapitulatif, dans l'ordre affiché : [groupe, couleur, texte]. */
function cells(page: Page) {
  return page.getByTestId('weekly-recap').locator('li[data-group]').evaluateAll((els) =>
    els.map((e) => [e.getAttribute('data-group'), e.getAttribute('data-color'), e.textContent!.replace(/\s+/g, ' ')]),
  );
}

async function noOverflow(page: Page): Promise<void> {
  for (const width of [412, 360, 320]) {
    await page.setViewportSize({ width, height: 915 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width} px`).toBe(true);
    const frame = (await page.getByTestId('weekly-recap').boundingBox())!;
    for (const box of await page.getByTestId('weekly-recap').locator('li[data-group]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))) {
      expect(box.left, `${width} px`).toBeGreaterThanOrEqual(frame.x);
      expect(box.right, `${width} px`).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
    }
  }
  await page.setViewportSize({ width: 412, height: 915 });
}

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
    await expect(page.getByRole('button', { name: 'Démarrer une séance' })).toBeVisible();
    await expect(recap.getByRole('heading')).toHaveText(/: 1\sséance$/);
    const pecs = recap.locator('[data-group="pectoraux"]');
    // Version 1.45.0 : score en séries ; 3 séries de pec deck → orange (de 3 au seuil du rouge, 10 par défaut).
    await expect(pecs).toHaveAttribute('data-color', 'orange');
    await expect(pecs).toHaveText('Pectoraux (3 séries) · aujourd’hui');
    // L'orange passe après les verts.
    await expect(recap.locator('li[data-group]').last()).toHaveAttribute('data-group', 'pectoraux');

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

  test('306. Cases en séries (version 1.45.0) : directes, indirectes ÷ 2, 3 séries par activité, 3 pour 45 min de cardio ; vert sous 3, orange, rouge à partir du seuil réglable ; format smartphone', async ({ page }) => {
    // Jeudi 22 octobre 2026, 10 h. Lundi : grosse séance de jambes (4 exercices × 3 séries) et un tirage vertical (dos 3,
    // biceps 3 ÷ 2) ; mardi : curl aux haltères ; mercredi : curl à la barre droite.
    await page.clock.setFixedTime(new Date('2026-10-22T10:00:00'));
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    await writeSessions(page, [
      gym('j19', '2026-10-19T18:00:00', ['presse-a-cuisses', 'leg-extension', 'leg-curl', 'adducteurs-machine', 'tirage-vertical']),
      gym('b20', '2026-10-20T18:00:00', ['curl-biceps-halteres']),
      gym('b21', '2026-10-21T18:00:00', ['curl-biceps-barre-droite']),
    ]);
    await reloadAfterWrites(page);
    const recap = page.getByTestId('weekly-recap');
    await expect(recap.getByRole('heading')).toHaveText(/: 3\sséances$/);
    // Jambes 12 séries → rouge (seuil 10 par défaut) ; biceps 3 + 3 + 1,5 = 7,5 → orange, « hier » ; dos 3 → orange ;
    // rien ailleurs → vert, sans nombre. Tri : vert, orange (« hier » en dernier), rouge.
    expect(await cells(page)).toEqual([
      ['pectoraux', 'vert', 'Pectoraux'],
      ['epaules', 'vert', 'Épaules'],
      ['triceps', 'vert', 'Triceps'],
      ['dos', 'orange', 'Dos (3 séries)'],
      ['biceps', 'orange', 'Biceps (7,5 séries) · hier'],
      ['jambes', 'rouge', 'Jambes (12 séries)'],
    ]);
    await noOverflow(page);

    // Seuil du rouge réglable, en séries : à 12, les jambes (12) restent rouges (seuil compris) ; à 13, orange.
    await page.goto('./#/reglages');
    const settings = await openSettingsSection(page, 'Récapitulatif de la semaine');
    const red = settings.getByRole('group', { name: 'Rouge à partir de (séries)' });
    await expect(red.locator('output')).toHaveText('10');
    await red.getByRole('button', { name: 'Rouge à partir de (séries) : plus' }).click();
    await red.getByRole('button', { name: 'Rouge à partir de (séries) : plus' }).click();
    await expect(red.locator('output')).toHaveText('12');
    await page.goto('./#/');
    await expect(recap.locator('[data-group="jambes"]')).toHaveAttribute('data-color', 'rouge');
    await page.goto('./#/reglages');
    await openSettingsSection(page, 'Récapitulatif de la semaine');
    await red.getByRole('button', { name: 'Rouge à partir de (séries) : plus' }).click();
    await expect(red.locator('output')).toHaveText('13');
    await page.goto('./#/');
    await expect(recap.locator('[data-group="jambes"]')).toHaveAttribute('data-color', 'orange');
    await expect(recap.locator('[data-group="jambes"]')).toHaveText('Jambes (12 séries)');
    // Enregistré en séries, gardé après relance.
    await reloadAfterWrites(page);
    await expect(recap.locator('[data-group="jambes"]')).toHaveAttribute('data-color', 'orange');
    expect(await page.evaluate(() => new Promise((resolve) => {
      const open = indexedDB.open('myfitapp');
      open.onsuccess = () => {
        const req = open.result.transaction('meta').objectStore('meta').get('weeklyRecap');
        req.onsuccess = () => (open.result.close(), resolve(req.result));
      };
    }))).toMatchObject({ redSets: 13 });

    // Badminton de lundi confirmé (jambes et épaules : 3 séries chacun) et 50 min de tapis mardi matin (jambes : 3 séries).
    const badminton: ActivityRecord = {
      id: 'act-badminton-2026-10-19', habitId: 'badminton', date: '2026-10-19', name: 'Badminton', start: '21:00', end: '22:30',
      groups: ['jambes', 'epaules'], status: 'done', answeredAt: Date.parse('2026-10-19T22:40:00'),
    };
    await writeSessions(page, [gym('t20', '2026-10-20T07:00:00', [], 50)]);
    await page.evaluate(
      (activities) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('myfitapp');
          open.onsuccess = () => {
            const tx = open.result.transaction('meta', 'readwrite');
            tx.objectStore('meta').put(activities, 'activities');
            tx.oncomplete = () => (open.result.close(), resolve());
            tx.onerror = () => reject(tx.error);
          };
        }),
      [badminton],
    );
    await reloadAfterWrites(page);
    await expect(recap.getByRole('heading')).toHaveText(/: 4\sséances\s·\s1\sactivité\s·\s50\smin\sde cardio$/);
    // Jambes 12 + 3 (badminton) + 3 (cardio) = 18 → rouge même au seuil de 13 ; épaules 3 (badminton) → orange.
    expect(await cells(page)).toEqual([
      ['pectoraux', 'vert', 'Pectoraux'],
      ['triceps', 'vert', 'Triceps'],
      ['dos', 'orange', 'Dos (3 séries)'],
      ['epaules', 'orange', 'Épaules (3 séries · badminton)'],
      ['biceps', 'orange', 'Biceps (7,5 séries) · hier'],
      ['jambes', 'rouge', 'Jambes (18 séries · badminton · +50 min cardio)'],
    ]);
    await noOverflow(page);
    await test.info().attach('recap-series', { body: await recap.screenshot(), contentType: 'image/png' });
  });
});
