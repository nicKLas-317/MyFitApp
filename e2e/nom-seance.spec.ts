import { expect, test, type Page } from '@playwright/test';
import type { Performance, Session } from '../src/domain/types';
import { addExercise, doExercise, exerciseCard, finishSession, openScreen, readSessions, startSession, writeSessions } from './helpers';

/** Rien ne dépasse de l'écran, à 412, 360 et 320 px. */
async function noOverflow(page: Page): Promise<void> {
  for (const width of [412, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 412, height: 915 });
}

const DEFAULT_NAME = /^Séance du \d{1,2} \S+ \d{4} — \d{1,2} h \d{2}$/;
const perf = (variantId: string, sets: number, weightKg = 20): Performance => ({
  variantId, weightKg, targetReps: 10, plannedSets: sets, reps: Array<number>(sets).fill(10), feeling: 'bien',
});
function past(id: string, day: number, performances: Performance[], extra: Partial<Session> = {}): Session {
  const t = new Date(2026, 9, day, 17, 5).getTime();
  return {
    id, name: `Séance du ${day} octobre 2026 — 17 h 05`, date: `2026-10-${day}`, startedAt: t, endedAt: t + 3_600_000, createdAt: t, updatedAt: t,
    origin: 'app', state: 'done', performances, ...extra,
  };
}

test.describe('Nom de séance calculé (version 1.32.0)', () => {
  test('279. Historique, détail, en-tête et récapitulatif : « Salle · Jambes · Pectoraux · Triceps », « Maison · Pectoraux · Abdos », « Salle · Cardio » ; nom donné à la main gardé ; suit le lieu et le complément ; date toujours visible ; rien de réécrit en base', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-30T09:00:00'));
    await page.goto('./');
    const sessions = [
      past('salle', 19, [perf('pec-deck', 2), perf('chest-press', 2), perf('extension-triceps-poulie', 2), perf('presse-a-cuisses', 3), perf('leg-extension', 3)]),
      past('maison', 21, [perf('pompes', 2, 0), perf('developpe-incline--halteres', 3, 10), perf('crunch-sol', 3, 0)], { location: 'maison' }),
      past('cardio', 23, [], { cardio: [{ id: 'tapis', machineId: 'tapis', machine: 'Tapis de marche', minutes: 20, incline: 'neutre' }] }),
      past('perso', 26, [perf('tirage-vertical', 3)], { name: 'Haut du corps' }),
    ];
    await writeSessions(page, sessions);
    await page.reload();

    // Historique : le nom calculé, le jour toujours à gauche ; le nom donné à la main est gardé.
    await openScreen(page, 'Historique');
    const titles = page.locator('.history-title');
    await expect(titles).toHaveText(['Haut du corps', 'Salle · Cardio', 'Maison · Pectoraux · Abdos', 'Salle · Jambes · Pectoraux · Triceps']);
    await expect(page.locator('a.session-link').last().locator('.history-day')).toHaveText('lun.19');
    for (const title of await titles.all()) {
      const { height, line } = await title.evaluate((el) => ({ height: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight) }));
      expect(height).toBeLessThan(line * 1.5);
    }
    await noOverflow(page);
    // Recherche : par le nom affiché, et toujours par la date d'une séance non renommée.
    const search = page.getByRole('searchbox', { name: 'Rechercher une séance' });
    await search.fill('abdos');
    await expect(titles).toHaveText(['Maison · Pectoraux · Abdos']);
    await search.fill('19 octobre');
    await expect(titles).toHaveText(['Salle · Jambes · Pectoraux · Triceps']);
    await search.fill('');

    // Détail : le nom en titre, la date dans l'en-tête ; il suit le lieu, sans réécrire le nom en base.
    await page.goto('./#/historique/salle');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText('Salle · Jambes · Pectoraux · Triceps');
    await expect(page.getByRole('main')).toContainText('19 octobre 2026 · 17 h 05 – 18 h 05');
    await expect(page.getByLabel('Nom de la séance')).toHaveValue('Salle · Jambes · Pectoraux · Triceps');
    await noOverflow(page);
    await page.getByRole('group', { name: 'Lieu de la séance' }).getByRole('button', { name: 'Maison' }).click();
    await expect(heading).toHaveText('Maison · Jambes · Pectoraux · Triceps');
    await expect(page.getByLabel('Nom de la séance')).toHaveValue('Maison · Jambes · Pectoraux · Triceps');
    await expect.poll(async () => (await readSessions(page)).find((s) => s.id === 'salle')?.location).toBe('maison');
    expect((await readSessions(page)).find((s) => s.id === 'salle')?.name).toBe('Séance du 19 octobre 2026 — 17 h 05');
    await page.getByRole('group', { name: 'Lieu de la séance' }).getByRole('button', { name: 'Salle' }).click();
    await expect(heading).toHaveText('Salle · Jambes · Pectoraux · Triceps');

    // Renommée à la main : gardée, même quand le lieu change ; un nom vide rend le nom calculé.
    await page.getByLabel('Nom de la séance').fill('Jambes lourdes');
    await page.getByRole('button', { name: 'Renommer' }).click();
    await expect(heading).toHaveText('Jambes lourdes');
    await page.getByRole('group', { name: 'Lieu de la séance' }).getByRole('button', { name: 'Maison' }).click();
    await expect(heading).toHaveText('Jambes lourdes');
    await expect.poll(async () => (await readSessions(page)).find((s) => s.id === 'salle')?.name).toBe('Jambes lourdes');
    await page.getByLabel('Nom de la séance').fill('');
    await page.getByRole('button', { name: 'Renommer' }).click();
    await expect(heading).toHaveText('Maison · Jambes · Pectoraux · Triceps');
    await expect.poll(async () => (await readSessions(page)).find((s) => s.id === 'salle')?.name).toBe('Séance du 19 octobre 2026 — 17 h 05');

    // Séance en cours : l'en-tête montre le lieu, puis les groupes au fil des séries.
    await startSession(page);
    const header = page.locator('.session-title > span').first();
    await expect(header).toHaveText('Salle');
    await doExercise(await addExercise(page, 'pec deck', 'Pec deck', '30'), 3, 'Bien');
    await expect(header).toHaveText('Salle · Pectoraux');
    // Récapitulatif : le nom calculé proposé, gardé en un appui ; le nom par défaut reste en base.
    await finishSession(page);
    await expect(page.getByLabel('Nom de la séance')).toHaveValue('Salle · Pectoraux');
    await page.getByRole('button', { name: 'Garder ce nom' }).click();
    await expect(page.getByRole('button', { name: 'Démarrer une séance', exact: true })).toBeVisible();
    const today = (await readSessions(page)).find((s) => s.date === '2026-10-30')!;
    expect(today.name).toMatch(DEFAULT_NAME);

    // Complétée le jour même : le nom suit (« Biceps » ajouté, à égalité de séries, après les pectoraux).
    await page.goto(`./#/historique/${today.id}`);
    await page.getByRole('button', { name: 'Compléter cette séance' }).click();
    await expect(exerciseCard(page, 'Pec deck').getByTestId('locked')).toBeVisible();
    await doExercise(await addExercise(page, 'curl barre', 'Curl biceps barre droite', '20'), 3, 'Bien');
    await expect(header).toHaveText('Salle · Pectoraux · Biceps');
    await finishSession(page);
    await expect(page.getByLabel('Nom de la séance')).toHaveValue('Salle · Pectoraux · Biceps');
    await page.getByRole('button', { name: 'Garder ce nom' }).click();
    await openScreen(page, 'Historique');
    await expect(titles.first()).toHaveText('Salle · Pectoraux · Biceps');
    expect((await readSessions(page)).find((s) => s.id === today.id)?.name).toBe(today.name);
  });
});
