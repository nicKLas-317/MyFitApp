import { expect, test, type Locator, type Page } from '@playwright/test';
import depart from '../docs/exemples/depart-exemple.json' with { type: 'json' };
import { addExercise, exerciseCard } from './helpers';

const TRICEPS = 'rgb(140, 200, 255)';
const PECTORAUX = 'rgb(62, 230, 238)';
const STATUS_COLORS = ['rgb(74, 222, 128)', 'rgb(253, 186, 116)', 'rgb(252, 165, 165)'];

async function importDepart(page: Page): Promise<void> {
  await page.goto('./#/donnees');
  await page.getByLabel('Fichier à importer').evaluate((input: HTMLInputElement, content) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([content], 'myfitapp-sauvegarde.json', { type: 'application/json' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, JSON.stringify(depart));
  await page.getByRole('button', { name: 'Ajouter à mes données' }).click();
  await expect(page.getByText('Import terminé : 2 séances ajoutées.')).toBeVisible();
}

/** Mise en forme des deux zones : taille et couleur des textes, séparateur, couleurs de statut hors de la pastille. */
function layout(summary: Locator) {
  return summary.evaluate((root) => {
    const last = root.querySelector<HTMLElement>('.last-zone')!;
    const next = root.querySelector<HTMLElement>('.next-zone')!;
    const target = root.querySelector<HTMLElement>('.next-target')!;
    const statusColored = [...root.querySelectorAll<HTMLElement>('*')]
      .filter((el) => !el.closest('svg.status'))
      .flatMap((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor, getComputedStyle(el).borderTopColor]);
    return {
      lastSize: parseFloat(getComputedStyle(last).fontSize),
      lastColor: getComputedStyle(last).color,
      targetSize: parseFloat(getComputedStyle(target).fontSize),
      targetWeight: getComputedStyle(target).fontWeight,
      targetColor: getComputedStyle(target).color,
      separator: getComputedStyle(next).borderTopWidth,
      lastOverflow: last.scrollWidth - last.clientWidth,
      badgeInLast: !!last.querySelector('svg.status'),
      colors: statusColored,
    };
  });
}

test.describe('Dernière fois / Prochaine cible (§5.3.2)', () => {
  test('163. Deux zones : dernière fois discrète sur une ligne, prochaine cible en grand dans la couleur du groupe, repère ou « = Même cible : consolide »', async ({ page }) => {
    await importDepart(page);

    // Fiche, cible en hausse : repère sous la cible.
    await page.goto('./#/exercice/extension-triceps-haltere-assis');
    const summary = page.getByTestId('target-summary');
    await expect(summary.getByTestId('last-time')).toHaveText(/^Dernière fois\s*14 kg · 8 · 8 · 8 · 12 mars$/);
    await expect(summary.getByTestId('next-target')).toHaveText('3 × 9 à 14 kg');
    await expect(summary.getByTestId('sheet-next')).toHaveText('3 × 9');
    await expect(summary.getByTestId('progress-marker')).toHaveText('↑ +1 répétition : 3×9 (au lieu de 3×8)');
    await expect(summary.getByTestId('same-target')).toHaveCount(0);
    const sheet = await layout(summary);
    expect(sheet.badgeInLast).toBe(true);
    expect(sheet.targetSize).toBeGreaterThanOrEqual(sheet.lastSize * 1.6);
    expect(Number(sheet.targetWeight)).toBeGreaterThanOrEqual(700);
    expect(sheet.targetColor).toBe(TRICEPS);
    expect(sheet.lastColor).toBe('rgb(154, 161, 176)'); // gris clair
    expect(sheet.separator).toBe('1px');
    expect(sheet.lastOverflow).toBeLessThanOrEqual(0);
    for (const c of STATUS_COLORS) expect(sheet.colors, 'aucune couleur de statut hors de la pastille').not.toContain(c);

    // Fiche, cible identique à la dernière fois : mention discrète.
    await page.goto('./#/exercice/chest-press');
    await expect(summary.getByTestId('next-target')).toHaveText('3 × 8 à 47 kg');
    await expect(summary.getByTestId('same-target')).toHaveText('= Même cible : consolide');
    await expect(summary.getByTestId('progress-marker')).toHaveCount(0);
    expect((await layout(summary)).targetColor).toBe(PECTORAUX);

    // Exercice jamais réalisé.
    await page.goto('./#/exercice/squat-kettlebell');
    await expect(summary.getByTestId('last-time')).toHaveText(/^Dernière fois\s*jamais réalisé$/);
    await expect(summary.getByTestId('next-target')).toHaveText('3 × 8');
    await expect(summary.getByTestId('start-hint')).toHaveText('Poids de départ à saisir');

    // Séance : le même bloc en haut de la carte, au-dessus du poids.
    await page.goto('./');
    await page.getByRole('button', { name: 'Démarrer une séance' }).click();
    const card = await addExercise(page, 'extension triceps haltère assis', 'Extension triceps haltère assis');
    const inCard = card.getByTestId('target-summary');
    await expect(inCard.getByTestId('last-time')).toHaveText(/14 kg · 8 · 8 · 8 · 12 mars$/);
    await expect(inCard.getByTestId('next-target')).toHaveText('3 × 9 à 14 kg');
    await expect(inCard.getByTestId('progress-marker')).toBeVisible();
    const [summaryBox, weightBox] = await Promise.all([inCard.boundingBox(), card.getByLabel('Poids (kg)').boundingBox()]);
    expect(summaryBox!.y + summaryBox!.height).toBeLessThanOrEqual(weightBox!.y);
    expect((await layout(inCard)).targetColor).toBe(TRICEPS);
    // Une autre charge saisie : ce n'est plus la progression recommandée, ni repère ni mention.
    await card.getByLabel('Poids (kg)').fill('16');
    await card.getByLabel('Poids (kg)').blur();
    await expect(inCard.getByTestId('progress-marker')).toHaveCount(0);
    await expect(inCard.getByTestId('same-target')).toHaveCount(0);
    const chest = await addExercise(page, 'chest press', 'Chest press');
    await expect(chest.getByTestId('same-target')).toHaveText('= Même cible : consolide');
    await expect(exerciseCard(page, 'Chest press').getByTestId('next-target')).toHaveText('3 × 8 à 47 kg');

    // Petit écran : la ligne « Dernière fois » ne déborde jamais.
    for (const width of [360, 320]) {
      await page.setViewportSize({ width, height: 800 });
      expect((await layout(chest.getByTestId('target-summary'))).lastOverflow, `${width} px`).toBeLessThanOrEqual(0);
    }
  });
});
