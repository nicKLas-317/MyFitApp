import { expect, test, type Page } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { activeSession, exerciseCard, readExercises, readSessions, startSession, writeSessions } from './helpers';

/** Noms des résultats affichés, dans l'ordre. */
async function resultNames(page: Page): Promise<string[]> {
  const items = page.getByRole('list', { name: 'Résultats' }).locator('.pick-item strong');
  return items.allTextContents();
}

async function search(page: Page, query: string): Promise<void> {
  await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill(query);
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('link', { name: 'Bibliothèque d’exercices' }).click();
  await expect(page.getByRole('searchbox', { name: 'Rechercher un exercice' })).toBeVisible();
}

function doneSession(id: string, date: string, variantId: string, reps = [8, 8, 8]): Session {
  const t = Date.parse(`${date}T18:00:00`);
  return {
    id, name: id, date, startedAt: t, endedAt: t + 3_600_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: [{ variantId, weightKg: 40, targetReps: 8, plannedSets: 3, reps, feeling: 'bien' }],
  };
}

async function seedHistory(page: Page, sessions: Session[]): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
  await writeSessions(page, sessions);
  // Une navigation qui ne change que le hash ne recharge pas la page : rechargement explicite.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
}

test.describe('Bibliothèque et recherche', () => {
  test('47. Recherche par nom d’exercice ou de machine : chest press, pec deck', async ({ page }) => {
    await openLibrary(page);
    await search(page, 'chest press');
    expect((await resultNames(page))[0]).toBe('Chest press');
    await search(page, 'pec deck');
    expect(await resultNames(page)).toEqual(['Pec deck']);
    await search(page, 'curl biceps');
    expect((await resultNames(page)).slice(0, 3).sort()).toEqual(['Curl biceps banc incliné', 'Curl biceps haltères', 'Curl biceps poulie corde']);
  });

  test('48. Recherche par groupe musculaire : dos', async ({ page }) => {
    await openLibrary(page);
    await search(page, 'dos');
    expect((await resultNames(page)).sort()).toEqual(['Rowing haltère', 'Tirage horizontal', 'Tirage vertical']);
    await search(page, 'biceps');
    const names = await resultNames(page);
    expect(names.slice(0, 3).every((n) => n.startsWith('Curl biceps'))).toBe(true);
    await expect(page.getByRole('list', { name: 'Résultats' }).getByText('Dos · secondaire : Biceps').first()).toBeVisible();
  });

  test('49. Synonymes français et anglais, saisie partielle et sans accents', async ({ page }) => {
    await openLibrary(page);
    const cases: [string, string][] = [
      ['seated row', 'Tirage horizontal'],
      ['lat pull', 'Tirage vertical'],
      ['butterfly', 'Pec deck'],
      ['developpe assis machine', 'Chest press'],
      ['dumbbell row', 'Rowing haltère'],
      ['ELEVATIONS LATERALES', 'Élévations latérales'],
      ['abdos', 'Crunch machine'],
    ];
    for (const [query, expected] of cases) {
      await search(page, query);
      expect((await resultNames(page))[0], query).toBe(expected);
    }
    await search(page, 'xyzzy');
    await expect(page.getByText('Aucun exercice trouvé.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Créer l’exercice « xyzzy »' })).toBeVisible();
  });

  test('Fiche : dernière performance, prochaine cible, statut et historique ; favori mis en avant', async ({ page }) => {
    await seedHistory(page, [doneSession('s1', '2026-10-01', 'tirage-vertical'), doneSession('s2', '2026-10-03', 'tirage-vertical')]);
    await openLibrary(page);
    await search(page, 'lat pulldown');
    await page.getByRole('button', { name: /^Tirage vertical/ }).click();
    await expect(page.getByRole('heading', { name: 'Tirage vertical' })).toBeVisible();
    await expect(page.getByText('Dernière fois :')).toContainText('40 kg');
    await expect(page.getByTestId('sheet-next')).toHaveText('3 × 9');
    await expect(page.getByRole('list', { name: 'Historique de l’exercice' }).getByRole('listitem')).toHaveCount(2);

    await page.getByRole('button', { name: 'Favori' }).click();
    await expect(page.getByRole('button', { name: 'Favori' })).toHaveAttribute('aria-pressed', 'true');
    expect((await readExercises(page)).find((e) => e.id === 'tirage-vertical')?.variants[0]?.favorite).toBe(true);
    await page.getByRole('link', { name: 'Bibliothèque' }).click();
    const favorites = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Favoris' }) });
    await expect(favorites.getByRole('button', { name: /^Tirage vertical/ })).toBeVisible();
  });

  test('55. Renommer un exercice conserve son historique et ses compteurs', async ({ page }) => {
    const sessions = [doneSession('s1', '2026-10-01', 'tirage-vertical'), doneSession('s2', '2026-10-03', 'tirage-vertical')];
    await seedHistory(page, sessions);
    await page.goto('/#/exercice/tirage-vertical');
    await page.getByRole('link', { name: 'Modifier' }).click();
    await page.getByLabel('Nom', { exact: true }).fill('Tirage poitrine Technogym');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByRole('heading', { name: 'Tirage poitrine Technogym' })).toBeVisible();
    await expect(page.getByTestId('sheet-next')).toHaveText('3 × 9');
    await expect(page.getByRole('list', { name: 'Historique de l’exercice' }).getByRole('listitem')).toHaveCount(2);
    const ex = (await readExercises(page)).find((e) => e.id === 'tirage-vertical');
    expect(ex?.name).toBe('Tirage poitrine Technogym');
    expect(await readSessions(page)).toEqual(sessions);
    // L'ancien nom anglais reste un synonyme : la recherche le retrouve.
    await page.goto('/#/bibliotheque');
    await search(page, 'lat pulldown');
    expect((await resultNames(page))[0]).toBe('Tirage poitrine Technogym');
  });

  test('56. Un exercice avec historique s’archive sans se supprimer ; son historique reste consultable', async ({ page }) => {
    await seedHistory(page, [doneSession('s1', '2026-10-01', 'leg-curl')]);
    await page.goto('/#/modifier/leg-curl');
    await expect(page.getByText('Cet exercice a un historique')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Supprimer l’exercice' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Archiver l’exercice' }).click();
    await expect(page.getByText('Exercice archivé')).toBeVisible();

    await page.goto('/#/bibliotheque');
    await search(page, 'leg curl');
    expect(await resultNames(page)).not.toContain('Leg curl');
    await search(page, '');
    await page.getByText('Archivés (1)').click();
    await page.getByRole('link', { name: 'Leg curl' }).click();
    await expect(page.getByRole('list', { name: 'Historique de l’exercice' }).getByRole('listitem')).toHaveCount(1);
    expect(await readSessions(page)).toHaveLength(1);

    await page.getByRole('link', { name: 'Modifier' }).click();
    await page.getByRole('button', { name: 'Désarchiver l’exercice' }).click();
    await expect(page.getByRole('heading', { name: 'Leg curl' })).toBeVisible();
    await expect(page.getByText('Exercice archivé')).toHaveCount(0);
    await page.goto('/#/bibliotheque');
    await search(page, 'leg curl');
    expect(await resultNames(page)).toContain('Leg curl');
  });

  test('Un exercice sans historique se supprime après confirmation', async ({ page }) => {
    await page.goto('/#/modifier/crunch-machine');
    await page.getByRole('button', { name: 'Supprimer l’exercice' }).click();
    await page.getByRole('button', { name: 'Oui, supprimer' }).click();
    await expect(page.getByRole('searchbox', { name: 'Rechercher un exercice' })).toBeVisible();
    expect((await readExercises(page)).some((e) => e.id === 'crunch-machine')).toBe(false);
  });

  test('Création d’un exercice introuvable puis ajout direct à la séance', async ({ page }) => {
    await startSession(page);
    await page.getByRole('link', { name: '+ Ajouter un exercice' }).click();
    await search(page, 'Hip thrust');
    await page.getByRole('link', { name: 'Créer l’exercice « Hip thrust »' }).click();
    await expect(page.getByLabel('Nom', { exact: true })).toHaveValue('Hip thrust');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('alert')).toContainText('Choisissez le groupe musculaire principal.');
    await page.getByLabel('Groupe principal').selectOption('jambes');
    await page.getByLabel('Matériel').selectOption('barre');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await page.getByLabel('Poids de départ (kg)').fill('60');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(exerciseCard(page, 'Hip thrust')).toBeVisible();
    expect((await activeSession(page)).performances[0]).toMatchObject({ variantId: 'perso-hip-thrust', weightKg: 60, targetReps: 8 });
    expect((await readExercises(page)).find((e) => e.id === 'perso-hip-thrust')).toMatchObject({ primaryGroup: 'jambes', equipment: 'barre' });
  });

  test('Ajout à la séance depuis la bibliothèque, variante créée avec son propre historique', async ({ page }) => {
    await startSession(page);
    await page.goto('/#/exercice/curl-biceps-banc-incline');
    await page.getByRole('button', { name: '+ Nouvelle variante (machine, prise, inclinaison…)' }).click();
    await page.getByLabel('Nom de la variante').fill('45°');
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText('Variante : 45°')).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter à la séance' }).click();
    await page.getByLabel('Poids de départ (kg)').fill('10');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(exerciseCard(page, 'Curl biceps banc incliné — 45°')).toBeVisible();
    expect((await activeSession(page)).performances[0]?.variantId).toBe('curl-biceps-banc-incline--45');

    // Depuis la bibliothèque, le bouton « + » ajoute un exercice déjà connu sans quitter la recherche.
    await page.goto('/#/bibliotheque');
    await search(page, 'pec deck');
    await page.getByRole('button', { name: 'Ajouter Pec deck à la séance' }).click();
    await page.getByLabel('Poids de départ (kg)').fill('35');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(exerciseCard(page, 'Pec deck')).toBeVisible();
  });

  test('Réglages par exercice : plage de répétitions personnalisée', async ({ page }) => {
    await page.goto('/#/modifier/leg-curl');
    const standard = page.getByRole('group', { name: 'Variante standard' });
    await standard.getByLabel('Rép. max').fill('6');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('alert')).toContainText('plage de répétitions invalide');
    await standard.getByLabel('Rép. min').fill('6');
    await standard.getByLabel('Rép. max').fill('10');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByTestId('sheet-next')).toHaveText('3 × 6');
    expect((await readExercises(page)).find((e) => e.id === 'leg-curl')?.variants[0]?.config).toEqual({ minReps: 6, maxReps: 10 });
  });
});
