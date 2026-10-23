import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { simulatedHistory } from '../src/analysis/__tests__/simulation';
import { activeSession, addExercise, cardAction, doExercise, finishSheet, readSessions, startSession, validateSets, writeSessions } from './helpers';

/** Fond d'un bouton principal (bleu) et cadre neutre. */
const ACCENT = 'rgb(91, 157, 255)';
const NEUTRAL = 'rgb(74, 81, 99)';
const CYAN = 'rgb(62, 230, 238)';

function pecDeck(day: number, target: number, weightKg = 35): Session {
  const t = new Date(2026, 9, day, 18).getTime();
  return {
    id: `p${day}`, name: `Passée ${day}`, date: `2026-10-${String(day).padStart(2, '0')}`, startedAt: t, endedAt: t + 3_600_000,
    createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: [{ variantId: 'pec-deck', weightKg, targetReps: target, plannedSets: 3, reps: [target, target, target], feeling: 'bien' }],
  };
}

async function seed(page: Page, sessions: Session[]): Promise<void> {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
  await writeSessions(page, sessions);
  await page.reload();
}

/** Répétitions préremplies de chaque série (série en cours et séries à venir), dans l'ordre. */
function prefilled(card: Locator): Promise<string[]> {
  return card.locator('.sets li').evaluateAll((rows) => rows.map((li) => (li.querySelector('output') ?? li.querySelector('.muted'))?.textContent?.trim() ?? ''));
}

/** Taille de police Android agrandie (simulation) : tout le texte à 115 %. */
async function largeText(page: Page): Promise<() => Promise<void>> {
  const style = await page.addStyleTag({ content: ':root { font-size: calc(17px * 1.15) !important; }' });
  return () => style.evaluate((el) => (el as Element).remove());
}

/** Boutons de ressenti d'un exercice : taille, écart, une seule ligne de texte, fond. */
function feelingButtons(group: Locator) {
  return group.getByRole('button').evaluateAll((els) => {
    const boxes = els.map((el) => el.getBoundingClientRect());
    return els.map((el, i) => {
      const s = getComputedStyle(el);
      const r = boxes[i]!;
      const next = boxes[i + 1];
      return {
        label: el.textContent,
        height: r.height,
        top: Math.round(r.top),
        gap: next && Math.round(next.top) === Math.round(r.top) ? next.left - r.right : null,
        lines: (() => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
        })(),
        background: s.backgroundColor,
      };
    });
  });
}

/**
 * Règles de l'écran affiché (§3.3) : cinq tailles de police, espacements de 8, 16 et 24 px, éléments tactiles d'au
 * moins 48 px de haut et à 8 px au moins de leurs voisins, titres de section tous identiques, étiquettes de graphiques
 * d'au moins 12 px, rien qui dépasse.
 */
function auditScreen(page: Page, scale = 1) {
  return page.evaluate((k) => {
    const visible = (e: Element) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const name = (e: Element) => `${e.tagName.toLowerCase()}${e.classList.length ? '.' + [...e.classList].join('.') : ''} « ${(e.textContent ?? '').trim().slice(0, 30)} »`;
    const scope = [...document.querySelectorAll('main *, [role=dialog], [role=dialog] *')].filter(visible);
    const sizes = new Set([13, 15, 17, 22, 28].map((n) => Math.round(n * k * 10) / 10));
    const badFonts: string[] = [];
    for (const e of scope) {
      const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
      const size = Math.round(parseFloat(getComputedStyle(e).fontSize) * 10) / 10;
      if (own && ![...sizes].some((s) => Math.abs(s - size) < 0.2)) badFonts.push(`${name(e)} ${size}px`);
    }
    const spacing = new Set([0, 8, 16, 24]);
    const badSpacing: string[] = [];
    for (const e of scope) {
      if (e.closest('svg') || e.matches('input[type=checkbox], input[type=radio]')) continue;
      const s = getComputedStyle(e);
      // Marges horizontales : seulement des marges automatiques (centrage, alignement à droite), non comptées.
      const values = [s.marginTop, s.marginBottom, s.paddingTop, s.paddingBottom, s.paddingLeft, s.paddingRight, s.rowGap, s.columnGap];
      for (const v of values) if (!Number.isNaN(parseFloat(v)) && !spacing.has(Math.round(parseFloat(v)))) badSpacing.push(`${name(e)} ${v}`);
    }
    // Volet modal ouvert : seules ses commandes sont touchables.
    const modal = document.querySelector('[aria-modal="true"]');
    const targets = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary, [role=menuitem]')]
      .filter((e) => visible(e) && !e.closest('.visually-hidden') && !e.classList.contains('visually-hidden') && (!modal || modal.contains(e)))
      .map((e) => (e.matches('input[type=checkbox]') && e.closest('label') ? e.closest('label')! : e))
      .filter((e) => {
        // Une cible recouverte (volet, menu ouvert, en-tête collant) n'est pas touchable.
        const r = e.getBoundingClientRect();
        const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
        if (y < 0 || y > innerHeight) return true;
        const hit = document.elementFromPoint(x, y);
        return !hit || e.contains(hit) || hit.contains(e);
      });
    const small = targets.filter((e) => e.getBoundingClientRect().height < 47.5).map(name);
    const close: string[] = [];
    const boxes = targets.map((e) => e.getBoundingClientRect());
    for (let i = 0; i < targets.length; i++)
      for (let j = i + 1; j < targets.length; j++) {
        if (targets[i]!.contains(targets[j]!) || targets[j]!.contains(targets[i]!)) continue;
        // Barre fixe (onglets, mode salle) : le contenu défile dessous, jamais à côté.
        const bar = (e: Element) => e.closest('.tab-bar, .session-bar');
        if (bar(targets[i]!) !== bar(targets[j]!)) continue;
        const [a, b] = [boxes[i]!, boxes[j]!];
        const gx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
        const gy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
        const gap = gx > 0 && gy > 0 ? Math.hypot(gx, gy) : Math.max(gx, gy);
        if (gap < 7.5) close.push(`${name(targets[i]!)} ↔ ${name(targets[j]!)} : ${Math.round(gap)} px`);
      }
    const titles = [...new Set([...document.querySelectorAll('.section-title, fieldset.frame > legend, .data-section h2, .bilan-title')].filter(visible).map((e) => {
      const s = getComputedStyle(e);
      return `${s.fontSize} ${s.fontWeight} ${s.textTransform} ${s.color}`;
    }))];
    const chartLabels = [...document.querySelectorAll('svg text')].filter(visible).map((e) => e.getBoundingClientRect().height > 0 && parseFloat(getComputedStyle(e).fontSize) * (e.closest('svg')!.getBoundingClientRect().width / (e.closest('svg') as SVGSVGElement).viewBox.baseVal.width));
    return {
      badFonts: [...new Set(badFonts)],
      badSpacing: [...new Set(badSpacing)],
      small: [...new Set(small)],
      close: [...new Set(close)],
      titles,
      minChartLabel: Math.min(99, ...chartLabels.filter((n): n is number => typeof n === 'number')),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  }, scale);
}

async function expectClean(page: Page, screen: string, scale = 1): Promise<void> {
  const r = await auditScreen(page, scale);
  expect(r.badFonts, `${screen} : tailles de police`).toEqual([]);
  expect(r.badSpacing, `${screen} : espacements`).toEqual([]);
  expect(r.small, `${screen} : éléments tactiles de moins de 48 px`).toEqual([]);
  expect(r.close, `${screen} : éléments tactiles à moins de 8 px`).toEqual([]);
  expect(r.titles.length, `${screen} : un seul style de titre de section`).toBeLessThanOrEqual(1);
  expect(r.minChartLabel, `${screen} : étiquettes des graphiques`).toBeGreaterThanOrEqual(12);
  expect(r.overflow, `${screen} : débordement`).toBeLessThanOrEqual(0);
}

test.describe('Ergonomie de la saisie et harmonisation du style', () => {
  test('221. Carte ouverte : une seule ligne de cible avec la charge et une courte mention ; « Dernière fois » jamais tronquée ; poids supérieur saisi : séries préremplies à 8', async ({ page }) => {
    await seed(page, [pecDeck(1, 8, 52.5), pecDeck(3, 8, 52.5)]);
    await startSession(page);
    const card = await addExercise(page, 'pec deck', 'Pec deck');
    // Une seule fois la cible : plus de « Cible : » ni d'encadré du repère.
    await expect(card.getByTestId('next-target')).toHaveText('3 × 9 à 52,5 kg');
    await expect(card.getByTestId('progress-marker')).toHaveText('↑ +1 rép.');
    await expect(card.getByText(/^Cible :/)).toHaveCount(0);
    await expect(card.locator('.reco')).toHaveCount(0);
    await expect(card.getByTestId('last-time')).toHaveText(/^Dernière fois\s*52,5 kg · 8 · 8 · 8 · 03\/10$/);
    // Jamais tronquée : aucun point de suspension, chaque élément entier dans la carte.
    for (const [width, big] of [[412, false], [360, false], [360, true], [320, true]] as const) {
      await page.setViewportSize({ width, height: 800 });
      const restore = big ? await largeText(page) : null;
      const check = await card.getByTestId('last-time').evaluate((zone) => ({
        ellipsis: [...zone.querySelectorAll('*'), zone].some((e) => getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth),
        outside: [...zone.querySelectorAll('.last-part')].some((p) => p.getBoundingClientRect().right > zone.getBoundingClientRect().right + 0.5),
        lines: Math.round(zone.getBoundingClientRect().height / parseFloat(getComputedStyle(zone).lineHeight)),
      }));
      expect(check.ellipsis, `${width} px${big ? ' texte agrandi' : ''}`).toBe(false);
      expect(check.outside, `${width} px${big ? ' texte agrandi' : ''}`).toBe(false);
      if (width === 412 && !big) expect(check.lines, 'une seule ligne à 412 px').toBe(1);
      await restore?.();
    }
    await page.setViewportSize({ width: 412, height: 915 });

    // Changement de charge recommandé : la cible du jour, puis « ↑ Poids supérieur → 3 × 8 ».
    await seed(page, [pecDeck(1, 12), pecDeck(3, 12)]);
    await page.goto('./#/seance');
    await cardAction(card, 'Retirer de la séance');
    await card.getByRole('button', { name: 'Oui, retirer' }).click();
    // Un poids supérieur saisi : cible 3 × 8 à ce poids, séries préremplies à 8 (§7.7), même si « − » a été touché avant.
    for (const touched of [false, true]) {
      const up = await addExercise(page, 'pec deck', 'Pec deck');
      await expect(up.getByTestId('next-target')).toHaveText('3 × 12 à 35 kg');
      await expect(up.getByTestId('progress-marker')).toHaveText('↑ Poids supérieur → 3 × 8');
      expect(await prefilled(up)).toEqual(['12', '12', '12']);
      if (touched) {
        await up.getByRole('button', { name: 'Répétitions série 1 : moins' }).click();
        expect(await prefilled(up)).toEqual(['11', '12', '12']);
      }
      await up.getByLabel('Poids (kg)').fill('40');
      await up.getByLabel('Poids (kg)').press('Enter');
      await expect(up.getByTestId('next-target')).toHaveText('3 × 8 à 40 kg');
      await expect(up.getByTestId('progress-marker')).toHaveCount(0);
      await expect.poll(() => prefilled(up), touched ? '« − » touché avant' : '').toEqual(['8', '8', '8']);
      await expect.poll(async () => (await activeSession(page)).performances[0]).toMatchObject({ weightKg: 40, targetReps: 8, plannedSets: 3 });
      // La série validée vaut 8.
      await up.getByRole('button', { name: 'Valider' }).click();
      await expect.poll(async () => (await activeSession(page)).performances[0]?.reps).toEqual([8]);
      await cardAction(up, 'Retirer de la séance');
      await up.getByRole('button', { name: 'Oui, retirer' }).click();
      await expect(up).toBeHidden();
    }
  });

  test('222. Menu « ⋯ » de la carte : ajuster, voir la fiche, retirer avec confirmation ; ligne de série à 360 px', async ({ page }) => {
    await seed(page, [pecDeck(1, 8), pecDeck(3, 8)]);
    await startSession(page);
    const card = await addExercise(page, 'pec deck', 'Pec deck');
    // Plus d'actions secondaires visibles en permanence dans la carte.
    for (const label of ['Ajuster', 'Retirer de la séance']) await expect(card.getByRole('button', { name: label, exact: true })).toHaveCount(0);
    const menuButton = card.getByRole('button', { name: 'Actions : Pec deck' });
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await menuButton.click();
    await expect(card.getByRole('menuitem')).toHaveText(['Ajuster séries et répétitions', 'Voir la fiche de l’exercice', 'Retirer de la séance']);
    await page.keyboard.press('Escape');
    await expect(card.getByRole('menuitem')).toHaveCount(0);

    // Ajuster : les deux réglages, puis « Terminé ».
    await cardAction(card, 'Ajuster séries et répétitions');
    const adjust = card.getByRole('group', { name: 'Ajuster séries et répétitions' });
    await adjust.getByRole('button', { name: 'Répétitions : plus' }).click();
    await expect(card.getByTestId('next-target')).toHaveText('3 × 10 à 35 kg');
    await adjust.getByRole('button', { name: 'Terminé' }).click();
    await expect(adjust).toHaveCount(0);

    // Ligne de série à 360 px : « Série 1 » sur une ligne, 8 px au moins entre « + » et « Valider ».
    for (const [width, big] of [[360, false], [360, true], [320, false]] as const) {
      await page.setViewportSize({ width, height: 800 });
      const restore = big ? await largeText(page) : null;
      const row = await card.locator('.set.next').evaluate((li) => {
        const label = li.querySelector('.set-label')!;
        const plus = li.querySelector('.step:last-of-type')!.getBoundingClientRect();
        const validate = li.querySelector('.validate')!.getBoundingClientRect();
        const sameLine = validate.top < plus.bottom;
        return {
          labelLines: Math.round(label.getBoundingClientRect().height / parseFloat(getComputedStyle(label).lineHeight)),
          gap: sameLine ? validate.left - plus.right : validate.top - plus.bottom,
          inside: li.getBoundingClientRect().right >= validate.right,
        };
      });
      expect(row.labelLines, `${width} px`).toBe(1);
      expect(row.gap, `${width} px`).toBeGreaterThanOrEqual(8);
      expect(row.inside, `${width} px`).toBe(true);
      await restore?.();
    }
    await page.setViewportSize({ width: 412, height: 915 });

    // Voir la fiche.
    await cardAction(card, 'Voir la fiche de l’exercice');
    await expect(page).toHaveURL(/#\/exercice\/pec-deck$/);
    await expect(page.getByRole('link', { name: 'Ouvrir dans la séance' })).toBeVisible();
  });

  test('223. Fin de séance : volet visible sans défiler ; ressentis de 48 px, à 8 px, sur une ligne, en bleu ; « Terminer sans compléter » secondaire', async ({ page }) => {
    await startSession(page);
    const names = ['Pec deck', 'Chest press', 'Leg extension', 'Leg curl', 'Crunch machine'];
    for (const n of names) await doExercise(await addExercise(page, n.toLowerCase(), n, '30'), 3, 'Bien');
    await validateSets(await addExercise(page, 'curl haltères', 'Curl biceps haltères', '12'), 2);
    await page.evaluate(() => window.scrollTo(0, 0));

    for (const [width, big] of [[412, false], [360, false], [360, true]] as const) {
      await page.setViewportSize({ width, height: width === 412 ? 915 : 800 });
      const restore = big ? await largeText(page) : null;
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByRole('button', { name: 'Terminer la séance' }).click();
      const sheet = finishSheet(page);
      await expect(sheet).toBeVisible();
      // Entièrement à l'écran, sans défiler.
      const box = (await sheet.boundingBox())!;
      const viewport = page.viewportSize()!;
      expect(box.y, `${width} px`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${width} px`).toBeLessThanOrEqual(viewport.height);
      const feelings = await feelingButtons(sheet.getByRole('group', { name: 'Curl biceps haltères' }));
      expect(feelings.map((f) => f.label)).toEqual(['Très mal', 'Mal', 'Moyen', 'Bien', 'Très bien']);
      for (const f of feelings) {
        expect(f.height, `${f.label} à ${width} px`).toBeGreaterThanOrEqual(48);
        expect(f.lines, `${f.label} sur une ligne à ${width} px`).toBe(1);
        if (f.gap !== null) expect(f.gap, `${f.label} à ${width} px`).toBeGreaterThanOrEqual(8);
        expect(f.background, 'action principale : choisir un ressenti').toBe(ACCENT);
      }
      if (width === 360) expect(new Set(feelings.map((f) => f.top)).size, 'deux rangées à 360 px').toBe(2);
      // Rangées espacées de 8 px au moins.
      const tops = [...new Set(feelings.map((f) => f.top))].sort((a, b) => a - b);
      if (tops.length > 1) expect(tops[1]! - tops[0]! - feelings[0]!.height).toBeGreaterThanOrEqual(8 - 1);
      const skip = sheet.getByRole('button', { name: 'Terminer sans compléter' });
      expect(await skip.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(ACCENT);
      await expectClean(page, `volet de fin à ${width} px${big ? ', texte agrandi' : ''}`, big ? 1.15 : 1);
      await sheet.getByRole('button', { name: 'Non, continuer la séance' }).click();
      await expect(sheet).toHaveCount(0);
      await restore?.();
    }
    await page.setViewportSize({ width: 412, height: 915 });

    // Ressenti choisi : seul le choix reste en bleu, « Oui, terminer » devient l'action principale.
    await page.getByRole('button', { name: 'Terminer la séance' }).click();
    const sheet = finishSheet(page);
    await sheet.getByRole('group', { name: 'Curl biceps haltères' }).getByRole('button', { name: 'Moyen', exact: true }).click();
    const after = await feelingButtons(sheet.getByRole('group', { name: 'Curl biceps haltères' }));
    expect(after.filter((f) => f.background === ACCENT).map((f) => f.label)).toEqual(['Moyen']);
    const finish = sheet.getByRole('button', { name: 'Oui, terminer' });
    expect(await finish.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(ACCENT);
    await finish.click();
    await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible();
    expect((await readSessions(page))[0]?.performances.at(-1)?.feeling).toBe('moyen');
  });

  test('224. Récapitulatif de fin : « Retour à l’accueil », le nom saisi est gardé', async ({ page }) => {
    await startSession(page);
    await doExercise(await addExercise(page, 'pec deck', 'Pec deck', '35'), 3, 'Bien');
    await page.getByRole('button', { name: 'Terminer la séance' }).click();
    await finishSheet(page).getByRole('button', { name: 'Oui, terminer' }).click();
    await page.getByLabel('Nom de la séance').fill('Pectoraux');
    await page.getByRole('button', { name: 'Retour à l’accueil' }).click();
    await expect(page.getByRole('button', { name: 'Démarrer une séance' })).toBeVisible();
    expect((await readSessions(page))[0]?.name).toBe('Pectoraux');
  });

  test('225. Échelle typographique, espacements et éléments tactiles sur tous les écrans, à 412, 360 et 320 px', async ({ page }) => {
    test.setTimeout(180_000);
    await page.clock.setFixedTime(new Date('2026-10-22T19:30:00'));
    await seed(page, simulatedHistory('2026-10-19'));
    // Une pesée : graphique de Mon poids.
    await page.goto('./#/poids');
    await page.getByLabel('Poids (kg)').fill('78,4');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByLabel('Date').fill('2026-09-01');
    await page.getByLabel('Poids (kg)').fill('79,2');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    const screens: [string, string][] = [
      ['Accueil', './'],
      ['Progrès', './#/progres'],
      ['Plus', './#/plus'],
      ['Bibliothèque', './#/bibliotheque'],
      ['Fiche', './#/exercice/chest-press'],
      ['Modifier un exercice', './#/modifier/chest-press'],
      ['Historique', './#/historique'],
      ['Détail de séance', './#/historique/sim-2026-10-19'],
      ['Bilan', './#/bilan'],
      ['Bilan de la semaine', './#/bilan-periode/semaine/2026-10-12'],
      ['Bilan du mois', './#/bilan-periode/mois/2026-09'],
      ['Par groupe', './#/bilan-groupes/triceps'],
      ['Mon poids', './#/poids'],
      ['Réglages', './#/reglages'],
      ['Données', './#/donnees'],
    ];
    for (const width of [412, 360, 320]) {
      await page.setViewportSize({ width, height: 800 });
      for (const [screen, url] of screens) {
        await page.goto(url);
        await expect(page.locator('main').first()).toBeVisible();
        await page.waitForTimeout(200);
        await expectClean(page, `${screen} à ${width} px`);
      }
    }
    // Séance : carte ouverte, menu ouvert, cardio ; texte agrandi à 115 % à 360 px.
    await page.setViewportSize({ width: 360, height: 800 });
    await startSession(page);
    const card = await addExercise(page, 'chest press', 'Chest press');
    await page.getByRole('button', { name: 'Ajouter du cardio' }).click();
    await page.getByRole('form', { name: 'Cardio' }).getByLabel('Durée (min)').fill('10');
    await page.getByRole('form', { name: 'Cardio' }).getByRole('button', { name: 'Valider' }).click();
    await expectClean(page, 'Séance à 360 px');
    await card.getByRole('button', { name: 'Actions : Chest press' }).click();
    await expectClean(page, 'Séance, menu ouvert');
    await page.keyboard.press('Escape');
    const restore = await largeText(page);
    await expectClean(page, 'Séance, texte agrandi', 1.15);
    await restore();
    await page.getByRole('link', { name: 'Ajouter un exercice' }).click();
    await expect(page.getByRole('searchbox', { name: 'Rechercher un exercice' })).toBeVisible();
    await expectClean(page, 'Ajout d’un exercice');
  });

  test('226. Couleurs des cadres : neutres partout, sauf ce qui concerne un groupe ; Mon poids en simple liste', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-22T19:30:00'));
    await seed(page, simulatedHistory('2026-10-19'));
    // Accueil : bandeaux et récapitulatif neutres ; cases du récapitulatif inchangées (statuts).
    await page.goto('./');
    const home = await page.locator('[data-frame]').evaluateAll((els) => els.map((el) => getComputedStyle(el).borderTopColor));
    expect(home.length).toBeGreaterThanOrEqual(2);
    expect(new Set(home)).toEqual(new Set([NEUTRAL]));
    await expect(page.locator('.recap-cell.recap-vert, .recap-cell.recap-orange, .recap-cell.recap-rouge').first()).toBeVisible();

    // Mon poids : un seul cadre pour toute la liste, une ligne par pesée.
    await page.goto('./#/poids');
    for (const [date, kg] of [['2026-09-01', '79,2'], ['2026-10-01', '78,4']] as const) {
      await page.getByLabel('Date').fill(date);
      await page.getByLabel('Poids (kg)').fill(kg);
      await page.getByRole('button', { name: 'Enregistrer' }).click();
    }
    const list = page.getByRole('list', { name: 'Historique des pesées' });
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(list).toHaveAttribute('data-frame', '');
    await expect(list.locator('[data-frame]')).toHaveCount(0);
    expect(await list.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(NEUTRAL);

    // Par groupe : courbe, barres et cadres dans la couleur du groupe.
    await page.goto('./#/bilan-groupes/pectoraux');
    const frames = await page.locator('main [data-frame]').evaluateAll((els) => els.map((el) => getComputedStyle(el).borderTopColor));
    expect(new Set(frames)).toEqual(new Set([CYAN]));
    // Réglages et données : tout neutre.
    for (const url of ['./#/reglages', './#/donnees']) {
      await page.goto(url);
      expect(new Set(await page.locator('[data-frame]').evaluateAll((els) => els.map((el) => getComputedStyle(el).borderTopColor)))).toEqual(new Set([NEUTRAL]));
    }
    // Séance : cartes d'exercice à la couleur du groupe ; bloc de cardio, menu et volet neutres.
    await startSession(page);
    const card = await addExercise(page, 'pec deck', 'Pec deck');
    expect(await card.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(CYAN);
    await page.getByRole('button', { name: 'Terminer la séance' }).click();
    expect(await finishSheet(page).evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(NEUTRAL);
  });
});
