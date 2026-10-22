import { expect, test, type Page } from '@playwright/test';

/** Heure locale (Paris), octobre-novembre 2026 : le lundi 19 octobre commence la semaine. */
const at = (date: string, time: string) => new Date(`${date}T${time}:00`);
const banner = (page: Page) => page.locator('.activity-banner');
const recapCell = (page: Page, group: string) => page.locator(`.recap-cell[data-group="${group}"]`);
const recapTitle = (page: Page) => page.getByTestId('weekly-recap').getByRole('heading');

async function openAt(page: Page, date: string, time: string, path = './'): Promise<void> {
  await page.clock.setFixedTime(at(date, time));
  await page.goto(path);
  await page.reload();
}

async function noOverflow(page: Page): Promise<void> {
  for (const width of [412, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 412, height: 915 });
}

test.describe('Activités habituelles hors salle', () => {
  test('202. Badminton : question après 22 h 30 le lundi, « Oui » compté en indirect le mardi, historique, bilan, suppression, « Non », sans réponse jusqu’au dimanche, désactivation, export ; format smartphone', async ({ page }) => {
    // Lundi 22 h : pas encore de question.
    await openAt(page, '2026-10-19', '22:00');
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);

    // Lundi 22 h 31 : la question, tout en haut, sans saisie ; le récapitulatif reste visible sans défilement.
    await openAt(page, '2026-10-19', '22:31');
    await expect(banner(page)).toHaveCount(1);
    await expect(banner(page)).toContainText('Badminton lundi soir (21 h – 22 h 30)');
    await expect(banner(page).getByRole('textbox')).toHaveCount(0);
    const [bannerBox, recapBox] = [(await banner(page).boundingBox())!, (await page.getByTestId('weekly-recap').boundingBox())!];
    expect(bannerBox.y).toBeLessThan(recapBox.y);
    expect(recapBox.y + recapBox.height).toBeLessThanOrEqual(915);
    await noOverflow(page);
    await test.info().attach('accueil-question', { body: await page.screenshot(), contentType: 'image/png' });

    await banner(page).getByRole('button', { name: 'Oui' }).click();
    await expect(banner(page)).toHaveCount(0);
    await expect(recapTitle(page)).toContainText(/0\s+séance · 1\s+activité/);
    await expect(recapCell(page, 'jambes')).toContainText(/\+1\s+indirect/);
    await expect(recapCell(page, 'jambes')).toContainText('aujourd’hui');

    // Mardi : jambes et épaules « +1 indirect · hier », vertes ; pas de question.
    await openAt(page, '2026-10-20', '09:00');
    await expect(banner(page)).toHaveCount(0);
    for (const g of ['jambes', 'epaules']) {
      await expect(recapCell(page, g)).toHaveText(/^(Jambes|Épaules) \(\+1\s+indirect\) · hier$/);
      await expect(recapCell(page, g)).toHaveAttribute('data-color', 'vert');
    }
    await expect(recapCell(page, 'dos')).toHaveText('Dos');
    await test.info().attach('accueil-mardi', { body: await page.screenshot(), contentType: 'image/png' });

    // Historique : « Badminton · 1 h 30 ».
    await page.goto('./#/historique');
    const item = page.getByRole('listitem', { name: 'Badminton · 1 h 30' });
    await expect(item).toContainText('19 octobre 2026 · 21 h – 22 h 30');
    await noOverflow(page);
    await test.info().attach('historique', { body: await page.screenshot(), contentType: 'image/png' });

    // Bilan de la semaine : section Séances et texte du mail.
    await page.goto('./#/bilan-periode/semaine/2026-10-19');
    await expect(page.getByRole('region', { name: 'Séances' })).toContainText('Activités : Badminton ×1, 1 h 30');
    await expect(page.getByRole('region', { name: 'Groupes travaillés' })).toContainText('Jambes : +1 indirect');
    await expect(page.getByTestId('report-text')).toContainText('- Activités : Badminton ×1, 1 h 30');
    await test.info().attach('bilan-semaine', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    // Export : activités et habitudes dans la sauvegarde.
    await page.goto('./#/donnees');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter mes données' }).click();
    await page.getByLabel('Fichier à importer').setInputFiles((await (await downloading).path())!);
    const backup = JSON.parse(await page.getByLabel('Notes de séance ou JSON').inputValue());
    expect(backup).toMatchObject({
      schemaVersion: 4,
      activities: [{ id: 'act-badminton-2026-10-19', date: '2026-10-19', name: 'Badminton', status: 'done' }],
      settings: { habits: [{ id: 'badminton', weekday: 1, start: '21:00', end: '22:30', groups: ['epaules', 'jambes'], enabled: true }] },
    });
    await expect(page.getByText('Rien de nouveau à importer.')).toBeVisible();

    // Suppression depuis l'historique, après confirmation : plus comptée, et la question ne revient pas.
    await page.goto('./#/historique');
    await item.getByRole('button', { name: 'Supprimer' }).click();
    await item.getByRole('button', { name: 'Confirmer la suppression' }).click();
    await expect(item).toHaveCount(0);
    await page.goto('./#/');
    await expect(banner(page)).toHaveCount(0);
    await expect(recapCell(page, 'jambes')).toHaveText('Jambes');

    // Lundi suivant : « Non » n'enregistre rien et la question ne revient plus, même après relance.
    await openAt(page, '2026-10-26', '22:31');
    await banner(page).getByRole('button', { name: 'Non' }).click();
    await expect(banner(page)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await expect(recapTitle(page)).not.toContainText('activité');

    // Sans réponse : proposée jusqu'au dimanche, puis disparaît sans rien enregistrer.
    await openAt(page, '2026-11-04', '12:00');
    await expect(banner(page)).toHaveCount(1);
    await openAt(page, '2026-11-08', '23:30');
    await expect(banner(page)).toHaveCount(1);
    await openAt(page, '2026-11-09', '09:00');
    await expect(banner(page)).toHaveCount(0);
    await expect(recapTitle(page)).not.toContainText('activité');

    // Réglages : désactivée → plus de question ; une nouvelle activité s'ajoute avec son jour, ses heures et ses groupes.
    await page.goto('./#/reglages');
    const habits = page.getByRole('group', { name: 'Activités habituelles' });
    const row = habits.getByRole('listitem', { name: 'Badminton' });
    await expect(row.getByLabel('Jour : Badminton')).toHaveValue('1');
    await expect(row.getByLabel('Début : Badminton')).toHaveValue('21:00');
    await expect(row.getByLabel('Fin : Badminton')).toHaveValue('22:30');
    await row.getByLabel('Activée').uncheck();
    await habits.getByLabel('Nouvelle activité').fill('Tennis');
    await habits.getByRole('button', { name: 'Ajouter l’activité' }).click();
    const tennis = habits.getByRole('listitem', { name: 'Tennis' });
    await tennis.getByLabel('Jour : Tennis').selectOption('3');
    await tennis.getByLabel('Début : Tennis').fill('19:00');
    await tennis.getByLabel('Fin : Tennis').fill('18:00');
    await expect(tennis.getByRole('alert')).toHaveText('L’heure de fin doit suivre l’heure de début (même jour).');
    await expect(habits.getByRole('button', { name: 'Enregistrer les activités' })).toBeDisabled();
    await tennis.getByLabel('Fin : Tennis').fill('20:30');
    await tennis.getByRole('group', { name: 'Groupes sollicités : Tennis' }).getByRole('button', { name: 'Épaules' }).click();
    await habits.getByRole('button', { name: 'Enregistrer les activités' }).click();
    await expect(habits.getByText('Activités enregistrées.')).toBeVisible();
    await noOverflow(page);
    // Capture de la section seule, page entière découpée (l'en-tête fixe ne la recouvre pas).
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = (await habits.boundingBox())!;
    const clip = { ...box, y: box.y + (await page.evaluate(() => window.scrollY)) };
    await test.info().attach('reglages-activites', { body: await page.screenshot({ fullPage: true, clip }), contentType: 'image/png' });
    await page.reload();
    await expect(page.getByRole('group', { name: 'Activités habituelles' }).getByRole('listitem', { name: 'Badminton' }).getByLabel('Activée')).not.toBeChecked();

    await openAt(page, '2026-11-09', '22:31');
    await expect(banner(page)).toHaveCount(0);
    await openAt(page, '2026-11-11', '20:31');
    await expect(banner(page)).toHaveCount(1);
    await expect(banner(page)).toContainText('Tennis mercredi soir (19 h – 20 h 30)');
  });
});
