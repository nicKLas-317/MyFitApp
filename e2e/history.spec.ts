import { expect, test, type Page } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { activeSession, readSessions, writeSessions, openScreen } from './helpers';

function done(id: string, name: string, date: string, reps: number[], feeling: 'bien' | 'moyen' = 'bien', variantId = 'tirage-vertical'): Session {
  const t = Date.parse(`${date}T18:00:00`);
  return {
    id, name, date, startedAt: t, endedAt: t + 3_600_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: [{ variantId, weightKg: 40, targetReps: 8, plannedSets: 3, reps, feeling }],
  };
}

async function seed(page: Page, sessions: Session[]): Promise<void> {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
  await writeSessions(page, sessions);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
}

function readBody(page: Page): Promise<{ weighIns: { date: string; weightKg: number }[]; height: unknown }> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('myfitapp-corps');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['weighIns', 'meta']);
          const w = tx.objectStore('weighIns').getAll();
          const h = tx.objectStore('meta').get('heightCm');
          tx.oncomplete = () => {
            resolve({ weighIns: w.result, height: h.result });
            db.close();
          };
        };
      }),
  );
}

const SESSIONS = [done('s1', 'Haut du corps', '2026-10-01', [8, 8, 8]), done('s2', 'Dos et biceps', '2026-10-03', [8, 8, 8])];

test.describe('Historique, analyse et Mon poids', () => {
  test('§10. Historique chronologique et recherche par nom', async ({ page }) => {
    await seed(page, SESSIONS);
    await openScreen(page, 'Historique');
    const list = page.getByRole('list', { name: 'Séances : Octobre 2026' });
    await expect(list.locator('.history-title')).toHaveText(['Dos et biceps', 'Haut du corps']);
    await page.getByRole('searchbox', { name: 'Rechercher une séance' }).fill('haut');
    await expect(list.locator('.history-title')).toHaveText(['Haut du corps']);
  });

  test('§16.8 et 27. Corriger une séance passée recalcule couleurs et recommandations', async ({ page }) => {
    await seed(page, SESSIONS);
    await page.goto('./#/exercice/tirage-vertical');
    await expect(page.getByTestId('sheet-next')).toHaveText('3 × 9');

    await page.goto('./#/historique/s2');
    const item = page.locator('li[data-variant="tirage-vertical"]');
    await expect(item.locator('[data-status]')).toHaveAttribute('data-status', 'vert');
    await item.getByRole('button', { name: 'Corriger' }).click();
    await item.getByLabel('Répétitions').fill('8-8-9');
    await item.getByRole('button', { name: 'Enregistrer la correction' }).click();
    await expect(item.getByRole('alert')).toContainText('Une série dépasse la cible.');
    await item.getByLabel('Répétitions').fill('8-8-7');
    await item.getByRole('button', { name: 'Enregistrer la correction' }).click();
    await expect(item.locator('[data-status]')).toHaveAttribute('data-status', 'orange');
    expect((await readSessions(page)).find((s) => s.id === 's2')?.performances[0]?.reps).toEqual([8, 8, 7]);

    await page.goto('./#/exercice/tirage-vertical');
    await expect(page.getByTestId('sheet-next')).toHaveText('3 × 8');
  });

  test('60. Supprimer une séance passée demande confirmation et recalcule le profil', async ({ page }) => {
    await seed(page, SESSIONS);
    await page.goto('./#/historique/s2');
    await page.getByRole('button', { name: 'Supprimer la séance' }).click();
    await page.getByRole('button', { name: 'Annuler' }).click();
    expect(await readSessions(page)).toHaveLength(2);
    await page.getByRole('button', { name: 'Supprimer la séance' }).click();
    await page.getByRole('button', { name: 'Oui, supprimer' }).click();
    await expect(page.getByRole('searchbox', { name: 'Rechercher une séance' })).toBeVisible();
    expect((await readSessions(page)).map((s) => s.id)).toEqual(['s1']);
    await page.goto('./#/exercice/tirage-vertical');
    await expect(page.getByTestId('sheet-next')).toHaveText('3 × 8');
  });

  test('28. Nouvelle séance à partir d’une ancienne : exercices préremplis depuis le profil, originale intacte', async ({ page }) => {
    await seed(page, SESSIONS);
    await page.goto('./#/historique/s1');
    await page.getByRole('button', { name: 'Nouvelle séance à partir de celle-ci' }).click();
    await expect(page.getByTestId('chrono')).toBeVisible();
    const active = await activeSession(page);
    expect(active.performances).toEqual([{ variantId: 'tirage-vertical', weightKg: 40, targetReps: 9, plannedSets: 3, reps: [], feeling: 'inconnu' }]);
    expect((await readSessions(page)).find((s) => s.id === 's1')).toEqual(SESSIONS[0]);
  });

  test('§19.3. Le bilan classe les exercices sans conclure sur une seule séance', async ({ page }) => {
    await seed(page, [...SESSIONS, done('s3', 'Bras', '2026-10-04', [8, 7, 7], 'moyen', 'curl-biceps-halteres')]);
    await page.goto('./#/bilan');
    await expect(page.getByRole('region', { name: 'En progression' })).toContainText('Tirage vertical');
    await expect(page.getByRole('region', { name: 'Trop tôt', exact: true })).toContainText('Curl biceps haltères');
    await expect(page.getByRole('region', { name: 'En difficulté' })).toHaveCount(0);
  });

  test('§20 et 52. Mon poids : saisie en une action, pesée invalide refusée, correction, suppression, taille', async ({ page }) => {
    await seed(page, SESSIONS);
    await openScreen(page, 'Mon poids');
    await expect(page.getByText('Aucune pesée. Elle n’est jamais obligatoire.')).toBeVisible();

    await page.getByLabel('Poids (kg)').fill('7a8');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Poids invalide');
    expect((await readBody(page)).weighIns).toEqual([]);
    expect(await readSessions(page)).toEqual(SESSIONS);

    await page.getByLabel('Date').fill('2026-09-01');
    await page.getByLabel('Poids (kg)').fill('80,4');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.getByLabel('Date').fill('2026-10-01');
    await page.getByLabel('Poids (kg)').fill('79,2');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Historique des pesées' }).getByRole('listitem')).toHaveCount(2);
    await expect(page.getByTestId('body-chart')).toHaveAttribute('data-points', '2');
    expect((await readBody(page)).weighIns).toEqual([
      { date: '2026-09-01', weightKg: 80.4 },
      { date: '2026-10-01', weightKg: 79.2 },
    ]);

    const first = page.getByRole('list', { name: 'Historique des pesées' }).getByRole('listitem').first();
    await first.getByRole('button', { name: 'Corriger' }).click();
    await first.getByLabel('Poids (kg)').fill('79');
    await first.getByRole('button', { name: 'Enregistrer la correction' }).click();
    await expect.poll(async () => (await readBody(page)).weighIns.find((w) => w.date === '2026-10-01')?.weightKg).toBe(79);
    await first.getByRole('button', { name: 'Corriger' }).click();
    await first.getByRole('button', { name: 'Supprimer' }).click();
    await first.getByRole('button', { name: 'Oui, supprimer' }).click();
    await expect.poll(async () => (await readBody(page)).weighIns.length).toBe(1);

    await page.goto('./#/reglages');
    await page.getByLabel('Taille (cm)').fill('178');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByText('Taille enregistrée.')).toBeVisible();
    expect((await readBody(page)).height).toBe(178);
    expect(await readSessions(page)).toEqual(SESSIONS);
  });

  test('53. Suivi corporel indisponible : les séances fonctionnent normalement, l’export reste possible', async ({ page }) => {
    // Base corporelle dans une version inconnue de l'application : son ouverture échoue.
    await page.addInitScript(() => {
      indexedDB.open('myfitapp-corps', 99).onsuccess = (e) => (e.target as IDBOpenDBRequest).result.close();
    });
    await page.goto('./');
    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    await page.getByRole('link', { name: 'Ajouter un exercice' }).click();
    await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill('pec deck');
    await page.getByRole('button', { name: /^Pec deck/ }).first().click();
    await page.getByLabel('Poids de départ (kg)').fill('30');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await page.locator('article[aria-label="Pec deck"]').getByRole('button', { name: 'Valider', exact: true }).click();
    await expect.poll(async () => (await activeSession(page)).performances[0]?.reps).toEqual([8]);

    await page.goto('./#/poids');
    await expect(page.getByRole('alert')).toContainText('Tes séances ne sont pas concernées');
    await page.goto('./#/donnees');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter mes données' }).click();
    await downloading;
    await expect(page.getByText('Sauvegarde téléchargée.')).toBeVisible();
  });

  test('43. L’export contient taille et pesées ; l’import les restaure sur un autre appareil', async ({ page, browser }) => {
    await seed(page, SESSIONS);
    await page.goto('./#/reglages');
    await page.getByLabel('Taille (cm)').fill('178');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByText('Taille enregistrée.')).toBeVisible();
    await page.goto('./#/poids');
    await page.getByLabel('Date').fill('2026-10-01');
    await page.getByLabel('Poids (kg)').fill('79,2');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Historique des pesées' }).getByRole('listitem')).toHaveCount(1);

    await page.goto('./#/donnees');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter mes données' }).click();
    const file = await (await downloading).path();
    await page.getByLabel('Fichier à importer').setInputFiles(file);
    const backup = JSON.parse(await page.getByLabel('Notes de séance ou JSON').inputValue());
    expect(backup.bodyTracking).toEqual({ heightCm: 178, weighIns: [{ date: '2026-10-01', weightKg: 79.2 }] });

    const other = await browser.newContext({ baseURL: 'http://localhost:4173/MyFitApp/', locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    const page2 = await other.newPage();
    await page2.goto('./#/donnees');
    await page2.getByLabel('Fichier à importer').setInputFiles(file);
    await expect(page2.getByTestId('plan-weighins')).toHaveText('1 pesée à ajouter');
    await page2.getByRole('button', { name: 'Ajouter à mes données' }).click();
    await expect(page2.getByText('Import terminé : 2 séances ajoutées, 1 pesée ajoutée.')).toBeVisible();
    expect(await readBody(page2)).toEqual({ weighIns: [{ date: '2026-10-01', weightKg: 79.2 }], height: 178 });
    expect(await readSessions(page2)).toEqual(SESSIONS);
    await other.close();
  });
});
