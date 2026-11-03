import { expect, test, type Page } from '@playwright/test';
import type { Session, SessionPlan } from '../src/domain/types';
import { weekHistory, WEEK_NOW } from '../src/plan/__tests__/completer-simulation';
import { exerciseCard, readSessions, tabBar, writeSessions } from './helpers';

/** Taille de police Android agrandie (simulation) : tout le texte à 115 %. */
async function largeText(page: Page): Promise<() => Promise<void>> {
  const style = await page.addStyleTag({ content: ':root { font-size: calc(17px * 1.15) !important; }' });
  return () => style.evaluate((el) => (el as Element).remove());
}

/** Données simulées (semaine du 9 nov., jusqu'au mercredi), l'horloge au `now` donné, sans séance prévue. */
async function open(page: Page, sessions: Session[] = weekHistory(), now = WEEK_NOW): Promise<void> {
  await page.clock.setFixedTime(new Date(now));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onsuccess = () => {
          const tx = open.result.transaction(['sessions', 'meta'], 'readwrite');
          tx.objectStore('sessions').clear();
          tx.objectStore('meta').delete('plan');
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await writeSessions(page, sessions);
  await page.reload();
  await expect(page.getByTestId('weekly-recap')).toBeVisible();
}

function readPlan(page: Page): Promise<SessionPlan | null> {
  return page.evaluate(
    () =>
      new Promise<SessionPlan | null>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onsuccess = () => {
          const req = open.result.transaction('meta').objectStore('meta').get('plan');
          req.onsuccess = () => (open.result.close(), resolve((req.result as SessionPlan | undefined) ?? null));
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

async function writePlan(page: Page, plan: SessionPlan): Promise<void> {
  await page.evaluate(
    (value) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onsuccess = () => {
          const tx = open.result.transaction('meta', 'readwrite');
          tx.objectStore('meta').put(value, 'plan');
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    plan,
  );
  await page.goto('./');
  await page.reload();
  await expect(page.getByTestId('weekly-recap')).toBeVisible();
}

const line = (page: Page) => page.getByTestId('week-suggestion');
const items = (page: Page) => page.getByRole('list', { name: 'Séance proposée' }).getByRole('listitem');
const planItems = (plan: SessionPlan | null) => plan?.items.map((i) => (i.kind === 'cardio' ? `cardio:${i.block.machine}:${i.block.minutes}` : i.variantId));
const SUGGESTED = ['cardio:Tapis de marche:10', 'leg-extension', 'elevations-laterales', 'extension-triceps-poulie', 'curl-biceps-halteres'];
const MINE: SessionPlan = { id: 'mon-plan', createdAt: WEEK_NOW - 3_600_000, updatedAt: WEEK_NOW - 3_600_000, items: [{ kind: 'exercise', variantId: 'pec-deck' }] };

/** Géométrie : débordement, éléments tactiles (hauteur, écart), cartes dans l'écran. */
function layout(page: Page) {
  return page.evaluate(() => {
    const taps = [...document.querySelectorAll('main a, main button')].filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getBoundingClientRect());
    let closest = Infinity;
    for (let i = 0; i < taps.length; i++)
      for (let j = i + 1; j < taps.length; j++) {
        const a = taps[i]!;
        const b = taps[j]!;
        const dx = Math.max(0, b.left - a.right, a.left - b.right);
        const dy = Math.max(0, b.top - a.bottom, a.top - b.bottom);
        closest = Math.min(closest, Math.max(dx, dy));
      }
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      minHeight: Math.min(...taps.map((r) => r.height)),
      closest,
      outside: [...document.querySelectorAll('main .card')].filter((c) => c.getBoundingClientRect().right > window.innerWidth).length,
    };
  });
}

test.describe('Séance pour compléter la semaine', () => {
  test('294. Ligne discrète à côté de « Préparer ma prochaine séance » ; écran avec l’échauffement, les exercices et la cible du moteur ; « En faire ma séance prévue », « Remplacer ma séance prévue » ; « Démarrer cette séance » sans toucher à la séance prévue ; recalculée après la séance ; rien le lundi avant une séance à la salle', async ({ page }) => {
    // Jeudi 12 nov., 9 h : pectoraux 2, dos 1 (travaillé hier), épaules, biceps, triceps 1,5, jambes 1.
    await open(page);
    await expect(line(page)).toHaveText('Séance pour compléter la semaine : Jambes · Épaules · Triceps · Biceps');
    // À côté de « Préparer ma prochaine séance », juste dessous ; lien d'action de 48 px ; « Démarrer » toujours à l'écran.
    expect(await line(page).evaluate((el) => el.previousElementSibling?.classList.contains('prepare-plan'))).toBe(true);
    expect((await line(page).boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await expect(page.getByRole('button', { name: 'Démarrer une séance' })).toBeInViewport();
    expect(await line(page).evaluate((el) => el.closest('[data-group-color]'))).toBeNull();

    // L'écran : onglet Séance, l'échauffement, puis les exercices dans l'ordre, chacun à la couleur de son groupe, avec
    // la charge et la cible du moteur.
    await line(page).click();
    await expect(page).toHaveURL(/#\/seance-prevue\/suggestion$/);
    await expect(page.getByRole('heading', { name: 'Compléter la semaine' })).toBeVisible();
    await expect(tabBar(page).getByRole('link', { name: /^Séance/ })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Pour aujourd’hui, à la salle : les groupes de ton récapitulatif encore sous 2 séances cette semaine.')).toBeVisible();
    await expect(items(page)).toHaveText([
      'Échauffement · Tapis de marche · inclinaison neutre · 10 min',
      /^Leg extension3 × 11 à 40 kg/,
      /^Élévations latérales haltères3 × 11 à 8 kg \/ haltère/,
      /^Extension triceps poulie — Corde3 × 11 à 40 kg/,
      /^Curl biceps haltères3 × 11 à 10 kg \/ haltère/,
    ]);
    await expect(items(page).nth(1).getByTestId('progress-marker')).toHaveText('↑ +1 rép.');
    expect(await items(page).evaluateAll((els) => els.map((el) => el.getAttribute('data-group-color')))).toEqual([null, 'jambes', 'epaules', 'triceps', 'biceps']);
    await expect(page.getByTestId('suggest-notes')).toHaveText(
      'Avec cette séance, à l’objectif : Épaules, Biceps, Triceps, Jambes.Encore sous l’objectif : Dos.Pas cette fois (séance à la salle hier) : Dos.',
    );
    for (const [width, scale] of [[412, 1], [360, 1], [320, 1], [360, 1.15]] as const) {
      await page.setViewportSize({ width, height: 800 });
      const restore = scale > 1 ? await largeText(page) : null;
      const geometry = await layout(page);
      expect(geometry, `écran à ${width} px`).toMatchObject({ overflow: 0, outside: 0 });
      expect(geometry.minHeight).toBeGreaterThanOrEqual(48);
      expect(geometry.closest).toBeGreaterThanOrEqual(8);
      await restore?.();
    }
    await page.setViewportSize({ width: 412, height: 915 });

    // « En faire ma séance prévue » (aucun plan) : copiée dans le plan, modifiable ; sur l'accueil, la séance prévue,
    // et plus de ligne (le plan la reprend).
    await page.getByRole('button', { name: 'En faire ma séance prévue' }).click();
    await expect(page).toHaveURL(/#\/seance-prevue$/);
    await expect(page.getByRole('list', { name: 'Exercices et cardio prévus' }).getByRole('listitem')).toHaveCount(5);
    expect(planItems(await readPlan(page))).toEqual(SUGGESTED);
    await page.goto('./');
    await expect(page.getByRole('button', { name: 'Démarrer la séance prévue' })).toBeVisible();
    await expect(line(page)).toHaveCount(0);

    // Une séance prévue préparée à la main : la ligne s'affiche à côté (sous son résumé), « Remplacer ma séance
    // prévue » demande confirmation ; « Non » la garde, « Oui, remplacer » la remplace.
    await writePlan(page, MINE);
    await expect(page.getByTestId('plan-summary')).toHaveText('Pec deck');
    expect(await line(page).evaluate((el) => el.previousElementSibling?.classList.contains('plan-summary'))).toBe(true);
    await line(page).click();
    await page.getByRole('button', { name: 'Remplacer ma séance prévue' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Remplacer ta séance prévue ?' });
    await expect(confirm).toContainText('Remplacer ta séance prévue par cette séance ?');
    await confirm.getByRole('button', { name: 'Non' }).click();
    expect((await readPlan(page))?.id).toBe('mon-plan');
    await page.getByRole('button', { name: 'Remplacer ma séance prévue' }).click();
    await confirm.getByRole('button', { name: 'Oui, remplacer' }).click();
    await expect(page).toHaveURL(/#\/seance-prevue$/);
    const replaced = await readPlan(page);
    expect(replaced?.id).not.toBe('mon-plan');
    expect(planItems(replaced)).toEqual(SUGGESTED);

    // « Démarrer cette séance » avec une séance prévue : déroulée comme une séance prévue (échauffement en tête, ouvert
    // en premier), la séance prévue n'est ni remplacée ni consommée.
    await writePlan(page, MINE);
    await line(page).click();
    await page.getByRole('button', { name: 'Démarrer cette séance' }).click();
    await expect(page.getByTestId('chrono')).toBeVisible();
    await expect(page.locator('.cards > *')).toHaveText([
      /^Prévu Tapis de marche · inclinaison neutre · 10 min/, /^Leg extension/, /^Élévations latérales haltères/, /^Extension triceps poulie/, /^Curl biceps haltères/,
    ]);
    await page.getByRole('button', { name: 'Valider le cardio prévu : Tapis de marche · inclinaison neutre · 10 min' }).click();
    const legs = exerciseCard(page, 'Leg extension');
    await expect(legs).toHaveClass(/open/);
    await legs.getByRole('button', { name: 'Valider les 3 séries' }).click();
    await legs.getByRole('button', { name: 'Bien', exact: true }).click();
    await page.getByRole('button', { name: 'Terminer la séance' }).click();
    await page.getByRole('button', { name: 'Oui, terminer' }).click();
    await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible();
    const done = (await readSessions(page)).find((s) => s.date === '2026-11-12')!;
    expect(done.fromPlan?.planId).not.toBe('mon-plan');
    expect(done.performances.map((p) => p.variantId)).toEqual(['leg-extension']);
    expect(done.cardio).toMatchObject([{ machine: 'Tapis de marche', minutes: 10 }]);
    expect((await readPlan(page))?.id).toBe('mon-plan');
    await page.getByRole('button', { name: 'Retour à l’accueil' }).click();
    // Recalculée après la séance : pour demain, jambes à l'objectif ; le dos a son tirage (qui complète le biceps).
    await expect(page.getByRole('button', { name: 'Démarrer la séance prévue' })).toBeVisible();
    await expect(line(page)).toHaveText('Séance pour compléter la semaine : Dos · Épaules · Triceps');
    await line(page).click();
    await expect(page.getByText('Pour demain, à la salle', { exact: false })).toBeVisible();
    await expect(page.getByTestId('suggest-notes')).toContainText('Biceps : complété par Tirage horizontal machine (appui pectoral) — Prise moyenne (groupe secondaire).');

    // Lundi matin, avant une séance à la salle : rien.
    await open(page, weekHistory([]), new Date(2026, 10, 9, 9).getTime());
    await expect(page.getByRole('button', { name: 'Démarrer une séance' })).toBeVisible();
    await expect(line(page)).toHaveCount(0);
  });
});
