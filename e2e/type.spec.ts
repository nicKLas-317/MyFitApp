import { expect, test, type Page } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { addExercise, readExercises, startSession, writeSessions } from './helpers';

/** Rien ne dépasse de l'écran, à 412, 360 et 320 px. */
async function noOverflow(page: Page): Promise<void> {
  for (const width of [412, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 412, height: 915 });
}

/** Crée un exercice depuis « + Nouvel exercice » : nom, groupe, type et plage (laissée par défaut si absente). */
async function create(page: Page, name: string, group: string, type: string, range?: [string, string]) {
  await page.goto('./#/nouvel-exercice');
  await page.getByLabel('Nom', { exact: true }).fill(name);
  await page.getByLabel('Groupe principal').selectOption({ label: group });
  await page.getByRole('group', { name: 'Type' }).getByRole('button', { name: type }).click();
  if (range) {
    const [min, max] = type === 'Durée (secondes)' ? ['Durée min (s)', 'Durée max (s)'] : ['Rép. min', 'Rép. max'];
    await page.getByLabel(min, { exact: true }).fill(range[0]);
    await page.getByLabel(max, { exact: true }).fill(range[1]);
  }
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

test.describe('Type d’un exercice et la chaise (version 1.31.0)', () => {
  test('277. « + Nouvel exercice » : type charge, poids du corps ou durée avec sa plage ; « Modifier » tant qu’il n’y a pas d’historique, type figé ensuite ; la chaise en séance à 3 × 45 s', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-30T18:00:00'));
    await page.goto('./');

    // Formulaire : trois types, « Charge (kg) » par défaut, 8 à 12 ; « Durée (secondes) » : 20 à 60 s, matériel
    // « poids du corps » ; « Poids du corps (répétitions) » : 10 à 40.
    await page.goto('./#/nouvel-exercice');
    const type = page.getByRole('group', { name: 'Type' });
    await expect(type.getByRole('button')).toHaveText(['Charge (kg)', 'Poids du corps (répétitions)', 'Durée (secondes)']);
    await expect(type.getByRole('button', { name: 'Charge (kg)' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Rép. min', { exact: true })).toHaveValue('8');
    await expect(page.getByLabel('Rép. max', { exact: true })).toHaveValue('12');
    await expect(page.getByLabel('Matériel')).toHaveValue('machine');
    await type.getByRole('button', { name: 'Durée (secondes)' }).click();
    await expect(page.getByLabel('Durée min (s)', { exact: true })).toHaveValue('20');
    await expect(page.getByLabel('Durée max (s)', { exact: true })).toHaveValue('60');
    await expect(page.getByLabel('Matériel')).toHaveValue('poids du corps');
    await type.getByRole('button', { name: 'Poids du corps (répétitions)' }).click();
    await expect(page.getByLabel('Rép. min', { exact: true })).toHaveValue('10');
    await expect(page.getByLabel('Rép. max', { exact: true })).toHaveValue('40');
    await noOverflow(page);
    // Plage invalide : signalée, rien n'est créé.
    await page.getByLabel('Nom', { exact: true }).fill('Burpees');
    await page.getByLabel('Groupe principal').selectOption({ label: 'Jambes' });
    await page.getByLabel('Rép. max', { exact: true }).fill('5');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('alert')).toContainText('Répétitions : plage de répétitions invalide');
    expect((await readExercises(page)).some((e) => e.name === 'Burpees')).toBe(false);

    // Les trois types créés : fiche et réglage enregistré.
    await create(page, 'Gainage latéral', 'Abdominaux', 'Durée (secondes)', ['20', '90']);
    await expect(page.getByTestId('sheet-next')).toHaveText('3 × 20 s');
    await expect(page.getByText('Gainage : progression par la durée (20 à 90 s)')).toBeVisible();
    await create(page, 'Burpees', 'Jambes', 'Poids du corps (répétitions)');
    await expect(page.getByTestId('sheet-next')).toHaveText('3 × 10');
    await expect(page.getByText('Poids du corps : progression par les répétitions (10 à 40)')).toBeVisible();
    await create(page, 'Fentes bulgares', 'Jambes', 'Charge (kg)');
    await expect(page.getByTestId('sheet-next')).toHaveText('3 × 8');
    const saved = await readExercises(page);
    const config = (name: string) => saved.find((e) => e.name === name)?.variants[0]?.config;
    expect(config('Gainage latéral')).toEqual({ bodyweight: true, seconds: true, maxReps: 90 });
    expect(saved.find((e) => e.name === 'Gainage latéral')?.equipment).toBe('poids du corps');
    expect(config('Burpees')).toEqual({ bodyweight: true });
    expect(config('Fentes bulgares')).toBeUndefined();

    // « Modifier » sans historique : le type se change (burpees → durée, plage par défaut 20 à 60 s).
    const burpees = saved.find((e) => e.name === 'Burpees')!.id;
    await page.goto(`./#/modifier/${burpees}`);
    const standard = page.getByRole('group', { name: 'Variante standard' });
    await expect(standard.getByRole('group', { name: 'Type' }).getByRole('button', { name: 'Poids du corps (répétitions)' })).toHaveAttribute('aria-pressed', 'true');
    await standard.getByRole('button', { name: 'Durée (secondes)' }).click();
    await expect(standard.getByLabel('Durée max (s)', { exact: true })).toHaveValue('60');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByTestId('sheet-next')).toHaveText('3 × 20 s');
    expect((await readExercises(page)).find((e) => e.id === burpees)?.variants[0]?.config).toEqual({ bodyweight: true, seconds: true });

    // La chaise : « wall sit » en séance, 3 × 45 s, sans poids ni poids de départ.
    await page.goto('./');
    await startSession(page);
    const card = await addExercise(page, 'wall sit', 'La chaise');
    await expect(card.getByTestId('next-target')).toHaveText('3 × 45 s');
    await expect(card.getByTestId('start-hint')).toHaveText('Première fois');
    await expect(card.getByLabel(/^Poids/)).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Valider les 3 séries' })).toBeVisible();

    // Type figé dès qu'il y a un historique : la chaise est dans la séance en cours.
    await page.goto('./#/modifier/chaise');
    const chair = page.getByRole('group', { name: 'Variante standard' });
    await expect(chair.getByText('Type : Durée (secondes) (déjà réalisé : non modifiable)')).toBeVisible();
    await expect(chair.getByRole('button', { name: 'Charge (kg)' })).toHaveCount(0);
    await expect(chair.getByLabel('Durée max (s)', { exact: true })).toHaveValue('90');
    // Une séance passée fige de même (exercice à charge).
    const t = new Date('2026-10-29T18:00:00').getTime();
    const past: Session = {
      id: 'f29', name: 'f29', date: '2026-10-29', startedAt: t, endedAt: t + 1_800_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
      performances: [{ variantId: saved.find((e) => e.name === 'Fentes bulgares')!.id, weightKg: 10, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' }],
    };
    await writeSessions(page, [past]);
    await page.reload();
    await page.goto(`./#/modifier/${past.performances[0]!.variantId}`);
    await expect(page.getByRole('group', { name: 'Variante standard' }).getByText('Type : Charge (kg) (déjà réalisé : non modifiable)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Durée (secondes)' })).toHaveCount(0);
    await noOverflow(page);
  });
});
