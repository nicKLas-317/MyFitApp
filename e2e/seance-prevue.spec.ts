import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Performance, Session, SessionPlan } from '../src/domain/types';
import { addExercise, exerciseCard, finishSession, finishSheet, readSessions, writeSessions } from './helpers';

/** Séance terminée : chaque exercice fait à la cible, « Bien passé » (vert). */
function past(day: number, perfs: [string, number, number][]): Session {
  const t = new Date(2026, 9, day, 18).getTime();
  return {
    id: `p${day}`, name: `Passée ${day}`, date: `2026-10-${String(day).padStart(2, '0')}`, startedAt: t, endedAt: t + 3_600_000,
    createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: perfs.map(([variantId, weightKg, target]): Performance => ({
      variantId, weightKg, targetReps: target, plannedSets: 3, reps: [target, target, target], feeling: 'bien',
    })),
  };
}

/** Pec deck : une verte à 3×8 (35 kg) ; chest press : deux vertes à 3×12 (40 kg) ; leg curl : 3×10 (25 kg). */
const HISTORY = [past(12, [['pec-deck', 35, 8], ['chest-press', 40, 12], ['leg-curl', 25, 10]]), past(15, [['chest-press', 40, 12]])];

async function seed(page: Page, sessions: Session[], when: string): Promise<void> {
  await page.clock.setFixedTime(new Date(when));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
  await writeSessions(page, sessions);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
}

function readPlan(page: Page): Promise<SessionPlan | null> {
  return page.evaluate(
    () =>
      new Promise<SessionPlan | null>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('meta').objectStore('meta').get('plan');
          req.onsuccess = () => {
            resolve((req.result as SessionPlan | undefined) ?? null);
            db.close();
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

const main = (page: Page) => page.getByRole('main');
const planItem = (page: Page, name: string) => page.getByRole('list', { name: 'Exercices prévus' }).getByRole('listitem', { name, exact: true });

/** Ajoute un exercice au plan depuis l'écran d'ajout (recherche) ; `startWeight` pour un exercice jamais réalisé. */
async function planExercise(page: Page, query: string, name: string, startWeight?: string): Promise<void> {
  await main(page).getByRole('button', { name: '+ Exercice' }).click();
  await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill(query);
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click();
  if (startWeight !== undefined) {
    await page.getByLabel('Poids de départ (kg)').fill(startWeight);
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Séance prévue' })).toBeVisible();
  await expect(planItem(page, name)).toBeVisible();
}

const target = (item: Locator) => item.getByTestId('next-target');
const hint = (item: Locator) => item.locator('.next-hint');

test.describe('Séance prévue (§5.9)', () => {
  test('244. Préparée, gardée après une séance libre, réalisée 3 jours plus tard et modifiée à la salle ; non faits signalés ; export et import', async ({ page }) => {
    await seed(page, HISTORY, '2026-10-20T09:00:00');

    // Accueil sans plan : « Démarrer une séance », et « Préparer ma prochaine séance » (discret).
    await expect(main(page).getByRole('button', { name: 'Démarrer une séance' })).toBeVisible();
    await main(page).getByRole('button', { name: 'Préparer ma prochaine séance' }).click();
    await expect(page.getByRole('heading', { name: 'Séance prévue' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Onglets' })).toBeVisible(); // au calme, pas en mode salle

    // Même écran d'ajout qu'en séance ; charge et cible du moteur affichées dès la préparation.
    await planExercise(page, 'pec deck', 'Pec deck');
    await planExercise(page, 'chest press', 'Chest press');
    await planExercise(page, 'leg extension', 'Leg extension', '30');
    await planExercise(page, 'curl biceps haltères', 'Curl biceps haltères', '10');
    await expect(target(planItem(page, 'Pec deck'))).toHaveText('3 × 8 à 35 kg');
    await expect(hint(planItem(page, 'Pec deck'))).toHaveText('= Même cible : consolide');
    await expect(target(planItem(page, 'Chest press'))).toHaveText('3 × 12 à 40 kg');
    await expect(hint(planItem(page, 'Chest press'))).toHaveText('↑ Poids supérieur → 3 × 8');
    await expect(target(planItem(page, 'Leg extension'))).toHaveText('3 × 8 à 30 kg');
    // Déjà prévu : pas ajouté deux fois.
    await main(page).getByRole('button', { name: '+ Exercice' }).click();
    await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill('pec deck');
    await expect(page.getByRole('button', { name: /^Pec deck/ }).first()).toContainText('déjà prévu');
    await page.getByRole('button', { name: /^Pec deck/ }).first().click();
    await expect(page.getByRole('list', { name: 'Exercices prévus' }).getByRole('listitem')).toHaveCount(4);

    // Réordonner : le chest press en tête ; la première carte n'a pas « Monter », la dernière pas « Descendre ».
    await planItem(page, 'Chest press').getByRole('button', { name: 'Monter : Chest press' }).click();
    await expect(page.getByRole('list', { name: 'Exercices prévus' }).getByRole('listitem')).toHaveText([/^Chest press/, /^Pec deck/, /^Leg extension/, /^Curl biceps haltères/]);
    await expect(planItem(page, 'Chest press').getByRole('button', { name: /^Monter/ })).toHaveCount(0);
    await expect(planItem(page, 'Curl biceps haltères').getByRole('button', { name: /^Descendre/ })).toHaveCount(0);
    // Cardio prévu.
    await main(page).getByRole('button', { name: '+ Cardio' }).click();
    await page.getByRole('form', { name: 'Cardio' }).getByLabel('Durée (min)').fill('15');
    await page.getByRole('form', { name: 'Cardio' }).getByRole('button', { name: 'Valider', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Cardio' })).toContainText('Tapis de marche · inclinaison neutre · 15 min');
    const prepared = (await readPlan(page))!;
    expect(prepared.exercises).toEqual([
      { variantId: 'chest-press' },
      { variantId: 'pec-deck' },
      { variantId: 'leg-extension', startWeightKg: 30 },
      { variantId: 'curl-biceps-halteres', startWeightKg: 10 },
    ]);
    expect(prepared.cardio).toMatchObject([{ machine: 'Tapis de marche', incline: 'neutre', minutes: 15 }]);

    // Accueil avec un plan : « Démarrer la séance prévue », « Séance libre » en secondaire, résumé et « Modifier ».
    await page.getByRole('link', { name: 'Accueil' }).click();
    await expect(main(page).getByRole('button', { name: 'Démarrer la séance prévue' })).toBeVisible();
    await expect(page.getByTestId('plan-summary')).toHaveText('Chest press · Pec deck · Leg extension · Curl biceps haltères · Tapis de marche · inclinaison neutre · 15 min');
    await expect(main(page).getByRole('button', { name: 'Modifier ma séance prévue' })).toBeVisible();

    // Séance libre entre-temps : le pec deck reçoit sa deuxième verte ; le plan reste intact.
    await main(page).getByRole('button', { name: 'Séance libre' }).click();
    const free = await addExercise(page, 'pec deck', 'Pec deck');
    await free.getByRole('button', { name: 'Valider les 3 séries' }).click();
    await free.getByRole('button', { name: 'Bien', exact: true }).click();
    await finishSession(page);
    await page.goto('./');
    await expect(main(page).getByRole('button', { name: 'Démarrer la séance prévue' })).toBeVisible();
    expect(await readPlan(page)).toEqual(prepared);
    // La préparation suit déjà le moteur : 3 × 9 et « ↑ +1 rép. ».
    await main(page).getByRole('button', { name: 'Modifier ma séance prévue' }).click();
    await expect(target(planItem(page, 'Pec deck'))).toHaveText('3 × 9 à 35 kg');
    await expect(hint(planItem(page, 'Pec deck'))).toHaveText('↑ +1 rép.');

    // Trois jours plus tard : 1 appui, la séance s'ouvre en mode salle avec le plan, dans l'ordre, déjà rempli.
    await page.clock.setFixedTime(new Date('2026-10-23T18:00:00'));
    await page.goto('./');
    await main(page).getByRole('button', { name: 'Démarrer la séance prévue' }).click();
    await expect(page.getByTestId('chrono')).toBeVisible();
    await expect(page.locator('article.exercise-card')).toHaveText([/^Chest press/, /^Pec deck/, /^Leg extension/, /^Curl biceps haltères/]);
    const chest = exerciseCard(page, 'Chest press');
    await expect(chest).toHaveClass(/open/); // le premier exercice prévu est ouvert
    await expect(chest.getByTestId('next-target')).toHaveText('3 × 12 à 40 kg');
    await expect(chest.getByTestId('progress-marker')).toHaveText('↑ Poids supérieur → 3 × 8');
    const pec = exerciseCard(page, 'Pec deck');
    await pec.locator('.card-header').click();
    await expect(pec.getByTestId('next-target')).toHaveText('3 × 9 à 35 kg'); // recalculée au démarrage
    await expect(pec.getByTestId('progress-marker')).toHaveText('↑ +1 rép.');
    await expect(pec.locator('.set.next .step-value')).toHaveText('9');

    // Pec deck : « Valider les 3 séries » puis le ressenti.
    await pec.getByRole('button', { name: 'Valider les 3 séries' }).click();
    await pec.getByRole('button', { name: 'Très bien', exact: true }).click();
    // Modifié à la salle : charge du chest press (poids supérieur), séries une par une ; un exercice ajouté.
    await chest.locator('.card-header').click();
    await chest.getByLabel('Poids (kg)').fill('45');
    await chest.getByLabel('Poids (kg)').press('Enter');
    await expect(chest.getByTestId('next-target')).toHaveText('3 × 8 à 45 kg');
    for (let i = 0; i < 3; i++) await chest.getByRole('button', { name: 'Valider', exact: true }).click();
    await chest.getByRole('button', { name: 'Bien', exact: true }).click();
    const legCurl = await addExercise(page, 'leg curl', 'Leg curl');
    await legCurl.getByRole('button', { name: 'Valider les 3 séries' }).click();
    await legCurl.getByRole('button', { name: 'Bien', exact: true }).click();
    // Cardio prévu : validé en un appui.
    await page.getByRole('button', { name: 'Valider le cardio prévu : Tapis de marche · inclinaison neutre · 15 min' }).click();
    await expect(page.getByRole('list', { name: 'Cardio prévu' })).toHaveCount(0);

    // Fin : les deux exercices prévus non faits sont signalés, sans bloquer.
    await page.getByRole('button', { name: 'Terminer la séance' }).click();
    await expect(finishSheet(page).getByTestId('planned-not-done')).toHaveText(
      '2 exercices prévus non faits (Leg extension, Curl biceps haltères) : pas enregistrés.',
    );
    await finishSheet(page).getByRole('button', { name: 'Oui, terminer' }).click();
    await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible();
    const done = (await readSessions(page)).find((s) => s.fromPlan)!;
    expect(done.state).toBe('done');
    expect(done.date).toBe('2026-10-23');
    expect(done.performances.map((p) => [p.variantId, p.weightKg, p.targetReps, p.reps, p.feeling])).toEqual([
      ['chest-press', 45, 8, [8, 8, 8], 'bien'],
      ['pec-deck', 35, 9, [9, 9, 9], 'tres_bien'],
      ['leg-curl', 25, 10, [10, 10, 10], 'bien'],
    ]);
    expect(done.cardio).toEqual(prepared.cardio);
    expect(done.fromPlan?.planId).toBe(prepared.id);
    // Le plan est consommé : l'accueil revient à « Démarrer une séance ».
    await expect.poll(() => readPlan(page)).toBeNull();
    await page.goto('./');
    await expect(main(page).getByRole('button', { name: 'Démarrer une séance' })).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Préparer ma prochaine séance' })).toBeVisible();

    // Export puis import : le plan est dans la sauvegarde et revient après suppression.
    await main(page).getByRole('button', { name: 'Préparer ma prochaine séance' }).click();
    await planExercise(page, 'pec deck', 'Pec deck');
    const plan = await readPlan(page);
    await page.goto('./#/donnees');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter mes données' }).click();
    const file = await (await downloading).path();
    await page.goto('./#/seance-prevue');
    await page.getByRole('button', { name: 'Supprimer la séance prévue' }).click();
    await page.getByRole('button', { name: 'Oui, retirer' }).click();
    await expect.poll(() => readPlan(page)).toBeNull();
    await page.goto('./#/donnees');
    await page.getByLabel('Fichier à importer').setInputFiles(file);
    await expect(page.getByTestId('plan-session-plan')).toHaveText('Séance prévue à ajouter (1 exercice)');
    await page.getByRole('button', { name: 'Ajouter à mes données' }).click();
    await expect(page.getByText(/Import terminé : 0 séance ajoutée, séance prévue ajoutée\./)).toBeVisible();
    expect(await readPlan(page)).toEqual(plan);
  });

  test('245. Appuis pour une séance de 5 exercices : sans plan, puis avec plan (aucun défilement)', async ({ page }) => {
    const five = ['pec-deck', 'chest-press', 'leg-curl', 'leg-extension', 'curl-biceps-halteres'] as const;
    await seed(page, [past(12, five.map((id) => [id, 20, 8] as [string, number, number]))], '2026-10-20T09:00:00');
    const names = ['Pec deck', 'Chest press', 'Leg curl', 'Leg extension', 'Curl biceps haltères'];
    let taps = 0;
    const tap = async (target: Locator) => {
      await expect(target).toBeInViewport();
      await target.click();
      taps++;
    };
    const bar = page.getByRole('navigation', { name: 'Actions de la séance' });
    const finish = async () => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await tap(bar.getByRole('button', { name: 'Terminer la séance' }));
      await tap(finishSheet(page).getByRole('button', { name: 'Oui, terminer' }));
      await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible();
    };

    // Sans plan : démarrer 1 ; par exercice : ajouter 2 (« + Exercice », l'exercice récent), séries 1, ressenti 1 ; terminer 2.
    await tap(main(page).getByRole('button', { name: 'Démarrer une séance' }));
    for (const name of names) {
      await tap(bar.getByRole('link', { name: 'Ajouter un exercice' }));
      await tap(page.getByRole('button', { name: new RegExp(`^${name}`) }).first());
      const card = exerciseCard(page, name);
      await tap(card.getByRole('button', { name: 'Valider les 3 séries' }));
      await tap(card.getByRole('button', { name: 'Bien', exact: true }));
    }
    await finish();
    expect(taps).toBe(1 + 5 * 4 + 2); // 23 (série par série, comme avant : 33)

    // Avec plan, préparé au calme (non compté) : démarrer 1 ; par exercice : séries 1, ressenti 1 (le ressenti ouvre
    // l'exercice suivant et l'amène à l'écran : 0 appui pour l'ouvrir) ; terminer 2.
    await page.goto('./#/seance-prevue');
    for (const name of names) await planExercise(page, name.toLowerCase(), name);
    await page.goto('./');
    taps = 0;
    await tap(main(page).getByRole('button', { name: 'Démarrer la séance prévue' }));
    for (const name of names) {
      const card = exerciseCard(page, name);
      await expect(card).toHaveClass(/open/);
      await tap(card.getByRole('button', { name: 'Valider les 3 séries' }));
      await tap(card.getByRole('button', { name: 'Bien', exact: true }));
    }
    // Tout est terminé : rien d'autre ne s'ouvre, le dernier exercice reste ouvert.
    await expect(page.locator('article.exercise-card.open')).toHaveCount(1);
    await expect(exerciseCard(page, 'Curl biceps haltères')).toHaveClass(/open/);
    await finish();
    expect(taps).toBe(1 + 5 * 2 + 2); // 13 (17 en 1.23.0)
    const sessions = await readSessions(page);
    expect(sessions.filter((s) => s.state === 'done' && s.date === '2026-10-20').map((s) => s.performances.length)).toEqual([5, 5]);
  });
});
