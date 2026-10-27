import { expect, test, type Page } from '@playwright/test';
import type { SessionPlan } from '../src/domain/types';
import { addExercise, cardAction, doExercise, exerciseCard, finishSession, readSessions, startSession } from './helpers';

const PLAN: SessionPlan = {
  id: 'plan-plus-tard', createdAt: 0, updatedAt: 0,
  items: [
    { kind: 'exercise', variantId: 'chest-press', startWeightKg: 40 },
    { kind: 'cardio', block: { id: 'prevu-tapis', machineId: 'tapis', machine: 'Tapis de marche', incline: 'neutre', minutes: 15 } },
    { kind: 'exercise', variantId: 'pec-deck', startWeightKg: 30 },
  ],
};

/** Lit (`value` absent) ou enregistre la séance prévue dans la base. */
function planMeta(page: Page, value?: SessionPlan): Promise<SessionPlan | undefined> {
  return page.evaluate(
    (plan) =>
      new Promise<SessionPlan | undefined>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onsuccess = () => {
          const tx = open.result.transaction('meta', plan ? 'readwrite' : 'readonly');
          const request = plan ? tx.objectStore('meta').put(plan, 'plan') : tx.objectStore('meta').get('plan');
          tx.oncomplete = () => (open.result.close(), resolve(plan ? undefined : (request.result as SessionPlan | undefined)));
          tx.onerror = () => reject(tx.error);
        };
      }),
    value,
  );
}

const order = (page: Page) => page.locator('.cards > article, .cards > [data-cardio]').evaluateAll((els) =>
  els.map((el) => el.getAttribute('aria-label') ?? `cardio:${el.getAttribute('data-cardio')}`),
);

test.describe('« Plus tard » en séance (version 1.29.0)', () => {
  test('268. « Plus tard » dans le menu ⋯ : l’exercice ou le cardio prévu passe en fin de liste, le suivant non terminé s’ouvre ; plan intact', async ({ page }) => {
    // Séance libre : pec deck, leg curl, chest press.
    await page.clock.setFixedTime(new Date('2026-10-28T18:00:00'));
    await startSession(page);
    await addExercise(page, 'pec deck', 'Pec deck', '30');
    await addExercise(page, 'leg curl', 'Leg curl', '25');
    await addExercise(page, 'chest press', 'Chest press', '40');
    // Pas de flèches de réordonnancement en séance.
    await expect(page.getByRole('button', { name: /monter|descendre/i })).toHaveCount(0);
    await expect(page.locator('.cards').getByRole('button', { name: /^[↑↓]$/ })).toHaveCount(0);

    // Pec deck ouvert, « Plus tard » (premier choix du menu) : en fin de liste, fermé ; le leg curl s'ouvre.
    const pecDeck = exerciseCard(page, 'Pec deck');
    await pecDeck.locator('.card-header').click();
    await pecDeck.getByRole('button', { name: 'Actions : Pec deck' }).click();
    await expect(pecDeck.getByRole('menuitem').first()).toHaveText('Plus tard');
    await pecDeck.getByRole('menuitem', { name: 'Plus tard' }).click();
    await expect.poll(() => order(page)).toEqual(['Leg curl', 'Chest press', 'Pec deck']);
    await expect(exerciseCard(page, 'Leg curl')).toHaveClass(/\bopen\b/);
    await expect(pecDeck).not.toHaveClass(/\bopen\b/);
    // Gardé après rechargement.
    await expect.poll(async () => (await readSessions(page))[0]?.later).toEqual(['pec-deck']);
    await page.reload();
    await expect.poll(() => order(page)).toEqual(['Leg curl', 'Chest press', 'Pec deck']);

    // Leg curl puis chest press faits : chaque ressenti ouvre le suivant, le pec deck en dernier.
    const legCurl = exerciseCard(page, 'Leg curl');
    await legCurl.locator('.card-header').click();
    await doExercise(legCurl, 3, 'Bien');
    await expect(exerciseCard(page, 'Chest press')).toHaveClass(/\bopen\b/);
    await doExercise(exerciseCard(page, 'Chest press'), 3, 'Bien');
    await expect(pecDeck).toHaveClass(/\bopen\b/);
    // Le seul exercice restant : « Plus tard » n'est pas proposé.
    await pecDeck.getByRole('button', { name: 'Actions : Pec deck' }).click();
    await expect(pecDeck.getByRole('menuitem', { name: 'Plus tard' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await doExercise(pecDeck, 3, 'Bien');
    await finishSession(page);
    // Enregistrée dans l'ordre réellement suivi, sans trace de « plus tard ».
    await expect.poll(async () => (await readSessions(page))[0]?.state).toBe('done');
    const [done] = await readSessions(page);
    expect(done!.performances.map((p) => p.variantId)).toEqual(['leg-curl', 'chest-press', 'pec-deck']);
    expect(done).not.toHaveProperty('later');

    // Séance prévue, le lendemain : chest press (ouvert), cardio prévu, pec deck.
    await page.clock.setFixedTime(new Date('2026-10-29T18:00:00'));
    await page.goto('./');
    await planMeta(page, PLAN);
    await page.reload();
    await page.getByRole('button', { name: 'Démarrer la séance prévue' }).click();
    await expect(exerciseCard(page, 'Chest press')).toHaveClass(/\bopen\b/);
    await cardAction(exerciseCard(page, 'Chest press'), 'Plus tard');
    // Le cardio prévu s'ouvre (« Valider » principal) ; il a lui aussi « Plus tard » dans son menu.
    await expect.poll(() => order(page)).toEqual(['cardio:prevu-tapis', 'Pec deck', 'Chest press']);
    const cardio = page.locator('[data-cardio="prevu-tapis"]');
    await expect(cardio).toHaveAttribute('aria-current', 'step');
    await cardio.getByRole('button', { name: /^Actions : cardio prévu/ }).click();
    await cardio.getByRole('menuitem', { name: 'Plus tard' }).click();
    await expect.poll(() => order(page)).toEqual(['Pec deck', 'Chest press', 'cardio:prevu-tapis']);
    await expect(exerciseCard(page, 'Pec deck')).toHaveClass(/\bopen\b/);
    await expect(cardio).not.toHaveAttribute('aria-current', 'step');
    // Le plan n'est pas modifié (ni en base, ni l'origine de la séance).
    expect(await planMeta(page)).toEqual(PLAN);
    const active = (await readSessions(page)).find((s) => s.state === 'active')!;
    expect(active.later).toEqual(['chest-press', 'cardio:prevu-tapis']);
    expect(active.fromPlan?.order).toEqual([
      { kind: 'exercise', variantId: 'chest-press' },
      { kind: 'cardio', id: 'prevu-tapis' },
      { kind: 'exercise', variantId: 'pec-deck' },
    ]);
  });
});
