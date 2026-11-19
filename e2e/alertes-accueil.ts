/**
 * Outils des tests de l'accueil avec alertes (versions 1.51.0 à 1.53.0), communs au test 291 (alerte « groupe moins
 * travaillé ») et au test 323 (alerte « articulation trop sollicitée »).
 */
import { expect, type Page } from '@playwright/test';
import { ALERT_NOW, alertHistory, type AlertScenario } from '../src/analysis/__tests__/alertes-simulation';
import type { Session, SessionPlan } from '../src/domain/types';
import { defaultSessionName } from '../src/session/format';
import { reloadAfterWrites, writeSessions } from './helpers';

/** Taille de police Android agrandie (simulation) : tout le texte à 115 %. */
export async function largeText(page: Page): Promise<() => Promise<void>> {
  const style = await page.addStyleTag({ content: ':root { font-size: calc(17px * 1.15) !important; }' });
  return () => style.evaluate((el) => (el as Element).remove());
}

/**
 * Données simulées, l'horloge au `now` donné ; bilans de la semaine et du mois déjà ouverts (seule l'alerte compte),
 * aucune alerte ignorée.
 */
export async function open(page: Page, scenario: AlertScenario = {}, now = ALERT_NOW, transform: (s: Session[]) => Session[] = (s) => s): Promise<void> {
  await openSessions(page, transform(alertHistory(scenario)), now);
}

/** Les séances données, l'horloge au `now` donné ; bilans déjà ouverts, aucune alerte ignorée (version 1.53.0). */
export async function openSessions(page: Page, sessions: Session[], now: number): Promise<void> {
  await page.clock.setFixedTime(new Date(now));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'MyFitApp' })).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onsuccess = () => {
          const tx = open.result.transaction(['sessions', 'meta'], 'readwrite');
          tx.objectStore('sessions').clear();
          tx.objectStore('meta').put({ week: '2026-11-09', month: '2026-11' }, 'reportsSeen');
          tx.objectStore('meta').delete('groupAlertsIgnored');
          tx.objectStore('meta').delete('jointAlertsIgnored');
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await writeSessions(page, sessions);
  await reloadAfterWrites(page);
  await expect(page.getByTestId('weekly-recap')).toBeVisible();
}

/**
 * Trois groupes en alerte aux noms les plus longs (version 1.52.1) : à partir du 26 oct., plus de pec deck, d'élévations
 * latérales, d'extension triceps ni de développé épaules : épaules 1,5 et 1,5, triceps 1,5 et 1,5, pectoraux 3 et 3 ; le
 * dos à 6 (sans baisse).
 */
export const THREE_DOWN = (sessions: Session[]) =>
  sessions.map((s) =>
    s.date >= '2026-10-26'
      ? { ...s, performances: s.performances.filter((p) => !['pec-deck', 'elevations-laterales', 'extension-triceps-poulie', 'developpe-epaules-machine'].includes(p.variantId)) }
      : s,
  );
export const THREE_TEXT = 'Épaules, Triceps, Pectoraux : sous 6 séries ces 2 semaines';

export const alerts = (page: Page) => page.getByTestId('group-alerts');

/**
 * Géométrie de l'accueil : hauteurs et écarts des éléments tactiles, débordement, alerte juste sous le récapitulatif,
 * « Démarrer » (ou « Démarrer la séance prévue ») entièrement au-dessus de la barre
 * d'onglets, sans défiler.
 */
export function layout(page: Page) {
  return page.evaluate(() => {
    window.scrollTo(0, 0);
    const taps = [...document.querySelectorAll('main a, main button')].filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getBoundingClientRect());
    let closest = Infinity;
    for (let i = 0; i < taps.length; i++)
      for (let j = i + 1; j < taps.length; j++) {
        const a = taps[i]!;
        const b = taps[j]!;
        const dx = Math.max(0, b.left - a.right, a.left - b.right);
        const dy = Math.max(0, b.top - a.bottom, a.top - b.bottom);
        closest = Math.min(closest, Math.max(dx, dy));
      }
    const recap = document.querySelector('[data-testid="weekly-recap"]')!;
    const list = document.querySelector('[data-testid="group-alerts"]');
    const start = [...document.querySelectorAll('main button')].find((b) => b.textContent?.startsWith('Démarrer'))!;
    const nav = document.querySelector('nav')!.getBoundingClientRect();
    return {
      minHeight: Math.min(...taps.map((r) => r.height)),
      closest,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      afterRecap: !list || recap.nextElementSibling === list,
      startVisible: start.getBoundingClientRect().bottom <= nav.top,
      /** De combien « Démarrer » dépasse sous la barre d'onglets (négatif : marge restante), pour le message d'échec. */
      startExcess: Math.round(start.getBoundingClientRect().bottom - nav.top),
      fontSize: list ? getComputedStyle(list.querySelector('li') ?? list).fontSize : null,
    };
  });
}

/** Tailles contrôlées : largeur, hauteur de l'écran, texte agrandi. */
// 320 px : un écran de 360 × 800 avec la taille d’affichage agrandie d’Android (× 1,125) donne 320 × 711.
export const SIZES = [[412, 915, false], [360, 800, false], [320, 711, false], [360, 800, true]] as const;

/**
 * Cas le plus chargé de l'accueil (version 1.40.0), mercredi 11 nov. 12 h : question du badminton de lundi, 7 groupes au
 * récapitulatif, un bandeau d'alerte qui cite trois groupes (version 1.52.1 : épaules, triceps et pectoraux, les noms
 * les plus longs ; versions 1.40.0 à 1.50.1, une ligne de résumé pour 3 groupes), séance du matin à compléter, séance pour compléter la
 * semaine, rappel de sauvegarde ; avec ou sans séance prévue. Version 1.45.0 : la séance du matin a quatre exercices de
 * jambes (12 séries : un nombre à deux chiffres dans la case, « Jambes (12 séries) · aujourd’hui »). `cardio` (version
 * 1.41.0) : 50 min de tapis en plus dans la séance du matin, « Jambes (15 séries · +50 min cardio) · aujourd’hui » et
 * « · 50 min de cardio » dans l'en-tête.
 */
export async function openLoaded(page: Page, withPlan: boolean, cardio = false, history?: Session[]): Promise<void> {
  // Version 1.52.1 : trois groupes en alerte dans le bandeau, aux noms les plus longs. Version 1.53.0 : `history`, une
  // autre histoire (alerte « articulation trop sollicitée »).
  await openSessions(page, history ?? THREE_DOWN(alertHistory({ dosDown: [] })), ALERT_NOW);
  const t = new Date(2026, 10, 11, 8).getTime();
  const morning: Session = {
    id: 'matin-11', name: defaultSessionName(t), date: '2026-11-11', startedAt: t, endedAt: t + 3_600_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: ['presse-a-cuisses', 'leg-extension', 'leg-curl', 'adducteurs-machine'].map((variantId) => (
      { variantId, weightKg: 60, targetReps: 10, plannedSets: 3, reps: [10, 10, 10], feeling: 'bien' as const }
    )),
    ...(cardio ? { cardio: [{ id: 'matin-11-tapis', machineId: 'tapis', machine: 'Tapis de marche', incline: 'neutre' as const, minutes: 50 }] } : {}),
  };
  const plan: SessionPlan | null = withPlan
    ? { id: 'plan-charge', createdAt: t, updatedAt: t, items: [{ kind: 'exercise', variantId: 'chest-press' }, { kind: 'exercise', variantId: 'pec-deck' }, { kind: 'exercise', variantId: 'tirage-vertical' }] }
    : null;
  await writeSessions(page, [morning]);
  await page.evaluate(
    (plan) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onsuccess = () => {
          const tx = open.result.transaction('meta', 'readwrite');
          const meta = tx.objectStore('meta');
          meta.put({ groups: ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux'], redSets: 10 }, 'weeklyRecap');
          for (const key of ['activities', 'lastExportAt', 'plan']) meta.delete(key);
          if (plan) meta.put(plan, 'plan');
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    plan,
  );
  await reloadAfterWrites(page);
  await expect(page.getByTestId('weekly-recap')).toBeVisible();
}

