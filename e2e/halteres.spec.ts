import { expect, test, type Page } from '@playwright/test';
import type { Performance, Session, SessionPlan } from '../src/domain/types';
import { addExercise, doExercise, exerciseCard, finishSession, readSessions, startSession, writeSessions } from './helpers';

/** Séance à la salle terminée le jour donné d'octobre 2026, à 18 h. */
function done(id: string, day: number, performances: Performance[]): Session {
  const t = new Date(`2026-10-${day}T18:00:00`).getTime();
  return { id, name: id, date: `2026-10-${day}`, startedAt: t, endedAt: t + 1_800_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done', performances };
}
/** Rien ne dépasse de l'écran, à 412, 360 et 320 px. */
async function noOverflow(page: Page): Promise<void> {
  for (const width of [412, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 412, height: 915 });
}

/** Séance prévue écrite dans la base. */
async function setPlan(page: Page, plan: SessionPlan): Promise<void> {
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
  await page.reload();
}

const perf = (variantId: string, weightKg: number): Performance => ({ variantId, weightKg, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' });

test.describe('Charges aux haltères : « kg / haltère » (versions 1.30.1 et 1.30.2)', () => {
  test('272. Carte en séance, fiche, records et champ de saisie en « kg / haltère » pour un exercice aux haltères ; « kg » ailleurs ; valeurs enregistrées inchangées', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-28T18:00:00'));
    await page.goto('./');
    // Curl biceps haltères 12 kg (par haltère) et pec deck 30 kg, deux vertes à 3 × 8 : 3 × 9 proposé.
    await writeSessions(page, [done('s19', 19, [perf('curl-biceps-halteres', 12), perf('pec-deck', 30)]), done('s20', 20, [perf('curl-biceps-halteres', 12), perf('pec-deck', 30)])]);
    await page.reload();

    // Fiche : cible, dernière fois, record, graphique et historique en « kg / haltère ».
    await page.goto('./#/exercice/curl-biceps-halteres');
    await expect(page.getByTestId('next-target').first()).toHaveText('3 × 9 à 12 kg / haltère');
    await expect(page.getByTestId('last-time').first()).toContainText('12 kg / haltère');
    await expect(page.getByTestId('record')).toHaveText('Record : 3 × 8 à 12 kg / haltère (19 oct.)');
    await expect(page.getByText('Charge (kg / haltère)', { exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Historique de l’exercice' }).locator('li').first()).toContainText('12 kg / haltère · 8-8-8');
    // Exercice à la machine : « kg ».
    await page.goto('./#/exercice/pec-deck');
    await expect(page.getByTestId('next-target').first()).toHaveText('3 × 9 à 30 kg');
    await expect(page.getByTestId('record')).toHaveText('Record : 3 × 8 à 30 kg (19 oct.)');
    await expect(page.getByText('Charge (kg)', { exact: true })).toBeVisible();
    await expect(page.getByRole('main')).not.toContainText('haltère');

    // Séance : carte, champ de saisie et sa confirmation ; pec deck en « kg ».
    await startSession(page);
    const pecDeck = await addExercise(page, 'pec deck', 'Pec deck');
    await expect(pecDeck.getByLabel('Poids (kg)', { exact: true })).toHaveValue('30');
    await expect(pecDeck.locator('.card-summary')).toHaveText('30 kg · 0/3');
    const curl = await addExercise(page, 'curl biceps haltères', 'Curl biceps haltères');
    await expect(curl.locator('.card-summary')).toHaveText('12 kg / haltère · 0/3');
    await expect(curl.getByTestId('next-target')).toHaveText('3 × 9 à 12 kg / haltère');
    await expect(curl.getByTestId('last-time')).toContainText('12 kg / haltère');
    const weight = curl.getByLabel('Poids (kg / haltère)', { exact: true });
    await expect(weight).toHaveValue('12');
    await expect(curl.locator('.weight-field .unit')).toHaveText('kg / haltère');
    await weight.fill('30');
    await weight.press('Tab');
    const confirm = curl.getByRole('alertdialog', { name: 'Confirmer le poids' });
    await expect(confirm).toContainText('30 kg / haltère ? C’est très différent de 12 kg / haltère.');
    await expect(confirm.getByRole('button', { name: 'Confirmer 30 kg / haltère' })).toBeVisible();
    await confirm.getByRole('button', { name: 'Corriger' }).click();
    await expect(weight).toHaveValue('12');
    // Poids de départ d'un exercice aux haltères jamais réalisé : « Poids de départ (kg / haltère) ».
    await page.getByRole('link', { name: 'Ajouter un exercice' }).click();
    await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill('élévations latérales haltères');
    await page.getByRole('button', { name: /^Élévations latérales haltères/ }).first().click();
    await page.getByLabel('Poids de départ (kg / haltère)', { exact: true }).fill('6');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(exerciseCard(page, 'Élévations latérales haltères').getByTestId('next-target')).toHaveText('3 × 8 à 6 kg / haltère');

    // Record battu (3 × 9 à 12 kg) : récapitulatif de fin en « kg / haltère » ; valeurs enregistrées inchangées.
    await curl.locator('.card-header').click();
    await doExercise(curl, 3, 'Bien');
    await expect(curl.getByTestId('new-record')).toBeVisible();
    await finishSession(page);
    await expect(page.getByRole('region', { name: 'Records battus' })).toContainText('Curl biceps haltères : 3 × 9 à 12 kg / haltère');
    // Lignes d'exercices du récapitulatif de fin (version 1.30.2).
    await expect(page.locator('.recap-list [data-variant="curl-biceps-halteres"]')).toContainText('12 kg / haltère · 9 · 9 · 9');
    await expect.poll(async () => (await readSessions(page)).find((s) => s.date === '2026-10-28')?.state).toBe('done');
    const saved = (await readSessions(page)).find((s) => s.date === '2026-10-28')!;
    expect(saved.performances.map((p) => [p.variantId, p.weightKg, p.reps])).toEqual([['curl-biceps-halteres', 12, [9, 9, 9]]]);
  });

  test('274. « kg / haltère » partout pour un exercice aux haltères : détail et correction d’une séance passée, séance prévue, liste de la bibliothèque, bilan de la semaine et texte du mail, dernières évolutions (version 1.30.2)', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-28T18:00:00'));
    await page.goto('./');
    // Curl aux haltères : 12 kg 3 × 8 deux fois (+1 rép. le 19), 3 × 9 le 21 (record), puis 14 kg 3 × 8 le 22 ; pec deck
    // 30 kg 3 × 8 deux fois.
    const curl = (weightKg: number, reps: number[]): Performance => ({ ...perf('curl-biceps-halteres', weightKg), targetReps: reps[0]!, reps });
    await writeSessions(page, [
      done('s12', 12, [perf('curl-biceps-halteres', 12), perf('pec-deck', 30)]),
      done('s19', 19, [perf('curl-biceps-halteres', 12), perf('pec-deck', 30)]),
      done('s21', 21, [curl(12, [9, 9, 9])]),
      done('s22', 22, [curl(14, [8, 8, 8])]),
    ]);
    await setPlan(page, { id: 'plan', createdAt: 0, updatedAt: 0, items: [{ kind: 'exercise', variantId: 'curl-biceps-halteres' }, { kind: 'exercise', variantId: 'pec-deck' }] });

    // Détail d'une séance passée et sa correction.
    await page.goto('./#/historique/s19');
    const curlLine = page.locator('.recap-list [data-variant="curl-biceps-halteres"]');
    await expect(curlLine).toContainText('12 kg / haltère · 8 · 8 · 8');
    await expect(page.locator('.recap-list [data-variant="pec-deck"]')).toContainText('30 kg · 8 · 8 · 8');
    await expect(page.locator('.recap-list [data-variant="pec-deck"]')).not.toContainText('haltère');
    await curlLine.getByRole('button', { name: 'Corriger' }).click();
    await expect(curlLine.getByLabel('Poids (kg / haltère)', { exact: true })).toHaveValue('12');
    await noOverflow(page);

    // Séance prévue.
    await page.goto('./#/seance-prevue');
    await expect(page.locator('.plan-item[data-variant="curl-biceps-halteres"]').getByTestId('next-target')).toHaveText('3 × 8 à 14 kg / haltère');
    await expect(page.locator('.plan-item[data-variant="pec-deck"]').getByTestId('next-target')).toHaveText('3 × 9 à 30 kg');
    await noOverflow(page);

    // Liste de la bibliothèque : « 14 kg » puis « / haltère » dessous ; le nom garde sa place.
    await page.goto('./#/bibliotheque');
    const listed = page.locator('.pick-item[data-variant="curl-biceps-halteres"]').first();
    await expect(listed.locator('.pick-meta')).toHaveText('14 kg / haltère');
    const [kg, perOne] = await listed.locator('.pick-load').evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el.firstChild!);
      return [range.getBoundingClientRect().top, (el.lastElementChild as HTMLElement).getBoundingClientRect().top];
    });
    expect(perOne).toBeGreaterThan(kg);
    await expect(page.locator('.pick-item[data-variant="pec-deck"]').first().locator('.pick-meta')).toHaveText('30 kg');
    await noOverflow(page);

    // Bilan de la semaine du 19 et texte du mail.
    await page.goto('./#/bilan-periode/semaine/2026-10-19');
    await expect(page.getByRole('region', { name: 'Progressions' })).toContainText('Curl biceps haltères : 3×8 → 3×9 à 12\u00a0kg\u00a0/\u00a0haltère (19\u00a0oct.)');
    await expect(page.getByRole('region', { name: 'Progressions' })).toContainText('Pec deck : 3×8 → 3×9 à 30\u00a0kg (19\u00a0oct.)');
    await expect(page.getByRole('region', { name: 'Records' })).toContainText('👑 Curl biceps haltères : 3 × 8 à 14\u00a0kg\u00a0/\u00a0haltère');
    const text = page.getByTestId('report-text');
    await expect(text).toContainText('PROGRESSIONS\n- Curl biceps haltères : 3×8 → 3×9 à 12 kg / haltère (19 oct.)\n- Pec deck : 3×8 → 3×9 à 30 kg (19 oct.)\n');
    await expect(text).toContainText('RECORDS\n- 👑 Curl biceps haltères : 3 × 8 à 14 kg / haltère\n');
    await noOverflow(page);

    // Dernières évolutions du bilan de progression : forme courte ; quand le nom n'aurait plus la place, l'évolution
    // passe dessous et le nom reste entier ; rien n'est coupé.
    await page.goto('./#/bilan');
    const changes = page.getByRole('region', { name: 'Dernières évolutions' }).getByRole('listitem');
    const first = changes.first();
    await expect(first.locator('.change-name')).toHaveText('Curl biceps haltères');
    await expect(first.locator('.change-what')).toHaveText('12 → 14 kg/haltère, 9 → 8 rép.');
    for (const width of [412, 360, 320]) {
      await page.setViewportSize({ width, height: 800 });
      const [row, name, what] = await Promise.all([first.boundingBox(), first.locator('.change-name').boundingBox(), first.locator('.change-what').boundingBox()]);
      expect(what!.x + what!.width, `${width}`).toBeLessThanOrEqual(row!.x + row!.width + 0.5);
      // Sur une ligne, ou l'évolution dessous et le nom entier.
      if (what!.y > name!.y + 1) expect(await first.locator('.change-name').evaluate((el) => el.scrollWidth <= el.clientWidth), `${width}`).toBe(true);
      else expect(row!.height, `${width}`).toBeLessThanOrEqual(name!.height + 1);
    }
    await noOverflow(page);
  });
});
