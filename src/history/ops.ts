/**
 * Historique des séances (§10) : recherche et corrections d'une séance passée.
 * Fonctions pures ; toute correction déclenche le recalcul du profil par rejeu (§7.9),
 * puisque le profil est toujours dérivé de l'historique.
 */
import type { Feeling, Performance, Session } from '../domain/types';
import { sortSessions, validatePerformance, type PerformanceError } from '../engine';
import { isIsoDate } from '../session/format';
import { normalizeName } from '../library/text';

/**
 * Séances terminées, de la plus récente à la plus ancienne, filtrées par nom (§10) : le nom affiché (`titleOf`,
 * version 1.32.0) et le nom enregistré, qui garde la date d'une séance non renommée.
 */
export function searchSessions(sessions: readonly Session[], query: string, titleOf?: (s: Session) => string): Session[] {
  const q = normalizeName(query);
  const done = sortSessions(sessions.filter((s) => s.state === 'done')).reverse();
  if (!q) return done;
  const words = q.split(' ');
  return done.filter((s) => {
    const name = normalizeName(titleOf ? `${titleOf(s)} ${s.name}` : s.name);
    return words.every((w) => name.includes(w));
  });
}

export interface PerformancePatch {
  weightKg?: number;
  targetReps?: number;
  plannedSets?: number;
  reps?: number[];
  feeling?: Feeling;
}

export type CorrectionError = PerformanceError | 'not_found' | 'no_sets';

/**
 * Corrige la performance d'un exercice dans une séance passée. La performance corrigée doit rester
 * cohérente (poids positif, répétitions sans dépasser la cible…) ; sinon la séance est renvoyée inchangée
 * avec les erreurs. Une correction rend la performance complète (plus d'historique partiel). Un exercice au poids du
 * corps (`bodyweight`) garde une charge nulle.
 */
export function correctPerformance(
  session: Session,
  variantId: string,
  patch: PerformancePatch,
  now: number,
  bodyweight = false,
): { session: Session; errors: CorrectionError[] } {
  const current = session.performances.find((p) => p.variantId === variantId);
  if (!current) return { session, errors: ['not_found'] };
  const next: Performance = { ...current, ...patch };
  if (patch.reps || patch.targetReps !== undefined || patch.plannedSets !== undefined) delete next.partial;
  // Un ressenti choisi à la main remplace le symbole d'origine importé, qui ne correspond plus.
  if (patch.feeling !== undefined && patch.feeling !== current.feeling) delete next.feelingSymbol;
  const errors: CorrectionError[] = [...validatePerformance(next, bodyweight)];
  if (!next.partial && next.reps.length === 0) errors.push('no_sets');
  if (errors.length > 0) return { session, errors };
  return {
    session: { ...session, performances: session.performances.map((p) => (p.variantId === variantId ? next : p)), updatedAt: now },
    errors: [],
  };
}

/** Retire un exercice d'une séance passée (après confirmation dans l'interface). */
export function removePastPerformance(session: Session, variantId: string, now: number): Session {
  const performances = session.performances.filter((p) => p.variantId !== variantId);
  return performances.length === session.performances.length ? session : { ...session, performances, updatedAt: now };
}

/** Change la date d'une séance passée : elle est rejouée à sa nouvelle place chronologique (§7.9). */
export function setSessionDate(session: Session, date: string, now: number): Session {
  if (!isIsoDate(date)) throw new Error('Date invalide');
  if (date === session.date) return session;
  // L'heure de début connue appartient à l'ancienne date : elle est conservée telle quelle.
  return { ...session, date, updatedAt: now };
}

/**
 * Change le lieu d'une séance passée (version 1.26.0) : à la maison ou à la salle (champ retiré). Ses exercices à
 * charge passent d'un suivi à l'autre : les deux suivis sont recalculés au rejeu (§7.9).
 */
export function setSessionLocation(session: Session, home: boolean, now: number): Session {
  if ((session.location === 'maison') === home) return session;
  const { location: _previous, ...rest } = session;
  return home ? { ...rest, location: 'maison', updatedAt: now } : { ...rest, updatedAt: now };
}

/** Nombre total de répétitions réalisées dans une séance. */
export function totalReps(session: Session): number {
  return session.performances.reduce((n, p) => n + p.reps.reduce((a, b) => a + b, 0), 0);
}
