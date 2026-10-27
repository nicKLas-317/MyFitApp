import { expect, test, type Locator, type Page } from '@playwright/test';
import { formalForms } from '../src/ui/__tests__/vouvoiement';
import type { Session, SessionPlan } from '../src/domain/types';
import { simulatedHistory } from '../src/analysis/__tests__/simulation';
import { activeSession, addExercise, cardAction, doExercise, finishSheet, openSettingsSection, readSessions, startSession, validateSets, writeSessions } from './helpers';

/** Fond d'un bouton principal (bleu) et cadre neutre. */
const ACCENT = 'rgb(91, 157, 255)';
const NEUTRAL = 'rgb(74, 81, 99)';
const CYAN = 'rgb(62, 230, 238)';

/** Séance prévue (§5.9) : trois exercices (un jamais réalisé) et un cardio placé entre deux exercices. */
const PLAN: SessionPlan = {
  id: 'plan-test', createdAt: 0, updatedAt: 0,
  items: [
    { kind: 'exercise', variantId: 'chest-press', startWeightKg: 40 },
    { kind: 'cardio', block: { id: 'prevu-tapis', machineId: 'tapis', machine: 'Tapis de marche', incline: 'neutre', minutes: 15 } },
    { kind: 'exercise', variantId: 'pec-deck', startWeightKg: 30 },
    { kind: 'exercise', variantId: 'crunch-machine', startWeightKg: 25 },
  ],
};

/** Enregistre (ou supprime) la séance prévue dans la base, puis recharge l'appli. */
async function setPlan(page: Page, plan: SessionPlan | null): Promise<void> {
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
  await expect(page.locator('main').first()).toBeVisible();
}

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
      // Contenu d'une section repliée (réglages) : non affiché.
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && e.checkVisibility();
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
        // Sous une barre fixe (onglets, mode salle), la cible reste atteignable en faisant défiler : elle est contrôlée.
        return !hit || e.contains(hit) || hit.contains(e) || !!hit.closest('.tab-bar, .session-bar');
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
      /** Éléments tactiles effectivement contrôlés (pour vérifier qu'aucun n'échappe au contrôle). */
      checked: targets.map(name),
    };
  }, scale);
}

/**
 * Haut de la page : après deux images, pour passer après l'écran qui amène un exercice ajouté à l'écran
 * (`requestAnimationFrame` + `scrollIntoView`), sinon la page peut se retrouver défilée sous l'en-tête collant.
 */
async function toTop(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => (window.scrollTo(0, 0), done())))));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
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
  // Tutoiement (§3.6) : aucun texte affiché ne vouvoie.
  expect(formalForms(await page.locator('body').innerText()), `${screen} : vouvoiement`).toEqual([]);
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
      await up.getByRole('button', { name: 'Valider', exact: true }).click();
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
    await toTop(page);

    for (const [width, big] of [[412, false], [360, false], [360, true]] as const) {
      await page.setViewportSize({ width, height: width === 412 ? 915 : 800 });
      const restore = big ? await largeText(page) : null;
      await toTop(page);
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
    test.setTimeout(300_000);
    await page.clock.setFixedTime(new Date('2026-10-22T19:30:00'));
    await seed(page, simulatedHistory('2026-10-19'));
    // Données réalistes pour que chaque liste ait sa vraie forme : onze pesées (dates longues comme « 22 septembre
    // 2026 », qui font passer le poids et « Corriger » sous la date), une activité confirmée (détail) et la question
    // de la semaine en cours (accueil).
    await page.evaluate(
      ({ weights, activities }) =>
        Promise.all([
          new Promise<void>((resolve, reject) => {
            const open = indexedDB.open('myfitapp-corps');
            open.onsuccess = () => {
              const tx = open.result.transaction(['weighIns', 'meta'], 'readwrite');
              for (const w of weights) tx.objectStore('weighIns').put(w);
              tx.objectStore('meta').put(178, 'heightCm');
              tx.oncomplete = () => (open.result.close(), resolve());
              tx.onerror = () => reject(tx.error);
            };
          }),
          new Promise<void>((resolve, reject) => {
            const open = indexedDB.open('myfitapp');
            open.onsuccess = () => {
              const tx = open.result.transaction('meta', 'readwrite');
              tx.objectStore('meta').put(activities, 'activities');
              tx.oncomplete = () => (open.result.close(), resolve());
              tx.onerror = () => reject(tx.error);
            };
          }),
        ]),
      {
        weights: ['06-02', '06-16', '06-30', '07-14', '07-28', '08-11', '08-25', '09-08', '09-22', '10-06', '10-20'].map((d, i) => ({ date: `2026-${d}`, weightKg: 80.4 - i * 0.3 })),
        activities: [
          { id: 'act-badminton-2026-10-12', habitId: 'badminton', date: '2026-10-12', name: 'Badminton', start: '21:00', end: '22:30', groups: ['epaules', 'jambes'], status: 'done', answeredAt: 0 },
          { id: 'act-ponctuelle-futsal-2026-10-16', habitId: 'ponctuelle-futsal', date: '2026-10-16', name: 'Futsal', start: '00:00', end: '01:00', groups: ['jambes'], status: 'done', answeredAt: 0, oneOff: true },
        ],
      },
    );
    await page.reload();
    await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();

    /** Écrans et états contrôlés : chaque route de l'appli, et les états dépliés des écrans. */
    const screens: [string, () => Promise<void>][] = [
      ...([
        ['Accueil', './'],
        ['Progrès', './#/progres'],
        ['Plus', './#/plus'],
        ['Bibliothèque', './#/bibliotheque'],
        ['Fiche', './#/exercice/chest-press'],
        ['Modifier un exercice', './#/modifier/chest-press'],
        ['Nouvel exercice', './#/nouvel-exercice'],
        ['Historique', './#/historique'],
        ['Détail de séance', './#/historique/sim-2026-10-19'],
        ['Détail d’une activité', './#/historique/act-badminton-2026-10-12'],
        ['Détail d’une activité ponctuelle', './#/historique/act-ponctuelle-futsal-2026-10-16'],
        ['Bilan', './#/bilan'],
        ['Bilan de la semaine', './#/bilan-periode/semaine/2026-10-12'],
        ['Bilan du mois', './#/bilan-periode/mois/2026-09'],
        ['Par groupe', './#/bilan-groupes/triceps'],
        ['Mon poids', './#/poids'],
        ['Réglages', './#/reglages'],
        ['Données', './#/donnees'],
      ] as const).map(([screen, url]) => [screen, () => page.goto(url).then(() => undefined)] as [string, () => Promise<void>]),
      ['Accueil, activité ponctuelle ouverte', async () => {
        await page.goto('./');
        await page.getByRole('button', { name: '+ Activité' }).click();
        await page.getByRole('form', { name: 'Activité ponctuelle' }).getByRole('button', { name: 'Autre' }).click();
      }],
      ['Mon poids, correction et suppression ouvertes', async () => {
        await page.goto('./#/poids');
        const list = page.getByRole('list', { name: 'Historique des pesées' });
        await list.getByRole('button', { name: 'Corriger' }).nth(2).click();
        await list.getByRole('button', { name: 'Supprimer' }).click();
      }],
      ['Détail de séance, correction et suppression ouvertes', async () => {
        await page.goto('./#/historique/sim-2026-10-19');
        await page.locator('li[data-variant]').first().getByRole('button', { name: 'Corriger' }).click();
        await page.getByRole('button', { name: 'Supprimer la séance' }).click();
      }],
      ['Détail d’une activité, suppression ouverte', async () => {
        await page.goto('./#/historique/act-badminton-2026-10-12');
        await page.getByRole('button', { name: 'Supprimer l’activité' }).click();
      }],
      ['Exercice sans historique, suppression ouverte', async () => {
        await page.goto('./#/modifier/crunch-machine');
        await page.getByRole('button', { name: 'Supprimer l’exercice' }).click();
      }],
      ['Aperçu d’import', async () => {
        await page.goto('./#/donnees');
        await page.getByLabel('Notes de séance ou JSON').fill('Seated row horizontal\n3x8x48kg =\n\nEpaules latéral raise\n3x8x9kgs ++\n\nTapis incliné 20 min');
        await page.getByRole('button', { name: 'Analyser' }).click();
      }],
      ['Bibliothèque, dos', async () => {
        await page.goto('./#/bibliotheque');
        await page.getByRole('group', { name: 'Filtrer par groupe musculaire' }).getByRole('button', { name: 'Dos' }).click();
      }],
      ['Fiche dépliée', async () => {
        await page.goto('./#/exercice/chest-press');
        await page.getByRole('button', { name: 'Agrandir l’illustration' }).click();
        await page.getByRole('button', { name: /^Voir tout/ }).click();
      }],
      ['Réglages dépliés', async () => {
        await page.goto('./#/reglages');
        for (const name of ['Récapitulatif de la semaine', 'Bilans de la semaine et du mois', 'Activités habituelles', 'Machines de cardio']) await openSettingsSection(page, name);
      }],
      // Séance prévue (§5.9) : accueil avec un plan, préparation, ajout, menus ; puis sans plan (écran vide).
      ['Accueil avec une séance prévue', async () => {
        await page.goto('./');
        await setPlan(page, PLAN);
      }],
      ['Séance prévue', () => page.goto('./#/seance-prevue').then(() => undefined)],
      ['Séance prévue, cardio et suppression ouverts', async () => {
        await page.goto('./#/seance-prevue');
        await page.getByRole('main').getByRole('button', { name: '+ Cardio' }).click();
        await page.getByRole('button', { name: 'Supprimer la séance prévue' }).click();
      }],
      ['Séance prévue, menu ouvert', async () => {
        await page.goto('./#/seance-prevue');
        await page.getByRole('button', { name: 'Actions : Pec deck' }).click();
      }],
      ['Séance prévue, menu du cardio ouvert', async () => {
        await page.goto('./#/seance-prevue');
        await page.getByRole('button', { name: /^Actions : cardio Tapis de marche/ }).click();
      }],
      ['Ajout à la séance prévue', () => page.goto('./#/seance-prevue/ajouter').then(() => undefined)],
      ['Séance prévue vide', async () => {
        await page.goto('./#/seance-prevue');
        await setPlan(page, null);
      }],
    ];
    // À 412, 360 et 320 px, puis à 360 px avec le texte agrandi à 115 % : chaque écran, page entière.
    for (const [width, scale] of [[412, 1], [360, 1], [320, 1], [360, 1.15]] as const) {
      await page.setViewportSize({ width, height: 800 });
      for (const [screen, open] of screens) {
        await open();
        await expect(page.locator('main').first()).toBeVisible();
        const restore = scale > 1 ? await largeText(page) : null;
        await toTop(page);
        await page.waitForTimeout(200);
        await expectClean(page, `${screen} à ${width} px${scale > 1 ? ', texte à 115 %' : ''}`, scale);
        await restore?.();
      }
    }
    // Contrôle du contrôle : dans Mon poids, chaque « Corriger » de la liste est bien vérifié (aucun écarté).
    await page.setViewportSize({ width: 412, height: 800 });
    await page.goto('./#/poids');
    await expect(page.getByRole('list', { name: 'Historique des pesées' }).getByRole('button', { name: 'Corriger' })).toHaveCount(11);
    expect((await auditScreen(page)).checked.filter((t) => t.includes('Corriger'))).toHaveLength(11);

    // Séance : carte ouverte, menu ouvert, cardio ; texte agrandi à 115 % à 360 px.
    await page.setViewportSize({ width: 360, height: 800 });
    await startSession(page);
    const card = await addExercise(page, 'chest press', 'Chest press');
    await page.getByRole('button', { name: 'Ajouter du cardio' }).click();
    await page.getByRole('form', { name: 'Cardio' }).getByLabel('Durée (min)').fill('10');
    await page.getByRole('form', { name: 'Cardio' }).getByRole('button', { name: 'Valider', exact: true }).click();
    // Le formulaire de cardio a été amené à l'écran : la page revient en haut (sinon la carte passe sous l'en-tête collant).
    await toTop(page);
    await expectClean(page, 'Séance à 360 px');
    await card.getByRole('button', { name: 'Actions : Chest press' }).click();
    await expectClean(page, 'Séance, menu ouvert');
    await page.keyboard.press('Escape');
    // Panneau d'ajustement, confirmation du retrait, confirmation d'un poids très différent, menu du cardio.
    await cardAction(card, 'Ajuster séries et répétitions');
    await expectClean(page, 'Séance, ajustement ouvert');
    await card.getByRole('button', { name: 'Terminé' }).click();
    await cardAction(card, 'Retirer de la séance');
    await expectClean(page, 'Séance, confirmation du retrait');
    await card.getByRole('button', { name: 'Non' }).click();
    await card.getByLabel('Poids (kg)').fill('500');
    await card.getByLabel('Poids (kg)').press('Tab');
    await expect(card.getByRole('alertdialog', { name: 'Confirmer le poids' })).toBeVisible();
    await expectClean(page, 'Séance, confirmation du poids');
    await card.getByRole('alertdialog', { name: 'Confirmer le poids' }).getByRole('button', { name: 'Corriger' }).click();
    await page.locator('.cardio-item').getByRole('button', { name: /^Actions : / }).click();
    await toTop(page);
    await expectClean(page, 'Séance, menu du cardio');
    await page.keyboard.press('Escape');
    // Exercice au poids du corps (version 1.24.0) : carte ouverte sans champ de poids.
    await addExercise(page, 'crunch au sol', 'Crunch au sol');
    await toTop(page);
    await expectClean(page, 'Séance, exercice au poids du corps');
    // Exercice en secondes (version 1.25.0) : séries « 20 s ».
    await addExercise(page, 'planche', 'Planche');
    await toTop(page);
    await expectClean(page, 'Séance, exercice en secondes');
    const restore = await largeText(page);
    // Le texte agrandi allonge la page : retour en haut.
    await toTop(page);
    await expectClean(page, 'Séance, texte agrandi', 1.15);
    await restore();
    await page.getByRole('link', { name: 'Ajouter un exercice' }).click();
    await expect(page.getByRole('searchbox', { name: 'Rechercher un exercice' })).toBeVisible();
    await expectClean(page, 'Ajout d’un exercice');
    // Fin de séance : récapitulatif.
    await page.getByRole('link', { name: 'Retour à la séance' }).click();
    // La planche, ajoutée en dernier, est ouverte : le chest press est rouvert ; son ressenti ouvre le crunch, puis
    // celui du crunch ouvre la planche.
    await card.locator('.card-header').click();
    await doExercise(card, 3, 'Bien');
    const crunch = page.locator('article[aria-label="Crunch au sol"]');
    await expect(crunch).toHaveClass(/open/);
    await crunch.getByRole('button', { name: 'Valider les 3 séries' }).click();
    await crunch.getByRole('button', { name: 'Bien', exact: true }).click();
    const planche = page.locator('article[aria-label="Planche"]');
    await expect(planche).toHaveClass(/open/);
    await planche.getByRole('button', { name: 'Valider les 3 séries' }).click();
    await planche.getByRole('button', { name: 'Bien', exact: true }).click();
    await page.getByRole('button', { name: 'Terminer la séance' }).click();
    await finishSheet(page).getByRole('button', { name: 'Oui, terminer' }).click();
    await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible();
    await toTop(page);
    await expectClean(page, 'Récapitulatif de fin');
    const larger = await largeText(page);
    await expectClean(page, 'Récapitulatif de fin, texte agrandi', 1.15);
    await larger();
    // Séance prévue démarrée : carte ouverte (« Valider les 3 séries »), cardio prévu ; volet de fin avec les non faits.
    await page.goto('./');
    await setPlan(page, PLAN);
    await page.getByRole('button', { name: 'Démarrer la séance prévue' }).click();
    await expect(page.getByRole('button', { name: 'Valider les 3 séries' })).toBeVisible();
    await expectClean(page, 'Séance prévue démarrée');
    const largerPlan = await largeText(page);
    await expectClean(page, 'Séance prévue démarrée, texte agrandi', 1.15);
    await largerPlan();
    // « Plus tard » (version 1.29.0) : menu d'un exercice non terminé et menu d'un cardio prévu.
    const plannedCard = page.locator('article.exercise-card.open');
    await plannedCard.getByRole('button', { name: /^Actions : / }).click();
    await expect(plannedCard.getByRole('menuitem', { name: 'Plus tard' })).toBeVisible();
    await expectClean(page, 'Séance prévue, menu d’un exercice avec « Plus tard »');
    await page.keyboard.press('Escape');
    const plannedCardio = page.locator('[data-cardio="prevu-tapis"]');
    await plannedCardio.getByRole('button', { name: /^Actions : cardio prévu/ }).click();
    await expect(plannedCardio.getByRole('menuitem', { name: 'Plus tard' })).toBeVisible();
    await expectClean(page, 'Séance prévue, menu d’un cardio prévu');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Terminer la séance' }).click();
    await expect(finishSheet(page).getByTestId('planned-not-done')).toBeVisible();
    await expectClean(page, 'Fin de séance prévue, non faits');
    await finishSheet(page).getByRole('button', { name: 'Oui, terminer' }).click();
    await setPlan(page, null);
    // Séance à la maison (version 1.26.0) : accueil avec « Maison » choisi, séance sans chronomètre, puis son détail
    // avec le lieu.
    await page.goto('./');
    await page.getByRole('group', { name: 'Lieu de la séance libre' }).getByRole('button', { name: 'Maison' }).click();
    await expectClean(page, 'Accueil, séance à la maison choisie');
    await page.getByRole('button', { name: 'Démarrer une séance à la maison' }).click();
    await expect(page.getByTestId('session-place')).toBeVisible();
    // Menu « ⋯ » de l'en-tête et annulation (version 1.27.0) : rien de saisi.
    await page.getByRole('button', { name: 'Actions : Séance' }).click();
    await expectClean(page, 'Séance, menu de l’en-tête');
    await page.getByRole('menuitem', { name: 'Annuler la séance' }).click();
    await expect(page.getByTestId('cancel-loss')).toHaveText('Rien n’a été saisi.');
    await expectClean(page, 'Annuler la séance, rien de saisi');
    await page.getByRole('button', { name: 'Non, continuer' }).click();
    await addExercise(page, 'crunch au sol', 'Crunch au sol');
    await toTop(page);
    await expectClean(page, 'Séance à la maison');
    await page.locator('article[aria-label="Crunch au sol"]').getByRole('button', { name: 'Valider les 3 séries' }).click();
    await page.locator('article[aria-label="Crunch au sol"]').getByRole('button', { name: 'Bien', exact: true }).click();
    // Pompes (version 1.27.0) : 2 séries, « Valider les 2 séries ».
    const pushUps = await addExercise(page, 'pompes', 'Pompes — Classiques');
    await toTop(page);
    await expectClean(page, 'Séance, pompes');
    await pushUps.getByRole('button', { name: 'Valider les 2 séries' }).click();
    await pushUps.getByRole('button', { name: 'Bien', exact: true }).click();
    // Annulation avec saisie : séries perdues annoncées (texte agrandi compris) ; « Non, continuer ».
    await page.getByRole('button', { name: 'Actions : Séance' }).click();
    await page.getByRole('menuitem', { name: 'Annuler la séance' }).click();
    await expect(page.getByTestId('cancel-loss')).toHaveText('5 séries seront perdues.');
    await expectClean(page, 'Annuler la séance, séries perdues');
    const largerCancel = await largeText(page);
    await expectClean(page, 'Annuler la séance, texte agrandi', 1.15);
    await largerCancel();
    await page.getByRole('button', { name: 'Non, continuer' }).click();
    await page.getByRole('button', { name: 'Terminer la séance' }).click();
    await finishSheet(page).getByRole('button', { name: 'Oui, terminer' }).click();
    await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible();
    await expectClean(page, 'Récapitulatif de fin, à la maison');
    const homeSession = (await readSessions(page)).find((x) => x.location === 'maison')!;
    await page.goto(`./#/historique/${homeSession.id}`);
    await expect(page.getByRole('group', { name: 'Lieu de la séance' })).toBeVisible();
    await expectClean(page, 'Détail d’une séance à la maison');
    // Compléter la séance du jour (version 1.28.0) : bouton principal du détail, lien discret de l'accueil, séance
    // rouverte avec ce qui était fait fermé (texte agrandi compris), puis « Annuler les ajouts ».
    await expect(page.getByRole('button', { name: 'Compléter cette séance' })).toBeVisible();
    await page.goto('./');
    const completeLink = page.getByRole('button', { name: /^Compléter la séance de / });
    await expect(completeLink).toBeVisible();
    await expectClean(page, 'Accueil, compléter la séance');
    // Plusieurs séances finies à la même heure (horloge figée) : celle à la maison, depuis son détail.
    await page.goto(`./#/historique/${homeSession.id}`);
    await page.getByRole('button', { name: 'Compléter cette séance' }).click();
    await expect(page.getByTestId('locked').first()).toBeVisible();
    await toTop(page);
    await expectClean(page, 'Séance complétée, déjà fait');
    const largerLocked = await largeText(page);
    await expectClean(page, 'Séance complétée, texte agrandi', 1.15);
    await largerLocked();
    await page.getByRole('button', { name: 'Actions : Séance' }).click();
    await page.getByRole('menuitem', { name: 'Annuler les ajouts' }).click();
    await expect(page.getByTestId('cancel-loss')).toHaveText('Rien n’a été saisi. La séance terminée reste enregistrée.');
    await expectClean(page, 'Annuler les ajouts');
    await page.getByRole('button', { name: 'Oui, annuler les ajouts' }).click();
    await expect.poll(async () => (await readSessions(page)).find((x) => x.id === homeSession.id)?.state).toBe('done');
    // Séance oubliée (ouverte depuis plus de 4 heures) : fenêtre à la réouverture.
    await startSession(page);
    await page.clock.setFixedTime(new Date('2026-10-23T01:00:00'));
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Séance toujours en cours' })).toBeVisible();
    await expectClean(page, 'Séance oubliée');
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
