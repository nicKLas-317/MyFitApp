import { expect, test, type Page } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { writeSessions } from './helpers';

const t = (day: number, h = 18) => Date.parse(`2026-10-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00`);
let n = 0;
function done(day: number, perfs: [string, number, number, 'vert' | 'rouge'][], cardio?: [string, number][]): Session {
  const start = t(day);
  const s: Session = {
    id: `b${++n}`, name: 'Séance', date: `2026-10-${String(day).padStart(2, '0')}`, startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start,
    origin: 'app', state: 'done',
    performances: perfs.map(([variantId, weightKg, target, status]) => ({
      variantId, weightKg, targetReps: target, plannedSets: 3, reps: status === 'vert' ? [target, target, target] : [target, target - 1, target - 1], feeling: 'bien',
    })),
  };
  if (cardio) s.cardio = cardio.map(([machine, minutes], i) => ({ id: `c${n}-${i}`, machineId: machine, machine, minutes }));
  return s;
}

/** Semaine du 12 au 18 octobre : 3 séances ; semaine du 19 au 25 : 4 séances (mêmes données que les tests unitaires). */
const SESSIONS: Session[] = [
  done(13, [['presse-a-cuisses', 100, 8, 'rouge']]),
  done(14, [['presse-a-cuisses', 100, 8, 'rouge'], ['curl-biceps-halteres', 12, 8, 'vert']]),
  done(15, [['presse-a-cuisses', 100, 8, 'rouge']]),
  done(20, [['leg-extension', 40, 12, 'vert'], ['tractions-assistees', 30, 12, 'vert']], [['Tapis de marche', 10]]),
  done(21, [['presse-a-cuisses', 100, 8, 'rouge'], ['curl-biceps-halteres', 12, 8, 'vert']]),
  done(23, [['leg-extension', 40, 12, 'vert']]),
  done(24, [['tractions-assistees', 30, 12, 'vert'], ['pec-deck', 30, 8, 'vert']], [['Tapis de marche', 20], ['Rameur', 10]]),
];

function writeWeighIns(page: Page, list: { date: string; weightKg: number }[]): Promise<void> {
  return page.evaluate(
    (items) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('myfitapp-corps');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('weighIns', 'readwrite');
          for (const w of items) tx.objectStore('weighIns').put(w);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    list,
  );
}

/** Adresse fictive, d'un domaine réservé aux exemples (RFC 2606). */
const ADDRESS = 'moi@example.org';

/** Couleurs de statut (vert, orange, rouge) : jamais utilisées sur l'écran du bilan. */
const STATUS_COLORS = ['rgb(74, 222, 128)', 'rgb(253, 186, 116)', 'rgb(252, 165, 165)'];

test.describe('Bilans de la semaine et du mois (§19.7)', () => {
  test('194. Pastille sur l’onglet Progrès et bandeau en haut de l’onglet le lundi, bilan de la semaine écoulée, envoi par partage natif, copie, navigation, réglages ; format smartphone', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    // Partage natif simulé : on vérifie l'objet et le texte transmis.
    await page.addInitScript(() => {
      (window as unknown as { shared: unknown[] }).shared = [];
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: unknown) => {
          (window as unknown as { shared: unknown[] }).shared.push(data);
        },
      });
    });
    // Lundi 26 octobre 2026, 9 h.
    await page.clock.setFixedTime(new Date('2026-10-26T09:00:00'));
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
    await writeSessions(page, SESSIONS);
    await writeWeighIns(page, [
      { date: '2026-10-19', weightKg: 80.2 },
      { date: '2026-10-25', weightKg: 79.6 },
    ]);
    await page.reload();

    // Onglet Séance : plus de bandeau ; une pastille sur l'onglet Progrès (semaine écoulée seulement : septembre n'a
    // aucune séance, pas de bilan du mois).
    const tabs = page.getByRole('navigation', { name: 'Onglets' });
    const badge = tabs.getByTestId('report-badge');
    const banner = page.locator('.report-banner');
    await expect(banner).toHaveCount(0);
    await expect(badge).toHaveCount(1);
    await expect(tabs.getByRole('link', { name: 'Progrès : bilan prêt' })).toBeVisible();
    // Le réglage « Signaler le bilan de la semaine » pilote la pastille.
    await page.goto('./#/reglages');
    await page.getByLabel('Signaler le bilan de la semaine (pastille sur Progrès)').uncheck();
    await expect(badge).toHaveCount(0);
    await page.getByLabel('Signaler le bilan de la semaine (pastille sur Progrès)').check();
    await expect(badge).toHaveCount(1);
    // Onglet Progrès : le bandeau, tout en haut.
    await tabs.getByRole('link', { name: /^Progrès/ }).click();
    await expect(banner).toHaveCount(1);
    await expect(banner).toContainText('Ton bilan de la semaine est prêt');
    const [bannerBox, linksBox] = [(await banner.boundingBox())!, (await page.getByRole('navigation', { name: 'Bilans' }).boundingBox())!];
    expect(bannerBox.y).toBeLessThan(linksBox.y);
    // « Plus tard » : bandeau et pastille masqués pendant cette ouverture, de retour à la suivante.
    await banner.getByRole('button', { name: 'Plus tard' }).click();
    await expect(banner).toHaveCount(0);
    await expect(badge).toHaveCount(0);
    await page.reload();
    await expect(banner).toHaveCount(1);
    await expect(badge).toHaveCount(1);
    await test.info().attach('progres-bandeau', { body: await page.screenshot(), contentType: 'image/png' });

    await banner.getByRole('button', { name: 'Voir' }).click();
    await expect(page).toHaveURL(/#\/bilan-periode\/semaine\/2026-10-19$/);
    await expect(page.getByTestId('report-title')).toHaveText('Semaine du 19 au 25 oct. 2026');
    const section = (title: string) => page.getByRole('region', { name: title });
    await expect(section('Séances')).toContainText('4 séances, +1 par rapport à la semaine précédente');
    await expect(section('Séances')).toContainText('Cardio : 40 min (Tapis de marche 30 min, Rameur 10 min)');
    await expect(section('Groupes travaillés')).toContainText('Biceps : 1× · +2 indirect');
    await expect(section('Progressions')).toContainText('Tractions assistées : 3×12 avec 30 kg d’aide validé → moins d’aide, 3×8 (24 oct.)');
    await expect(section('En difficulté')).toContainText('Presse à cuisses : 4ᵉ séance rouge de suite à 100\u00a0kg → poids inférieur recommandé (21\u00a0oct.)');
    await expect(section('Poids')).toContainText('80,2 kg le 19 oct. → 79,6 kg le 25 oct.');
    // Éléments importants mis en évidence (gras), le reste en texte simple.
    await expect(section('Progressions').locator('.report-em').first()).toHaveText('3×8 → 3×9 à 12\u00a0kg');
    await expect(section('Groupes travaillés').locator('.report-em')).toHaveText(['Non travaillés : Épaules, Triceps']);
    expect(await section('Séances').locator('.report-em').first().evaluate((e) => getComputedStyle(e).fontWeight)).toBe('700');
    await test.info().attach('bilan-semaine', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    // Aucune couleur de statut sur l'écran ; rien ne dépasse à 412, 360 et 320 px.
    const colors = await page.locator('main.period-report, main.period-report *').evaluateAll((els) =>
      els.flatMap((e) => {
        const s = getComputedStyle(e);
        return [s.color, s.backgroundColor, s.borderTopColor];
      }),
    );
    for (const c of STATUS_COLORS) expect(colors).not.toContain(c);
    for (const width of [412, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px`).toBe(true);
    }
    await page.setViewportSize({ width: 412, height: 915 });

    // Envoi : partage natif avec l'objet et le texte brut du bilan.
    const text = (await page.getByTestId('report-text').textContent())!;
    expect(text.startsWith('MyFitApp — Bilan semaine du 19 au 25 oct. 2026\n\nSÉANCES\n- 4 séances')).toBe(true);
    await page.getByRole('button', { name: 'Envoyer par mail' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { shared: unknown[] }).shared)).toEqual([
      { title: 'MyFitApp — Bilan semaine du 19 au 25 oct. 2026', text },
    ]);
    await page.getByRole('button', { name: 'Copier le texte' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Texte copié.' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);

    // Navigation : semaine précédente, puis suivante jusqu'à la semaine en cours (sans bouton « suivante »).
    await page.getByRole('button', { name: 'Semaine précédente' }).click();
    await expect(page.getByTestId('report-title')).toHaveText('Semaine du 12 au 18 oct. 2026');
    await expect(section('En difficulté')).toContainText('Presse à cuisses : 3\u00a0séances rouges cette semaine');
    await page.getByRole('button', { name: 'Semaine suivante' }).click();
    await page.getByRole('button', { name: 'Semaine suivante' }).click();
    await expect(page.getByTestId('report-title')).toHaveText('Semaine du 26 oct. au 1 nov. 2026');
    await expect(page.locator('.report-heading')).toContainText('Semaine en cours, arrêtée au lun. 26 oct.');
    await expect(page.getByRole('button', { name: 'Semaine suivante' })).toHaveCount(0);
    // Onglet Mois : mois en cours (il contient des séances), comparé au mois précédent.
    await page.getByRole('button', { name: 'Mois', exact: true }).click();
    await expect(page.getByTestId('report-title')).toHaveText('Octobre 2026');
    await expect(section('Séances')).toContainText('7 séances, +7 par rapport au mois précédent');
    await expect(page.getByRole('button', { name: 'Semaine', exact: true })).toHaveAttribute('aria-pressed', 'false');

    // Bilan ouvert : ni bandeau ni pastille pour cette semaine, même après relance.
    await page.goto('./#/progres');
    await expect(page.getByRole('heading', { name: 'Progrès' })).toBeVisible();
    await expect(banner).toHaveCount(0);
    await expect(badge).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Progrès' })).toBeVisible();
    await expect(banner).toHaveCount(0);
    await expect(badge).toHaveCount(0);

    // Accès depuis le bilan de progression : semaine en cours vide, donc la semaine écoulée.
    await page.goto('./#/bilan');
    await page.getByRole('link', { name: 'Bilan de la semaine / du mois' }).click();
    await expect(page.getByTestId('report-title')).toHaveText('Semaine du 19 au 25 oct. 2026');

    // Réglages : adresse facultative (préremplie dans le mailto), bandeaux désactivables, conservés après relance.
    await page.goto('./#/reglages');
    const email = page.getByLabel('Adresse e-mail (facultative, préremplie dans le mail)');
    await email.fill('pas une adresse');
    await page.getByRole('button', { name: 'Enregistrer l’adresse' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Adresse e-mail invalide.' })).toBeVisible();
    await email.fill(ADDRESS);
    await page.getByRole('button', { name: 'Enregistrer l’adresse' }).click();
    await expect(page.getByText('Adresse enregistrée.')).toBeVisible();
    await page.getByLabel('Signaler le bilan de la semaine (pastille sur Progrès)').uncheck();
    await page.reload();
    await expect(page.getByLabel('Signaler le bilan de la semaine (pastille sur Progrès)')).not.toBeChecked();
    await expect(page.getByLabel('Signaler le bilan du mois (pastille sur Progrès)')).toBeChecked();
    await expect(email).toHaveValue(ADDRESS);
    await page.goto('./#/bilan-periode/semaine/2026-10-19');
    await expect(page.getByRole('button', { name: `Mail à ${ADDRESS}` })).toBeVisible();
  });
});
