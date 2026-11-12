import { expect, test, type Locator, type Page } from '@playwright/test';
import type { SessionPlan } from '../src/domain/types';
import { weekHistory, WEEK_NOW } from '../src/plan/__tests__/completer-simulation';
import { reloadAfterWrites, writeSessions } from './helpers';

/** Séance prévue de sept éléments : la préparation défile à 412 × 600 px. */
const PLAN: SessionPlan = {
  id: 'plan-fiche',
  createdAt: WEEK_NOW - 3_600_000,
  updatedAt: WEEK_NOW - 3_600_000,
  items: [
    { kind: 'cardio', block: { id: 'tapis-prevu', machineId: 'tapis', machine: 'Tapis de marche', incline: 'neutre', minutes: 10 } },
    { kind: 'exercise', variantId: 'chest-press' },
    { kind: 'exercise', variantId: 'pec-deck' },
    { kind: 'exercise', variantId: 'leg-extension' },
    { kind: 'exercise', variantId: 'elevations-laterales' },
    { kind: 'exercise', variantId: 'extension-triceps-poulie' },
    { kind: 'exercise', variantId: 'curl-biceps-halteres' },
  ],
};

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

/** Données simulées de la semaine du 9 nov. (jeudi 12, 9 h) et la séance prévue. */
async function open(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(WEEK_NOW));
  await page.setViewportSize({ width: 412, height: 600 });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
  await writeSessions(page, weekHistory());
  await page.evaluate(
    (plan) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onsuccess = () => {
          const tx = open.result.transaction('meta', 'readwrite');
          tx.objectStore('meta').put(plan, 'plan');
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    PLAN,
  );
  await reloadAfterWrites(page);
  await expect(page.getByTestId('plan-summary')).toBeVisible();
}

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
const card = (page: Page, variantId: string) => page.locator(`li[data-variant="${variantId}"]`);
const order = async (page: Page) => (await readPlan(page))!.items.map((i) => (i.kind === 'cardio' ? 'cardio' : i.variantId));

/** Clique au centre d'une zone sans élément tactile (texte de la cible), et vérifie que rien ne s'ouvre. */
async function tapStays(page: Page, target: Locator, what: string): Promise<void> {
  const url = page.url();
  await target.click();
  await page.waitForTimeout(150);
  expect(page.url(), what).toBe(url);
}

test.describe('Fiche depuis la séance prévue (version 1.48.0)', () => {
  test('314. Préparation : vignette ou nom → fiche ; retour (Android ou « ‹ ») au même endroit, ordre, cardio en cours de saisie et correction intacts ; les autres appuis ne changent pas', async ({ page }) => {
    await open(page);
    await page.goto('./#/seance-prevue');
    await expect(page.getByRole('heading', { name: 'Séance prévue' })).toBeVisible();

    // Zone d'appui : la vignette et le nom seulement, 48 px de haut, sans toucher le menu « ⋯ ».
    for (const id of ['chest-press', 'leg-extension', 'curl-biceps-halteres']) {
      const zone = await card(page, id).evaluate((li) => {
        const link = li.querySelector('a.sheet-link')!.getBoundingClientRect();
        const menu = li.querySelector('.menu-button')!.getBoundingClientRect();
        const name = li.querySelector('a.sheet-link strong')!.getBoundingClientRect();
        return { height: link.height, gap: menu.left - link.right, nameRight: Math.round(name.right), linkRight: Math.round(link.right), picto: !!li.querySelector('a.sheet-link .picto') };
      });
      expect(zone.height, id).toBeGreaterThanOrEqual(48);
      expect(zone.gap, id).toBeGreaterThanOrEqual(8);
      expect(zone.linkRight, `${id} : le lien s'arrête au nom`).toBe(zone.nameRight);
      expect(zone.picto, id).toBe(true);
    }
    await expect(card(page, 'chest-press').getByRole('link', { name: 'Chest press' })).toHaveAttribute('href', '#/exercice/chest-press');

    // Une préparation en cours : ordre changé (enregistré), cardio en cours de saisie (pas encore validé), défilement.
    await page.getByRole('button', { name: 'Descendre : Chest press' }).click();
    await expect.poll(() => order(page)).toEqual(['cardio', 'pec-deck', 'chest-press', 'leg-extension', 'elevations-laterales', 'extension-triceps-poulie', 'curl-biceps-halteres']);
    await page.getByRole('button', { name: '+ Cardio' }).click();
    await page.getByLabel('Durée (min)').fill('12');
    // La carte au milieu de l'écran (ni sous l'en-tête collant, ni sous la barre d'onglets) : la position au moment de
    // l'appui est celle mesurée ici.
    await card(page, 'leg-extension').evaluate((li) => li.scrollIntoView({ block: 'center' }));
    const y = await scrollY(page);
    expect(y).toBeGreaterThan(200);

    // Vignette → fiche ; bouton retour d'Android → la préparation, exactement comme elle était. Appui du doigt à
    // l'endroit de la vignette (sans que l'outil de test ne fasse défiler la page avant).
    const picto = (await card(page, 'leg-extension').locator('a.sheet-link .picto').boundingBox())!;
    await page.mouse.click(picto.x + picto.width / 2, picto.y + picto.height / 2);
    await expect(page).toHaveURL(/#\/exercice\/leg-extension$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Leg extension');
    await page.goBack();
    await expect(page).toHaveURL(/#\/seance-prevue$/);
    await expect.poll(() => scrollY(page)).toBe(y);
    await expect(page.getByLabel('Durée (min)')).toHaveValue('12');
    expect(await order(page)).toEqual(['cardio', 'pec-deck', 'chest-press', 'leg-extension', 'elevations-laterales', 'extension-triceps-poulie', 'curl-biceps-halteres']);

    // Nom → fiche ; flèche « ‹ » de la fiche → même chose (la dernière carte, plus bas).
    await card(page, 'curl-biceps-halteres').evaluate((li) => li.scrollIntoView({ block: 'center' }));
    const y2 = await scrollY(page);
    expect(y2).toBeGreaterThan(y);
    await card(page, 'curl-biceps-halteres').getByRole('link', { name: 'Curl biceps haltères' }).locator('strong').click();
    await expect(page).toHaveURL(/#\/exercice\/curl-biceps-halteres$/);
    await page.locator('.simple-header .back, header .back').first().click();
    await expect(page).toHaveURL(/#\/seance-prevue$/);
    await expect.poll(() => scrollY(page)).toBe(y2);
    await expect(page.getByLabel('Durée (min)')).toHaveValue('12');

    // Les autres appuis ne changent pas : la cible, le fond de la carte n'ouvrent rien ; « ↑ » réordonne.
    await tapStays(page, card(page, 'leg-extension').locator('.plan-target-text'), 'cible');
    await tapStays(page, card(page, 'elevations-laterales').locator('.plan-target-text'), 'cible');
    await page.getByRole('button', { name: 'Monter : Chest press' }).click();
    await expect.poll(() => order(page)).toEqual(['cardio', 'chest-press', 'pec-deck', 'leg-extension', 'elevations-laterales', 'extension-triceps-poulie', 'curl-biceps-halteres']);
    // Menu « ⋯ » ouvert : un appui sur le nom de la carte suivante ne fait que fermer le menu.
    await page.getByRole('button', { name: 'Actions : Chest press' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    // Un point du nom hors du panneau du menu (dans le panneau, on choisirait une action du menu).
    const next = (await card(page, 'pec-deck').locator('a.sheet-link strong').boundingBox())!;
    const panel = (await page.getByRole('menu').boundingBox())!;
    const [px, py] = [next.x + 4, next.y + next.height / 2];
    expect(px < panel.x || py > panel.y + panel.height, 'point hors du panneau').toBe(true);
    await page.mouse.click(px, py);
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/seance-prevue$/);
    // Le menu propose toujours la fiche, et le retrait.
    await page.getByRole('button', { name: 'Actions : Chest press' }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['Voir la fiche de l’exercice', 'Retirer de la séance prévue']);
    await page.keyboard.press('Escape');

    // Correction d'un cardio en cours : retrouvée au retour d'une fiche.
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByLabel('Durée (min)')).toHaveCount(0);
    await page.getByRole('button', { name: /^Actions : cardio/ }).click();
    await page.getByRole('menuitem', { name: 'Corriger' }).click();
    await page.getByLabel('Durée (min)').fill('25');
    await card(page, 'pec-deck').getByRole('link', { name: 'Pec deck' }).click();
    await expect(page).toHaveURL(/#\/exercice\/pec-deck$/);
    await page.goBack();
    await expect(page.getByLabel('Durée (min)')).toHaveValue('25');
    expect((await readPlan(page))!.items[0]).toMatchObject({ kind: 'cardio', block: { minutes: 10 } });

    // Ouverture neuve (accueil, puis la carte) : en haut, sans saisie en cours.
    await page.locator('.tab-bar a[href="#/"]').click();
    await page.getByRole('button', { name: /^Ma séance prévue/ }).click();
    await expect(page).toHaveURL(/#\/seance-prevue$/);
    await expect(page.getByLabel('Durée (min)')).toHaveCount(0);
    expect(await scrollY(page)).toBe(0);
  });

  test('314. Accueil : la carte « Ma séance prévue » reste un seul bouton, sans lien (version 1.48.1) ; suggestion : vignette ou nom → fiche, retour au même endroit ; séance à la salle inchangée', async ({ page }) => {
    await open(page);
    const summary = page.getByTestId('plan-summary');
    await expect(summary).toHaveText('Tapis de marche · inclinaison neutre · 10 min · Chest press · Pec deck · Leg extension · Élévations latérales haltères · Extension triceps poulie — Corde · Curl biceps haltères');
    // Aucun lien vers une fiche : toute la carte ouvre la préparation, comme en version 1.40.0.
    await expect(page.locator('.home-actions a')).toHaveCount(0);
    const cardButton = page.getByRole('button', { name: /^Ma séance prévue : / });
    await expect(cardButton).toHaveClass(/plan-summary/);
    await summary.getByText('Leg extension', { exact: false }).click();
    await expect(page).toHaveURL(/#\/seance-prevue$/);
    await page.goBack();

    // Suggestion : une confirmation ouverte et l'écran défilé, retrouvés au retour de la fiche.
    await page.setViewportSize({ width: 412, height: 450 });
    await page.goto('./#/seance-prevue/suggestion');
    await expect(page.getByRole('heading', { name: 'Compléter la semaine' })).toBeVisible();
    await page.getByRole('button', { name: 'Remplacer ma séance prévue' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Remplacer ta séance prévue ?' })).toBeVisible();
    const first = page.locator('.suggest-screen li[data-variant]').first();
    await tapStays(page, first.locator('.plan-target-text'), 'cible de la suggestion');
    await first.evaluate((li) => li.scrollIntoView({ block: 'center' }));
    const y = await scrollY(page);
    expect(y).toBeGreaterThan(50);
    const id = (await first.getAttribute('data-variant'))!;
    const zone = await first.evaluate((li) => ({ link: li.querySelector('a.sheet-link')!.getBoundingClientRect().height, picto: !!li.querySelector('a.sheet-link .picto') }));
    expect(zone).toEqual({ link: expect.any(Number), picto: true });
    expect(zone.link).toBeGreaterThanOrEqual(48);
    await first.locator('a.sheet-link .picto').click();
    await expect(page).toHaveURL(new RegExp(`#/exercice/${id}$`));
    await page.goBack();
    await expect(page).toHaveURL(/#\/seance-prevue\/suggestion$/);
    await expect.poll(() => scrollY(page)).toBe(y);
    await expect(page.getByRole('alertdialog', { name: 'Remplacer ta séance prévue ?' })).toBeVisible();
    // Le plan n'a pas été remplacé.
    expect((await readPlan(page))!.id).toBe('plan-fiche');

    // À la salle : la carte de l'exercice garde son accès par le menu « ⋯ », sans autre lien vers la fiche.
    await page.getByRole('button', { name: 'Non' }).click();
    await page.locator('.tab-bar a[href="#/"]').click();
    await page.getByRole('button', { name: 'Démarrer la séance prévue' }).click();
    await expect(page).toHaveURL(/#\/seance$/);
    await expect(page.locator('a.sheet-link, a.plan-summary-link')).toHaveCount(0);
    await page.locator('article[aria-label="Chest press"] .card-header').click();
    await page.getByRole('button', { name: 'Actions : Chest press' }).click();
    await expect(page.getByRole('menuitem', { name: 'Voir la fiche de l’exercice' })).toBeVisible();
  });
});
