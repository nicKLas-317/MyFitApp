import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Exercise, Performance, Session } from '../src/domain/types';
import { addExercise, readExercises, reloadAfterWrites, startSession, writeSessions } from './helpers';

/** Version 1.57.0 : ergonomie et visuel de l'audit du 20 novembre 2026, au format du téléphone (360 × 800 px). */

const PHONE = { width: 360, height: 800 };

function perf(variantId: string, weightKg: number, target = 9, feeling: Performance['feeling'] = 'bien'): Performance {
  return { variantId, weightKg, targetReps: target, plannedSets: 3, reps: [target, target, target], feeling };
}

function sess(id: string, date: string, performances: Performance[], location?: 'maison'): Session {
  const start = new Date(`${date}T18:00:00`).getTime();
  return {
    id, name: `Séance du ${date}`, date, startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start, origin: 'app', state: 'done', performances,
    ...(location ? { location } : {}),
  };
}

/** Exercices de la base, avec des favoris (étoile de la fiche). */
async function setFavorites(page: Page, ids: string[]): Promise<void> {
  const exercises = (await readExercises(page)).map((e) => ({ ...e, variants: e.variants.map((v) => (ids.includes(v.id) ? { ...v, favorite: true } : v)) }));
  await page.evaluate(
    (list: Exercise[]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onsuccess = () => {
          const tx = open.result.transaction('exercises', 'readwrite');
          for (const e of list) tx.objectStore('exercises').put(e);
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    exercises,
  );
}

async function open(page: Page, now: string, sessions: Session[], favorites: string[] = []): Promise<void> {
  await page.setViewportSize(PHONE);
  await page.clock.setFixedTime(new Date(now));
  await page.goto('./');
  await expect(page.getByTestId('weekly-recap')).toBeVisible();
  await writeSessions(page, sessions);
  if (favorites.length) await setFavorites(page, favorites);
  await reloadAfterWrites(page);
  await expect(page.getByTestId('weekly-recap')).toBeVisible();
}

/** Boîte d'un élément, et ce qui le recouvre peut-être : barre du pouce, message « Annuler », en-tête. */
async function uncovered(target: Locator): Promise<boolean> {
  return target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const points = [
      [r.left + 4, r.top + 4],
      [r.right - 4, r.top + 4],
      [r.left + 4, r.bottom - 4],
      [r.right - 4, r.bottom - 4],
    ];
    return points.every(([x, y]) => {
      const hit = document.elementFromPoint(x!, y!);
      return !!hit && (hit === el || el.contains(hit));
    });
  });
}

const HISTORY = [
  sess('s1', '2026-11-16', [perf('pec-deck', 30), perf('chest-press', 40), perf('leg-curl', 25)]),
  sess('s2', '2026-11-18', [perf('pec-deck', 30), perf('chest-press', 40), perf('leg-curl', 25)]),
];

test.describe('Ergonomie (version 1.57.0)', () => {
  test('338. Après la dernière série (ou les séries d’un coup), le ressenti est à l’écran, au-dessus de la barre du pouce et du message « Séries enregistrées », sans défiler, jusqu’au dernier exercice', async ({ page }) => {
    await open(page, '2026-11-20T18:00:00', HISTORY);
    await startSession(page);
    for (const [query, name] of [['pec deck', 'Pec deck'], ['chest press', 'Chest press'], ['leg curl', 'Leg curl']] as const) await addExercise(page, query, name);
    for (const name of ['Pec deck', 'Chest press', 'Leg curl']) {
      const card = page.locator(`article[aria-label="${name}"]`);
      if (!(await card.getByRole('button', { name: /^Valider les 3 séries/ }).isVisible())) await card.locator('.card-head button, .card-head a').first().click();
      await card.getByRole('button', { name: 'Valider les 3 séries' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Séries enregistrées' })).toBeVisible();
      // Les cinq niveaux, entiers et non recouverts, alors que le message est encore là.
      for (const level of ['Très mal', 'Mal', 'Moyen', 'Bien', 'Très bien']) {
        await expect.poll(() => uncovered(card.getByRole('button', { name: level, exact: true }))).toBe(true);
      }
      await expect(page.getByRole('status').filter({ hasText: 'Séries enregistrées' })).toBeVisible();
      await card.getByRole('button', { name: 'Bien', exact: true }).click();
    }
  });

  test('339 et 340. Liste d’ajout : favoris compatibles avec le lieu en tête ; lignes compactes, la charge sous le nom', async ({ page }) => {
    const history = [...HISTORY, sess('m1', '2026-11-17', [perf('crunch-sol', 0, 20)], 'maison')];
    await open(page, '2026-11-20T18:00:00', history, ['crunch-sol', 'pec-deck', 'leg-extension']);
    await startSession(page);
    await page.getByRole('link', { name: 'Ajouter un exercice' }).click();
    const tier = (t: string) => page.locator(`section[data-tier="${t}"] li[data-variant]`);
    // Salle : le crunch au sol (fait seulement à la maison) n'est plus en tête ; le leg extension, jamais fait, oui.
    await expect(tier('favoris')).toHaveCount(2);
    expect(await tier('favoris').evaluateAll((els) => els.map((e) => e.getAttribute('data-variant')))).toEqual(['pec-deck', 'leg-extension']);
    await expect(tier('tous').and(page.locator('[data-variant="crunch-sol"]'))).toHaveCount(1);
    // Lignes compactes : groupe et charge sous le nom, rien à droite qu'une pastille ; 72 px au plus pour un nom court.
    const pec = tier('favoris').first();
    await expect(pec.locator('.pick-name .muted')).toHaveText('Pectoraux · 30 kg');
    await expect(pec.locator('.pick-meta')).toHaveText('');
    expect((await pec.boundingBox())!.height).toBeLessThanOrEqual(72);
    // Un nom long tient sur 2 lignes au plus.
    const long = page.locator('li[data-exercise="tirage-horizontal"] strong, li[data-variant="tirage-horizontal"] strong').first();
    const lines = await long.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
    expect(lines).toBeLessThanOrEqual(2);
    // Au premier écran, sous les puces : au moins 6 exercices entiers.
    const visible = await page.locator('li[data-variant]').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().bottom <= window.innerHeight).length);
    expect(visible).toBeGreaterThanOrEqual(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

    // À la maison : le crunch au sol en tête, le pec deck (fait seulement à la salle) dans « Tous les exercices ».
    await page.goto('./#/seance');
    await page.getByRole('button', { name: 'Actions : Séance' }).click();
    await page.getByRole('menuitem', { name: 'Passer à la maison' }).click();
    await page.getByRole('link', { name: 'Ajouter un exercice' }).click();
    expect(await tier('favoris').evaluateAll((els) => els.map((e) => e.getAttribute('data-variant')))).toEqual(['leg-extension', 'crunch-sol']);
    await expect(tier('tous').and(page.locator('[data-variant="pec-deck"]'))).toHaveCount(1);
  });

  test('341, 342 et 344. Carte ouverte sous l’en-tête ; séries à venir lisibles (contraste d’au moins 4,5:1) ; « Dernière fois » : la pastille avec la date', async ({ page }) => {
    const curl = [sess('c1', '2026-11-16', [perf('curl-biceps-halteres', 12, 8)]), sess('c2', '2026-11-18', [perf('curl-biceps-halteres', 12, 8)])];
    await open(page, '2026-11-20T18:00:00', [...HISTORY, ...curl]);
    await startSession(page);
    for (const [query, name] of [['pec deck', 'Pec deck'], ['chest press', 'Chest press'], ['leg curl', 'Leg curl']] as const) await addExercise(page, query, name);
    const card = await addExercise(page, 'curl biceps haltères', 'Curl biceps haltères');
    // 342 : la carte amenée à l'écran commence sous l'en-tête (vignette et nom entiers).
    const header = (await page.locator('.session-header').boundingBox())!;
    const head = (await card.locator('.card-head').boundingBox())!;
    expect(head.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    expect(await uncovered(card.locator('.card-head strong').first())).toBe(true);
    // 341 : séries à venir, sans transparence, texte à 4,5:1 au moins sur le fond.
    const contrast = await card.locator('.set.todo').first().evaluate((el) => {
      const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const lum = (c: number[]) => {
        const [r, g, b] = c.map((v) => {
          const x = v / 255;
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      let bgEl: Element | null = el;
      let bg = 'rgba(0, 0, 0, 0)';
      while (bgEl && /rgba\(.*, 0\)$|transparent/.test((bg = getComputedStyle(bgEl).backgroundColor))) bgEl = bgEl.parentElement;
      const fg = getComputedStyle(el.querySelector('.set-label')!).color;
      const [a, b] = [lum(rgb(fg)), lum(rgb(bg))].sort((x, y) => y - x);
      return { opacity: getComputedStyle(el).opacity, ratio: (a! + 0.05) / (b! + 0.05) };
    });
    expect(contrast.opacity).toBe('1');
    expect(contrast.ratio).toBeGreaterThanOrEqual(4.5);
    // 344 : « Dernière fois » du curl (« 12 kg / haltère · 8 · 8 · 8 · 18/11 ») : la pastille sur la ligne de la date.
    const last = card.getByTestId('last-time');
    const badge = last.locator('[data-status]');
    const date = last.locator('.last-part').last();
    await expect(date).toContainText('18/11');
    await expect(date.locator('[data-status]')).toHaveCount(1);
    const [b, d] = [(await badge.boundingBox())!, (await date.boundingBox())!];
    expect(Math.abs(b.y + b.height / 2 - (d.y + d.height / 2))).toBeLessThanOrEqual(4);
  });

  test('343. Progrès, lundi 2 nov. : un seul bandeau pour les bilans de la semaine et du mois ; « Partager pour le coach » une seule fois à l’écran, de retour sous « Cardio » une fois envoyé', async ({ page }) => {
    const october = [sess('o1', '2026-10-20', [perf('pec-deck', 30)]), sess('o2', '2026-10-27', [perf('pec-deck', 30)])];
    await open(page, '2026-11-02T09:00:00', october);
    await page.goto('./#/progres');
    const banners = page.locator('.report-banner');
    await expect(banners).toHaveCount(1);
    const banner = banners.first();
    await expect(banner).toHaveAttribute('data-report', 'both');
    await expect(banner).toContainText('Tes bilans de la semaine et du mois sont prêts');
    for (const name of ['Voir la semaine', 'Voir le mois', 'Plus tard', 'Partager pour le coach']) await expect(banner.getByRole('button', { name })).toBeVisible();
    await expect(page.getByRole('button', { name: /Partager pour le coach/ })).toHaveCount(1);
    await expect(page.locator('.coach-share')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    // Envoyé (le navigateur des tests télécharge) : « Envoyé au coach ✓ », le bouton revient sous « Cardio ».
    const downloading = page.waitForEvent('download');
    await banner.getByRole('button', { name: 'Partager pour le coach' }).click();
    await downloading;
    await expect(banner.getByTestId('coach-sent')).toHaveText('Envoyé au coach ✓');
    await expect(page.locator('.coach-share').getByRole('button', { name: /Partager pour le coach/ })).toBeVisible();
    // « Voir le mois » ouvre octobre ; « Plus tard » masque les deux.
    await banner.getByRole('button', { name: 'Voir le mois' }).click();
    await expect(page.getByRole('heading', { name: 'Octobre 2026' })).toBeVisible();
    await page.goto('./#/progres');
    await expect(page.locator('.report-banner')).toHaveAttribute('data-report', 'week');
    await page.locator('.report-banner').getByRole('button', { name: 'Plus tard' }).click();
    await expect(page.locator('.report-banner')).toHaveCount(0);
  });

  test('345 et 346. Volet de fin : « Ressenti manquant » en texte neutre ; « Enregistrer la pesée » dans Progrès comme dans Mon poids', async ({ page }) => {
    await open(page, '2026-11-20T18:00:00', HISTORY);
    await startSession(page);
    const card = await addExercise(page, 'pec deck', 'Pec deck');
    await card.getByRole('button', { name: 'Valider les 3 séries' }).click();
    await page.getByRole('button', { name: 'Terminer la séance' }).click();
    const note = page.locator('.missing-feelings > p').first();
    await expect(note).toContainText('Ressenti manquant (1)');
    const style = await note.evaluate((el) => ({ color: getComputedStyle(el).color, body: getComputedStyle(document.body).color, weight: Number(getComputedStyle(el).fontWeight) }));
    expect(style.color).toBe(style.body);
    expect(style.weight).toBeGreaterThanOrEqual(700);
    await page.getByRole('button', { name: 'Non, continuer la séance' }).click();
    await page.goto('./#/progres');
    await expect(page.getByRole('button', { name: 'Enregistrer la pesée' })).toBeVisible();
    await page.goto('./#/poids');
    await expect(page.getByRole('button', { name: 'Enregistrer la pesée' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enregistrer', exact: true })).toHaveCount(0);
  });

  test('347. « Dernières évolutions » avec un nom long : rien ne déborde, l’évolution reste dans le cadre (360 et 320 px)', async ({ page }) => {
    const rows = [
      sess('t1', '2026-11-09', [perf('tirage-horizontal', 52, 8)]),
      sess('t2', '2026-11-12', [perf('tirage-horizontal', 52, 8)]),
      sess('t3', '2026-11-16', [perf('tirage-horizontal', 52, 9)]),
    ];
    await open(page, '2026-11-20T18:00:00', rows);
    for (const width of [360, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('./#/bilan');
      const section = page.getByRole('region', { name: 'Dernières évolutions' });
      await expect(section).toContainText('Tirage horizontal machine (appui pectoral)');
      await expect(section.getByText('Date : première séance au nouveau palier.')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      const inside = await section.evaluate((s) => {
        const box = s.getBoundingClientRect();
        return [...s.querySelectorAll('.change-what')].every((w) => w.getBoundingClientRect().right <= box.right - parseFloat(getComputedStyle(s).paddingRight) + 0.5);
      });
      expect(inside).toBe(true);
      await expect(section.locator('.change-what').first()).toHaveText('8 → 9 rép.');
    }
  });
});
