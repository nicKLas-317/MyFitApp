import { expect, test, type Page } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { NOTES_11_3 } from '../src/transfer/__tests__/fixtures';
import { readExercises, readSessions, writeSessions, openScreen } from './helpers';

const preview = (page: Page) => page.getByRole('region', { name: 'Aperçu de l’import' });
const cards = (page: Page) => preview(page).locator('article.draft-exercise');

async function analyzeNotes(page: Page, text: string): Promise<void> {
  await page.getByLabel('Notes de séance ou JSON').fill(text);
  await page.getByRole('button', { name: 'Analyser' }).click();
  await expect(preview(page)).toBeVisible();
}

async function openData(page: Page): Promise<void> {
  await page.goto('./');
  await openScreen(page, 'Importer / exporter');
  await expect(page.getByRole('heading', { name: 'Importer / exporter' })).toBeVisible();
}

test.describe('Import et export', () => {
  test('§16.9 et 33. Les notes du §11.3 sont interprétées puis importées à la date saisie', async ({ page }) => {
    await openData(page);
    await analyzeNotes(page, NOTES_11_3);

    await expect(cards(page)).toHaveCount(6);
    const choices = await cards(page).evaluateAll((list) =>
      list.map((a) => {
        const [exercise, feeling] = Array.from(a.querySelectorAll('select')).map((s) => s.value);
        const values = Array.from(a.querySelectorAll<HTMLInputElement>('.field-grid input')).map((i) => i.value);
        return [exercise, ...values, feeling, a.querySelector('[data-status]')?.getAttribute('data-status')];
      }),
    );
    expect(choices).toEqual([
      ['tirage-horizontal', '48', '8-8-8', '3', '8', 'moyen', 'orange'],
      ['', '9', '8-8-8', '3', '8', 'tres_bien', undefined], // matériel non précisé : à choisir
      ['curl-biceps-poulie-corde', '15', '8-8-8', '3', '8', 'tres_bien', 'vert'],
      ['__new_variant', '10', '8-8-8', '3', '8', 'mal', 'orange'],
      ['tirage-vertical', '36', '9-9-9', '3', '9', 'mal', 'orange'],
      ['extension-triceps-haltere-assis', '14', '8-8-8', '3', '8', 'tres_bien', 'vert'],
    ]);

    // Élévations latérales sans matériel précisé : aucun rattachement par défaut, choix demandé.
    const lateral = preview(page).getByRole('article', { name: 'Epaules latéral raise' });
    await expect(lateral.getByText('Plusieurs exercices possibles : choisis le bon.')).toBeVisible();
    await lateral.getByLabel('Exercice', { exact: true }).selectOption('elevations-laterales-machine');
    await expect(lateral.locator('[data-status]')).toHaveAttribute('data-status', 'vert');

    // §11.11 A : l'angle crée par défaut une variante distincte.
    const incline = preview(page).getByRole('article', { name: 'Biceps curl banc incliné 70°' });
    await expect(incline.getByLabel(/^Nom de la variante/)).toHaveValue('70°');

    // La date doit être confirmée explicitement (§11.2).
    await page.getByRole('button', { name: 'Importer la séance (6 exercices)' }).click();
    await expect(page.getByRole('alert')).toContainText('Confirme la date de la séance.');
    expect(await readSessions(page)).toEqual([]);

    await preview(page).getByLabel('Date de la séance').fill('2026-03-09');
    await expect(preview(page).getByText('✓ Date confirmée')).toBeVisible();
    await expect(preview(page).getByLabel('Nom', { exact: true })).toHaveValue('Séance du 9 mars 2026');
    await page.getByRole('button', { name: 'Importer la séance (6 exercices)' }).click();
    await expect(page.getByText('Séance importée : 6 exercices.')).toBeVisible();

    const [session] = await readSessions(page);
    expect(session).toMatchObject({ date: '2026-03-09', origin: 'import', state: 'done', name: 'Séance du 9 mars 2026' });
    expect(session!.sourceText).toBe(NOTES_11_3);
    expect(session!.performances.map((p) => [p.variantId, p.weightKg, p.plannedSets, p.targetReps, p.reps.join('-'), p.feeling])).toEqual([
      ['tirage-horizontal', 48, 3, 8, '8-8-8', 'moyen'],
      ['elevations-laterales-machine', 9, 3, 8, '8-8-8', 'tres_bien'],
      ['curl-biceps-poulie-corde', 15, 3, 8, '8-8-8', 'tres_bien'],
      ['curl-biceps-banc-incline--70', 10, 3, 8, '8-8-8', 'mal'],
      ['tirage-vertical', 36, 3, 9, '9-9-9', 'mal'],
      ['extension-triceps-haltere-assis', 14, 3, 8, '8-8-8', 'tres_bien'],
    ]);

    // 42. Le même bloc à la même date est un doublon : bloqué sauf confirmation explicite.
    await analyzeNotes(page, NOTES_11_3);
    await preview(page).getByLabel('Date de la séance').fill('2026-03-09');
    await page.getByRole('button', { name: 'Importer la séance (6 exercices)' }).click();
    await expect(page.getByRole('alert')).toContainText('Une séance identique existe déjà à cette date.');
    expect(await readSessions(page)).toHaveLength(1);
    await expect(preview(page).getByText('Importer quand même ce doublon.')).toBeVisible();
  });

  test('§16.11 et 43. Export puis réimport : aucun doublon, restauration identique sur un autre appareil', async ({ page, browser }) => {
    await openData(page);
    await analyzeNotes(page, 'Seated row\n3x8x52kg ++\n\nLeg curl\n3x10x40kg +');
    await preview(page).getByLabel('Date de la séance').fill('2026-10-01');
    await page.getByRole('button', { name: /^Importer la séance/ }).click();
    await expect(page.getByText('Séance importée : 2 exercices.')).toBeVisible();
    const original = await readSessions(page);

    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter mes données' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^myfitapp-sauvegarde-\d{4}-\d{2}-\d{2}\.json$/);
    const file = await download.path();
    await expect(page.getByText(/Dernier export :/)).toBeVisible();

    // Réimport sur le même appareil : rien de nouveau. Le contenu du fichier s'affiche dans la zone de saisie.
    await page.getByLabel('Fichier à importer').setInputFiles(file);
    const backup = JSON.parse(await page.getByLabel('Notes de séance ou JSON').inputValue());
    expect(backup).toMatchObject({ app: 'MyFitApp', schemaVersion: 5, sessions: original });
    await expect(page.getByTestId('plan-new')).toHaveText('0 séance à ajouter');
    await expect(page.getByText('Rien de nouveau à importer.')).toBeVisible();
    expect(await readSessions(page)).toEqual(original);

    // Autre appareil : base vide, restauration complète.
    const other = await browser.newContext({ baseURL: 'http://localhost:4173/MyFitApp/', locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    const page2 = await other.newPage();
    await openData(page2);
    await page2.getByLabel('Fichier à importer').setInputFiles(file);
    await expect(page2.getByTestId('plan-new')).toHaveText('1 séance à ajouter');
    await page2.getByRole('button', { name: 'Ajouter à mes données' }).click();
    await expect(page2.getByText('Import terminé : 1 séance ajoutée.')).toBeVisible();
    expect(await readSessions(page2)).toEqual(original);
    expect(await readExercises(page2)).toEqual(await readExercises(page));
    await other.close();
  });

  test('§16.12, 32 et 40. Un import invalide ou incomplet ne détruit aucune donnée', async ({ page }) => {
    await openData(page);
    await analyzeNotes(page, 'Seated row\n3x8x52kg ++');
    await preview(page).getByLabel('Date de la séance').fill('2026-10-01');
    await page.getByRole('button', { name: /^Importer la séance/ }).click();
    await expect(page.getByText('Séance importée : 1 exercice.')).toBeVisible();
    const before = await readSessions(page);

    await page.getByLabel('Notes de séance ou JSON').fill('{"app": "MyFitApp", "schemaVersion": 2, "sessions": [');
    await page.getByRole('button', { name: 'Analyser' }).click();
    await expect(page.getByRole('alert')).toContainText('n’est pas un JSON valide');
    expect(await readSessions(page)).toEqual(before);

    // Poids absent : l'import reste bloqué tant que la donnée n'est pas complétée ou l'exercice exclu.
    await analyzeNotes(page, 'Leg extension\n3x10 +\n\nLeg curl\n3x10x40kg +');
    await preview(page).getByLabel('Date de la séance').fill('2026-10-02');
    await page.getByRole('button', { name: 'Importer la séance (2 exercices)' }).click();
    await expect(page.getByRole('alert')).toContainText('Leg extension : Poids manquant.');
    expect(await readSessions(page)).toEqual(before);

    const legExt = preview(page).getByRole('article', { name: 'Leg extension' });
    await legExt.getByLabel('Poids (kg)').fill('35');
    await page.getByRole('button', { name: 'Importer la séance (2 exercices)' }).click();
    await expect(page.getByText('Séance importée : 2 exercices.')).toBeVisible();
    const after = await readSessions(page);
    expect(after).toHaveLength(2);
    expect(after.find((s) => s.date === '2026-10-02')?.performances[0]).toMatchObject({ variantId: 'leg-extension', weightKg: 35, reps: [10, 10, 10] });
  });

  test('39. Une correspondance ambiguë se choisit dans l’aperçu et est mémorisée', async ({ page }) => {
    await openData(page);
    await analyzeNotes(page, 'Curl biceps\n3x8x14kg +');
    const card = cards(page).first();
    await expect(card.getByLabel('Exercice', { exact: true })).toHaveValue('');
    await card.getByLabel('Exercice', { exact: true }).selectOption('curl-biceps-halteres');
    await preview(page).getByLabel('Date de la séance').fill('2026-10-01');
    await page.getByRole('button', { name: /^Importer la séance/ }).click();
    await expect(page.getByText('Séance importée : 1 exercice.')).toBeVisible();

    const learned = (await readExercises(page)).find((e) => e.id === 'curl-biceps-halteres');
    expect(learned?.variants[0]?.synonyms).toEqual(['Curl biceps']);
    await analyzeNotes(page, 'Curl biceps\n3x8x14kg +');
    await expect(cards(page).first().getByLabel('Exercice', { exact: true })).toHaveValue('curl-biceps-halteres');
  });

  test('35. Un symbole inconnu doit être tranché avant l’import', async ({ page }) => {
    await openData(page);
    await analyzeNotes(page, 'Seated row\n3x8x52kg +-');
    await preview(page).getByLabel('Date de la séance').fill('2026-10-01');
    await page.getByRole('button', { name: /^Importer la séance/ }).click();
    await expect(page.getByRole('alert')).toContainText('Symbole « +- » non reconnu');
    await cards(page).first().getByLabel(/^Ressenti/).selectOption('bien');
    await page.getByRole('button', { name: /^Importer la séance/ }).click();
    await expect(page.getByText('Séance importée : 1 exercice.')).toBeVisible();
    expect((await readSessions(page))[0]?.performances[0]?.feeling).toBe('bien');
  });

  test('62. Le fichier docs/exemples/seance-exemple-1.json s’importe correctement', async ({ page }) => {
    await openData(page);
    await page.getByLabel('Fichier à importer').setInputFiles('docs/exemples/seance-exemple-1.json');
    await expect(preview(page).getByText('Format simple (version 1)')).toBeVisible();
    await expect(cards(page)).toHaveCount(6);
    await expect(preview(page).getByText('✓ Date confirmée')).toBeVisible();
    await preview(page).getByRole('article', { name: 'Epaules latéral raise' }).getByLabel('Exercice', { exact: true }).selectOption('elevations-laterales-machine');
    await page.getByRole('button', { name: 'Importer la séance (6 exercices)' }).click();
    await expect(page.getByText('Séance importée : 6 exercices.')).toBeVisible();
    const [session] = await readSessions(page);
    expect(session).toMatchObject({ id: 'seance-exemple-1', date: '2026-03-09', origin: 'import' });
    expect(session!.performances.map((p) => [p.weightKg, p.reps.join('-'), p.feeling])).toEqual([
      [48, '8-8-8', 'moyen'],
      [9, '8-8-8', 'tres_bien'],
      [15, '8-8-8', 'tres_bien'],
      [10, '8-8-8', 'mal'],
      [36, '9-9-9', 'mal'],
      [14, '8-8-8', 'tres_bien'],
    ]);
  });

  test('§12. Rappel de sauvegarde discret sur l’accueil, avec export direct', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    await expect(page.getByText('Pense à sauvegarder tes séances.')).toHaveCount(0);

    const old = Date.now() - 20 * 24 * 60 * 60 * 1000;
    const session: Session = {
      id: 'ancienne',
      name: 'Ancienne',
      date: '2026-09-20',
      startedAt: old,
      endedAt: old + 3_600_000,
      createdAt: old,
      updatedAt: old + 3_600_000,
      origin: 'app',
      state: 'done',
      performances: [{ variantId: 'leg-curl', weightKg: 40, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' }],
    };
    await writeSessions(page, [session]);
    await page.reload();
    await expect(page.getByText('Pense à sauvegarder tes séances.')).toBeVisible();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter', exact: true }).click();
    await downloading;
    await expect(page.getByText('Pense à sauvegarder tes séances.')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    await expect(page.getByText('Pense à sauvegarder tes séances.')).toHaveCount(0);
  });
});
