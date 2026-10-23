import { expect, type Locator, type Page } from '@playwright/test';
import type { Exercise, Session } from '../src/domain/types';

/** Lit les séances directement dans IndexedDB : on vérifie les données enregistrées, pas seulement l'affichage. */
export function readSessions(page: Page): Promise<Session[]> {
  return page.evaluate(
    () =>
      new Promise<Session[]>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('sessions').objectStore('sessions').getAll();
          req.onsuccess = () => {
            resolve(req.result as Session[]);
            db.close();
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

export function writeSessions(page: Page, sessions: Session[]): Promise<void> {
  return page.evaluate(
    (list) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('sessions', 'readwrite');
          for (const s of list) tx.objectStore('sessions').put(s);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    sessions,
  );
}

export async function activeSession(page: Page): Promise<Session> {
  const active = (await readSessions(page)).find((s) => s.state === 'active');
  if (!active) throw new Error('Aucune séance active en base');
  return active;
}

export async function startSession(page: Page): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Démarrer une séance' }).click();
  await expect(page.getByTestId('chrono')).toBeVisible();
}

/** Ajoute un exercice depuis la recherche ; `startWeight` pour un exercice jamais réalisé. */
export async function addExercise(page: Page, query: string, name: string, startWeight?: string): Promise<Locator> {
  await page.getByRole('link', { name: 'Ajouter un exercice' }).click();
  await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill(query);
  // Le bouton de résultat affiche la variante sans tiret : « Tirage vertical Prise moyenne ».
  const escaped = name.replace(' — ', ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.getByRole('button', { name: new RegExp(`^${escaped}`) }).first().click();
  if (startWeight !== undefined) {
    await page.getByLabel('Poids de départ (kg)').fill(startWeight);
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  }
  const card = exerciseCard(page, name);
  await expect(card).toBeVisible();
  return card;
}

export function exerciseCard(page: Page, name: string): Locator {
  return page.locator(`article[aria-label="${name}"]`);
}

/** Valide `count` séries à la valeur préremplie (la cible). */
export async function validateSets(card: Locator, count: number): Promise<void> {
  for (let i = 0; i < count; i++) await card.getByRole('button', { name: 'Valider' }).click();
}

/** Onglet de chaque écran ouvert depuis un onglet (§3.4). */
const TAB_OF: Record<string, string> = {
  Historique: 'Historique',
  'Bilan de progression': 'Progrès',
  'Bilan de la semaine / du mois': 'Progrès',
  'Par groupe musculaire': 'Progrès',
  'Mon poids': 'Progrès',
  'Bibliothèque d’exercices': 'Plus',
  Réglages: 'Plus',
  'Importer / exporter': 'Plus',
};

/** Barre d'onglets. */
export function tabBar(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Onglets' });
}

/** Ouvre un écran depuis la barre d'onglets : l'onglet, puis le lien de l'écran dans l'onglet. */
export async function openScreen(page: Page, name: string): Promise<void> {
  const tab = TAB_OF[name] ?? name;
  await tabBar(page).getByRole('link', { name: new RegExp(`^${tab}`) }).click();
  if (name === tab) return;
  const link = name === 'Mon poids' ? 'Mon poids : pesées et graphique' : name;
  await page.getByRole('main').getByRole('link', { name: link, exact: true }).click();
}

/** Action secondaire d'une carte (exercice ou cardio), dans son menu « ⋯ ». */
export async function cardAction(card: Locator, action: string): Promise<void> {
  await card.getByRole('button', { name: /^Actions : / }).click();
  await card.getByRole('menuitem', { name: action, exact: true }).click();
}

/** Volet de confirmation de fin de séance, fixé en bas de l'écran. */
export function finishSheet(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Terminer la séance ?' });
}

export async function finishSession(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Terminer la séance' }).click();
  await page.getByRole('button', { name: 'Oui, terminer' }).click();
  await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible();
}

/** Séance complète : `sets` séries à la cible et le ressenti indiqué. */
export async function doExercise(card: Locator, sets: number, feeling: string): Promise<void> {
  await validateSets(card, sets);
  await card.getByRole('button', { name: feeling, exact: true }).click();
}

export function readExercises(page: Page): Promise<Exercise[]> {
  return page.evaluate(
    () =>
      new Promise<Exercise[]>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('exercises').objectStore('exercises').getAll();
          req.onsuccess = () => {
            resolve(req.result as Exercise[]);
            db.close();
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

/** Fiche d'un exercice : agrandit l'illustration réduite (vignette) et renvoie l'image agrandie. */
export async function openIllustration(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Agrandir l’illustration' }).click();
  return page.locator('figure.illustration img');
}

/** Réglages : déplie une section repliable (fermées à l'ouverture, sauf la première) et renvoie son contenu. */
export async function openSettingsSection(page: Page, name: string): Promise<Locator> {
  const section = page.locator('details.settings-section').filter({ has: page.locator('summary', { hasText: name }) });
  if ((await section.getAttribute('open')) === null) await section.locator('summary').click();
  return page.getByRole('group', { name, exact: true });
}
