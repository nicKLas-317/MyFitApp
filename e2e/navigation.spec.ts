import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { activeSession, addExercise, cardAction, doExercise, finishSheet, readSessions, tabBar, validateSets, writeSessions } from './helpers';

const ACCENT = 'rgb(91, 157, 255)';

function pecDeck(day: number, target = 8, weightKg = 35): Session {
  const t = new Date(2026, 9, day, 18).getTime();
  return {
    id: `p${day}`, name: `Passée ${day}`, date: `2026-10-${String(day).padStart(2, '0')}`, startedAt: t, endedAt: t + 3_600_000,
    createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: [{ variantId: 'pec-deck', weightKg, targetReps: target, plannedSets: 3, reps: [target, target, target], feeling: 'bien' }],
  };
}

async function seed(page: Page, sessions: Session[]): Promise<void> {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
  await writeSessions(page, sessions);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
}

const tab = (page: Page, name: string) => tabBar(page).getByRole('link', { name: new RegExp(`^${name}`) });
const sessionBar = (page: Page) => page.getByRole('navigation', { name: 'Actions de la séance' });

/** Écran actif : le titre principal ou, sur l'onglet Séance, le nom de l'appli. */
async function expectScreen(page: Page, heading: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

test.describe('Barre d’onglets, mode salle et bouton retour (§3.4, §5.8)', () => {
  test('227. Barre d’onglets fixe en bas : Séance, Historique, Progrès, Plus ; onglet actif visible ; contenu de chaque onglet', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-20T09:00:00'));
    await seed(page, [pecDeck(12), pecDeck(15)]);
    const bar = tabBar(page);
    await expect(bar.getByRole('link')).toHaveText(['Séance', 'Historique', /^Progrès/, 'Plus']);
    // Fixe, collée au bas de l'écran, 56 px de haut ; chaque onglet a son icône et son libellé.
    const box = (await bar.boundingBox())!;
    expect(box.height).toBe(56);
    expect(box.y + box.height).toBe(page.viewportSize()!.height);
    await page.mouse.wheel(0, 2000);
    expect((await bar.boundingBox())!.y + 56).toBe(page.viewportSize()!.height);
    expect(await bar.locator('svg.tab-icon').count()).toBe(4);
    expect(await bar.evaluate((el) => getComputedStyle(el).paddingBottom)).toBe('0px'); // zone système : env(safe-area-inset-bottom)
    // Onglet Séance par défaut : actif, en couleur d'accent ; les autres non.
    await expect(tab(page, 'Séance')).toHaveAttribute('aria-current', 'page');
    expect(await tab(page, 'Séance').evaluate((el) => getComputedStyle(el).color)).toBe(ACCENT);
    expect(await tab(page, 'Plus').evaluate((el) => getComputedStyle(el).color)).not.toBe(ACCENT);
    await expect(tab(page, 'Historique')).not.toHaveAttribute('aria-current');

    // Onglet Séance : récapitulatif puis « Démarrer une séance », rien d'autre à naviguer.
    const main = page.getByRole('main');
    await expect(main.getByTestId('weekly-recap')).toBeVisible();
    await expect(main.getByRole('button', { name: 'Démarrer une séance' })).toBeVisible();
    await expect(main.getByRole('link')).toHaveCount(0);
    await expect(page.locator('.report-banner')).toHaveCount(0);

    // Historique, Progrès, Plus : chacun devient actif.
    await tab(page, 'Historique').click();
    await expect(tab(page, 'Historique')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('searchbox', { name: 'Rechercher une séance' })).toBeVisible();
    await tab(page, 'Progrès').click();
    await expectScreen(page, 'Progrès');
    await expect(page.getByRole('navigation', { name: 'Bilans' }).getByRole('link')).toHaveText([
      'Bilan de progression',
      'Bilan de la semaine / du mois',
      'Par groupe musculaire',
    ]);
    await expect(page.getByRole('region', { name: 'Mon poids' }).getByRole('link', { name: 'Mon poids : pesées et graphique' })).toBeVisible();
    await tab(page, 'Plus').click();
    await expectScreen(page, 'Plus');
    await expect(page.getByRole('navigation', { name: 'Plus' }).getByRole('link')).toHaveText(['Bibliothèque d’exercices', 'Réglages', 'Importer / exporter']);
    // Le bouton et l'écran portent le même nom.
    await page.getByRole('link', { name: 'Importer / exporter' }).click();
    await expectScreen(page, 'Importer / exporter');
    await expect(tab(page, 'Plus')).toHaveAttribute('aria-current', 'page');
    // Les écrans d'un onglet le gardent actif.
    await page.goto('./#/bilan');
    await expect(tab(page, 'Progrès')).toHaveAttribute('aria-current', 'page');
    await page.goto('./#/exercice/pec-deck');
    await expect(tab(page, 'Plus')).toHaveAttribute('aria-current', 'page');
    // Rien ne dépasse, barre comprise, à 412, 360 et 320 px.
    await page.goto('./');
    for (const width of [412, 360, 320]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width} px`).toBeLessThanOrEqual(0);
      const tabs = await bar.getByRole('link').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
      for (const h of tabs) expect(h, `${width} px`).toBeGreaterThanOrEqual(48);
    }
  });

  test('228. Mode salle : écran plein sans onglets, liste compacte, barre du pouce « + Exercice », « + Cardio », « Terminer » ; la flèche ramène à l’onglet Séance', async ({ page }) => {
    await seed(page, [pecDeck(12), pecDeck(15)]);
    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    await expect(page.getByTestId('chrono')).toBeVisible();
    await expect(tabBar(page)).toHaveCount(0);
    const bar = sessionBar(page);
    await expect(bar.getByRole('link')).toHaveText(['+ Exercice']);
    await expect(bar.getByRole('button')).toHaveText(['+ Cardio', 'Terminer']);
    const viewport = page.viewportSize()!;
    const barBox = (await bar.boundingBox())!;
    expect(barBox.y + barBox.height).toBe(viewport.height);
    for (const b of await bar.locator('.btn').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(48);

    // « + Exercice » : la recherche, puis retour à la séance, l'exercice ouvert.
    const pec = await addExercise(page, 'pec deck', 'Pec deck');
    await validateSets(pec, 1);
    await addExercise(page, 'chest press', 'Chest press', '40');
    // Liste compacte : nom, charge, séries faites ; un seul exercice ouvert.
    await expect(pec.locator('.card-summary')).toHaveText('35 kg · 1/3');
    await expect(page.locator('article.exercise-card.open')).toHaveCount(1);
    await expect(pec.locator('.card-header')).toHaveAttribute('aria-expanded', 'false');

    // « + Cardio » : le formulaire, à l'écran.
    await bar.getByRole('button', { name: 'Ajouter du cardio' }).click();
    await expect(page.getByRole('form', { name: 'Cardio' })).toBeInViewport();
    await page.getByRole('form', { name: 'Cardio' }).getByRole('button', { name: 'Annuler' }).click();

    // « Terminer » : le volet de fin, puis « Non ».
    await bar.getByRole('button', { name: 'Terminer la séance' }).click();
    await expect(finishSheet(page)).toBeInViewport();
    await finishSheet(page).getByRole('button', { name: 'Non, continuer la séance' }).click();

    // La flèche « ‹ » ramène à l'onglet Séance sans terminer la séance ; reprise en un appui.
    await page.getByRole('link', { name: 'Accueil' }).click();
    await expect(tab(page, 'Séance')).toHaveAttribute('aria-current', 'page');
    const resume = page.getByRole('button', { name: /^Reprendre la séance/ });
    await expect(resume).toBeVisible();
    expect((await activeSession(page)).performances).toHaveLength(2);
    await resume.click();
    await expect(page.getByTestId('chrono')).toBeVisible();
    await expect(tabBar(page)).toHaveCount(0);
    // Le dernier exercice ouvert l'est toujours.
    await expect(page.locator('article.exercise-card.open')).toHaveAttribute('aria-label', 'Chest press');

    // Captures : mode salle à 412 et 360 px.
    await test.info().attach('mode-salle', { body: await page.screenshot(), contentType: 'image/png' });
    for (const width of [360, 320]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width} px`).toBeLessThanOrEqual(0);
    }
    // Barre du pouce à 360 px, texte agrandi à 115 % : chaque libellé sur une ligne, dans son bouton.
    await page.setViewportSize({ width: 360, height: 800 });
    await page.addStyleTag({ content: ':root { font-size: calc(17px * 1.15) !important; }' });
    const labels = await bar.locator('.btn').evaluateAll((els) =>
      els.map((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return { lines: new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size, fits: el.scrollWidth <= el.clientWidth };
      }),
    );
    expect(labels).toEqual([{ lines: 1, fits: true }, { lines: 1, fits: true }, { lines: 1, fits: true }]);
  });

  test('229. Bouton retour d’Android : suit la navigation, onglet → Séance, jamais de fermeture en pleine séance ni de saisie perdue', async ({ page }) => {
    await seed(page, [pecDeck(12), pecDeck(15)]);
    // Onglet → onglet : retour à la Séance, quel que soit le chemin.
    await tab(page, 'Progrès').click();
    await tab(page, 'Plus').click();
    await page.getByRole('link', { name: 'Réglages' }).click();
    await expectScreen(page, 'Réglages');
    await page.goBack();
    await expectScreen(page, 'Plus');
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    // Historique → détail → retour → historique → retour → Séance.
    await tab(page, 'Historique').click();
    await page.locator('a.session-link').first().click();
    await expect(page.getByRole('list', { name: 'Exercices de la séance' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('searchbox', { name: 'Rechercher une séance' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    // Adresse ouverte directement : « retour » mène à la Séance, il ne ferme pas l'appli.
    await page.goto('./#/reglages');
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();

    // Séance : fiche ouverte depuis le menu « ⋯ », retour → la séance.
    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    const pec = await addExercise(page, 'pec deck', 'Pec deck');
    await cardAction(pec, 'Voir la fiche de l’exercice');
    await expect(page).toHaveURL(/#\/exercice\/pec-deck$/);
    await page.goBack();
    await expect(page.getByTestId('chrono')).toBeVisible();
    // Après l'ajout d'un exercice, retour ne rouvre pas la recherche : il mène à la Séance.
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Reprendre la séance/ })).toBeVisible();
    // Pleine séance : sur l'onglet Séance, « retour » ne ferme pas l'appli (deux fois de suite).
    for (let i = 0; i < 2; i++) {
      await page.goBack();
      await expect(page.getByRole('button', { name: /^Reprendre la séance/ })).toBeVisible();
      expect(page.url()).toMatch(/MyFitApp\/#\/$/);
    }

    // Aucune saisie perdue : poids tapé sans quitter le champ, répétitions ajustées, cardio en cours.
    // (Le poids, plus léger, est tapé en dernier, sans quitter le champ : la cible devient celle du palier, 3 × 8.)
    await page.getByRole('button', { name: /^Reprendre la séance/ }).click();
    await pec.getByRole('button', { name: 'Répétitions série 1 : moins' }).click();
    await pec.getByRole('button', { name: 'Répétitions série 1 : moins' }).click();
    await sessionBar(page).getByRole('button', { name: 'Ajouter du cardio' }).click();
    const cardio = page.getByRole('form', { name: 'Cardio' });
    await cardio.getByRole('button', { name: 'Rameur', exact: true }).click();
    await cardio.getByLabel('Durée (min)').fill('12');
    await pec.getByLabel('Poids (kg)').fill('32,5');
    await page.goBack();
    await expect(page.getByRole('button', { name: /^Reprendre la séance/ })).toBeVisible();
    await expect.poll(async () => (await activeSession(page)).performances[0]?.weightKg).toBe(32.5);
    await page.getByRole('button', { name: /^Reprendre la séance/ }).click();
    await expect(pec.getByLabel('Poids (kg)')).toHaveValue('32,5');
    await expect(pec.getByTestId('target')).toHaveText('3 × 8');
    await expect(pec.locator('.set.next output')).toHaveText('7');
    await expect(cardio.getByLabel('Durée (min)')).toHaveValue('12');
    await expect(cardio.getByRole('button', { name: 'Rameur', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // Récapitulatif : le nom saisi est gardé si l'on part par « retour ».
    await cardio.getByRole('button', { name: 'Valider', exact: true }).click();
    await doExercise(pec, 3, 'Bien');
    await sessionBar(page).getByRole('button', { name: 'Terminer la séance' }).click();
    await finishSheet(page).getByRole('button', { name: 'Oui, terminer' }).click();
    await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible();
    await page.getByLabel('Nom de la séance').fill('Pectoraux');
    await page.goBack();
    // La séance terminée : retour ne ramène pas dans la séance, mais à l'onglet Séance.
    await expect(page.getByRole('button', { name: 'Démarrer une séance' })).toBeVisible();
    await expect.poll(async () => (await readSessions(page)).find((s) => s.state === 'done' && !s.id.startsWith('p'))?.name).toBe('Pectoraux');
  });

  test('230. Nombre d’appuis : aucune action de saisie n’en demande plus qu’avant, et sans défilement', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-20T09:00:00'));
    await seed(page, [pecDeck(12), pecDeck(15)]);
    let taps = 0;
    /** Un appui : l'élément doit déjà être à l'écran (aucun défilement). */
    const tap = async (target: Locator) => {
      await expect(target).toBeInViewport();
      await target.click();
      taps++;
    };
    const count = async (action: () => Promise<void>) => {
      taps = 0;
      await action();
      return taps;
    };

    // Démarrer une séance : 1 (avant : 1).
    expect(await count(() => tap(page.getByRole('button', { name: 'Démarrer une séance' })))).toBe(1);
    // Ajouter un exercice récent : 2, sans défilement (avant : 2, après défilement jusqu'au bouton).
    expect(
      await count(async () => {
        await tap(sessionBar(page).getByRole('link', { name: 'Ajouter un exercice' }));
        await tap(page.getByRole('button', { name: /^Pec deck/ }).first());
      }),
    ).toBe(2);
    const pec = page.locator('article[aria-label="Pec deck"]');
    // Une série : 1 ; le ressenti : 1 (avant : idem).
    expect(await count(() => tap(pec.getByRole('button', { name: 'Valider', exact: true })))).toBe(1);
    await validateSets(pec, 2);
    expect(await count(() => tap(pec.getByRole('button', { name: 'Bien', exact: true })))).toBe(1);
    // Six exercices : la barre reste à l'écran.
    for (const n of ['Chest press', 'Leg extension', 'Leg curl', 'Crunch machine', 'Curl biceps haltères']) await addExercise(page, n.toLowerCase(), n, '20');
    // Cardio : 2 et la durée (avant : 2, après défilement).
    expect(
      await count(async () => {
        await tap(sessionBar(page).getByRole('button', { name: 'Ajouter du cardio' }));
        await page.getByRole('form', { name: 'Cardio' }).getByLabel('Durée (min)').fill('10');
        await tap(page.getByRole('form', { name: 'Cardio' }).getByRole('button', { name: 'Valider', exact: true }));
      }),
    ).toBe(2);
    // Terminer : 2, sans défilement (avant : 2, après défilement jusqu'en bas).
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await count(async () => {
        await tap(sessionBar(page).getByRole('button', { name: 'Terminer la séance' }));
        await tap(finishSheet(page).getByRole('button', { name: /^(Oui, terminer|Terminer sans compléter)$/ }));
      }),
    ).toBe(2);
    await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible();
    // Retour à l'accueil : 1.
    expect(await count(() => tap(page.getByRole('button', { name: 'Garder ce nom' })))).toBe(1);
    // Pesée : onglet Progrès puis « Enregistrer la pesée » : 2 et le poids (avant : « Mon poids » puis « Enregistrer »).
    expect(
      await count(async () => {
        await tap(tab(page, 'Progrès'));
        await page.getByRole('region', { name: 'Mon poids' }).getByLabel('Poids (kg)').fill('78,4');
        await tap(page.getByRole('button', { name: 'Enregistrer la pesée' }));
      }),
    ).toBe(2);
    await expect(page.getByTestId('last-weigh-in')).toContainText('78,4 kg');
    // Corriger une séance passée : Historique, la séance, « Corriger » : 3 (avant : 3).
    expect(
      await count(async () => {
        await tap(tab(page, 'Historique'));
        await tap(page.locator('a.session-link').first());
        await tap(page.getByRole('button', { name: 'Corriger' }).first());
      }),
    ).toBe(3);
    // Reprendre une séance : 1 (avant : 1).
    await page.goto('./');
    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    await page.getByRole('link', { name: 'Accueil' }).click();
    expect(await count(() => tap(page.getByRole('button', { name: /^Reprendre la séance/ })))).toBe(1);
  });
});
