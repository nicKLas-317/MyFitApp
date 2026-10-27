import { expect, test, type Page } from '@playwright/test';
import { openSettingsSection } from './helpers';

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
    // Une ligne compacte (nom, durée), sans « Supprimer » ; le détail donne la date et les heures.
    const item = page.getByRole('link', { name: /Badminton · 1 h 30/ });
    await expect(item).toHaveAccessibleName(/^19 octobre 2026 : Badminton · 1 h 30 activité/);
    await expect(page.getByRole('main').getByRole('button', { name: /Supprimer/ })).toHaveCount(0);
    await noOverflow(page);
    await test.info().attach('historique', { body: await page.screenshot(), contentType: 'image/png' });
    await item.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Badminton · 1 h 30');
    await expect(page.getByRole('main')).toContainText('19 octobre 2026 · 21 h – 22 h 30');

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
      schemaVersion: 5,
      activities: [{ id: 'act-badminton-2026-10-19', date: '2026-10-19', name: 'Badminton', status: 'done' }],
      settings: { habits: [{ id: 'badminton', weekday: 1, start: '21:00', end: '22:30', groups: ['epaules', 'jambes'], enabled: true }] },
    });
    await expect(page.getByText('Rien de nouveau à importer.')).toBeVisible();

    // Suppression depuis le détail, après confirmation : plus comptée, et la question ne revient pas.
    await page.goto('./#/historique');
    await item.click();
    await page.getByRole('button', { name: 'Supprimer l’activité' }).click();
    await page.getByRole('button', { name: 'Confirmer la suppression' }).click();
    await expect(page.getByRole('searchbox', { name: 'Rechercher une séance' })).toBeVisible();
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
    const habits = await openSettingsSection(page, 'Activités habituelles');
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
    await expect((await openSettingsSection(page, 'Activités habituelles')).getByRole('listitem', { name: 'Badminton' }).getByLabel('Activée')).not.toBeChecked();

    await openAt(page, '2026-11-09', '22:31');
    await expect(banner(page)).toHaveCount(0);
    await openAt(page, '2026-11-11', '20:31');
    await expect(banner(page)).toHaveCount(1);
    await expect(banner(page)).toContainText('Tennis mercredi soir (19 h – 20 h 30)');
  });

  test('240. Activité ponctuelle : « + Activité » discret sur l’onglet Séance, activité connue (hors habitude active en tête et présélectionnée, habitude désactivée comprise) ou nouveau nom, date, durée et groupes préremplis ; comptée comme une activité confirmée ; habitudes inchangées ; format smartphone', async ({ page }) => {
    // Seul le badminton (habitude active) est connu : proposé, mais jamais présélectionné.
    await openAt(page, '2026-10-23', '12:00');
    await page.getByRole('button', { name: '+ Activité' }).click();
    const only = page.getByRole('form', { name: 'Activité ponctuelle' });
    await expect(only.getByRole('group', { name: 'Activité' }).getByRole('button')).toHaveText(['Badminton', 'Autre']);
    await expect(only.getByRole('group', { name: 'Activité' }).getByRole('button', { pressed: true })).toHaveCount(0);
    await only.getByRole('button', { name: 'Enregistrer l’activité' }).click();
    await expect(only.getByRole('alert')).toHaveText('Choisis une activité.');

    // Futsal : habitude désactivée (jambes), donc jamais de question.
    await page.goto('./#/reglages');
    const habits = await openSettingsSection(page, 'Activités habituelles');
    await habits.getByLabel('Nouvelle activité').fill('Futsal');
    await habits.getByRole('button', { name: 'Ajouter l’activité' }).click();
    const futsalRow = habits.getByRole('listitem', { name: 'Futsal' });
    await futsalRow.getByLabel('Jour : Futsal').selectOption('5');
    await futsalRow.getByRole('group', { name: 'Groupes sollicités : Futsal' }).getByRole('button', { name: 'Jambes' }).click();
    await futsalRow.getByLabel('Activée').uncheck();
    await habits.getByRole('button', { name: 'Enregistrer les activités' }).click();
    await expect(habits.getByText('Activités enregistrées.')).toBeVisible();

    // Vendredi 22 h : la question du badminton de lundi reste posée (habitudes inchangées), aucune pour le futsal.
    await openAt(page, '2026-10-23', '22:00');
    await expect(banner(page)).toHaveCount(1);
    await expect(banner(page)).toContainText('Badminton lundi soir');
    // Bouton discret : un lien d'action sous « Démarrer une séance », 48 px de haut.
    const add = page.getByRole('button', { name: '+ Activité' });
    await expect(add).toHaveClass(/\blink\b/);
    expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
    expect((await add.boundingBox())!.y).toBeGreaterThan((await page.getByRole('button', { name: 'Démarrer une séance' }).boundingBox())!.y);
    await add.click();
    const form = page.getByRole('form', { name: 'Activité ponctuelle' });
    const choices = form.getByRole('group', { name: 'Activité' });
    // Futsal (hors habitude active) en tête et présélectionné ; le badminton (habitude active) ensuite.
    await expect(choices.getByRole('button')).toHaveText(['Futsal', 'Badminton', 'Autre']);
    await expect(choices.getByRole('button', { pressed: true })).toHaveText(['Futsal']);
    // Préremplie d'après l'habitude : durée (20 h – 21 h) et groupes ; date du jour.
    await expect(form.getByLabel('Date')).toHaveValue('2026-10-23');
    await expect(form.getByLabel('Durée (min)')).toHaveValue('60');
    const groups = form.getByRole('group', { name: 'Groupes sollicités' });
    await expect(groups.getByRole('button', { pressed: true })).toHaveText(['Jambes']);
    await form.getByLabel('Durée (min)').fill('75');
    await groups.getByRole('button', { name: 'Abdominaux' }).click();
    // Date future refusée, avec un message.
    await form.getByLabel('Date').fill('2026-10-24');
    await form.getByRole('button', { name: 'Enregistrer l’activité' }).click();
    await expect(form.getByRole('alert')).toHaveText('La date ne peut pas être dans le futur.');
    await form.getByLabel('Date').fill('2026-10-23');
    await noOverflow(page);
    await test.info().attach('accueil-activite', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await form.getByRole('button', { name: 'Enregistrer l’activité' }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'Activité enregistrée' })).toHaveText('Activité enregistrée : Futsal · 1 h 15, 23 oct. 2026.');
    // Comptée comme une activité confirmée : en-tête et travail indirect « aujourd'hui ».
    await expect(recapTitle(page)).toContainText(/0\s+séance · 1\s+activité/);
    await expect(recapCell(page, 'jambes')).toContainText(/\+1\s+indirect/);
    await expect(recapCell(page, 'jambes')).toContainText('aujourd’hui');
    await expect(banner(page)).toContainText('Badminton lundi soir');

    // Deuxième saisie : le futsal en tête, présélectionné et prérempli d'après la dernière fois (2 appuis :
    // « + Activité », « Enregistrer l'activité ») ; nouveau nom avec « Autre ».
    await add.click();
    await expect(choices.getByRole('button')).toHaveText(['Futsal', 'Badminton', 'Autre']);
    await expect(choices.getByRole('button', { name: 'Futsal' })).toHaveAttribute('aria-pressed', 'true');
    await expect(form.getByLabel('Durée (min)')).toHaveValue('75');
    await expect(groups.getByRole('button', { pressed: true })).toHaveText(['Jambes', 'Abdominaux']);
    // Déjà enregistrée ce jour-là : refusée.
    await form.getByRole('button', { name: 'Enregistrer l’activité' }).click();
    await expect(form.getByRole('alert')).toHaveText('Cette activité est déjà enregistrée ce jour-là.');
    await choices.getByRole('button', { name: 'Autre' }).click();
    await expect(form.getByLabel('Durée (min)')).toHaveValue('');
    await form.getByLabel('Nom de l’activité').fill('Escalade');
    await form.getByLabel('Date').fill('2026-10-21');
    await form.getByLabel('Durée (min)').fill('90');
    for (const g of ['Dos', 'Biceps']) await groups.getByRole('button', { name: g }).click();
    await form.getByRole('button', { name: 'Enregistrer l’activité' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Activité enregistrée' })).toHaveText('Activité enregistrée : Escalade · 1 h 30, 21 oct. 2026.');
    await expect(recapTitle(page)).toContainText(/0\s+séance · 2\s+activités/);
    await expect(recapCell(page, 'dos')).toContainText(/\+1\s+indirect/);
    // Hors habitude active, la plus récente en tête (futsal du 23, escalade du 21), puis le badminton.
    await add.click();
    await expect(choices.getByRole('button')).toHaveText(['Futsal', 'Escalade', 'Badminton', 'Autre']);
    await expect(choices.getByRole('button', { pressed: true })).toHaveText(['Futsal']);
    await form.getByRole('button', { name: 'Annuler' }).click();

    // Après relance : toujours là ; historique (ligne compacte, détail sans heures) et bilan de la semaine.
    await page.reload();
    await expect(recapTitle(page)).toContainText(/2\s+activités/);
    await page.goto('./#/historique');
    const item = page.getByRole('link', { name: /Futsal · 1 h 15/ });
    await expect(item).toHaveAccessibleName(/^23 octobre 2026 : Futsal · 1 h 15 activité/);
    await item.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Futsal · 1 h 15');
    await expect(page.getByRole('main')).toContainText('23 octobre 2026 · 1 h 15 · activité ponctuelle');
    await expect(page.getByRole('main')).toContainText('Groupes sollicités (en indirect) : Jambes, Abdominaux');
    await page.goto('./#/bilan-periode/semaine/2026-10-19');
    await expect(page.getByRole('region', { name: 'Séances' })).toContainText('Activités : Escalade ×1, 1 h 30 ; Futsal ×1, 1 h 15');
    await expect(page.getByTestId('report-text')).toContainText('- Activités : Escalade ×1, 1 h 30 ; Futsal ×1, 1 h 15');

    // Le futsal reste une habitude désactivée : aucune question, même le vendredi suivant.
    await openAt(page, '2026-10-30', '22:00');
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    await expect(page.locator('.activity-banner[data-habit="habitude-futsal"]')).toHaveCount(0);
  });
});

