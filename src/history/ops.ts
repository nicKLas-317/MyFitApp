/**
 * Historique des séances (§10) : recherche et corrections d'une séance passée.
 * Fonctions pures ; toute correction déclenche le recalcul du profil par rejeu (§7.9),
 * puisque le profil est toujours dérivé de l'historique.
 */
import type { Feeling, Performance, Session } from '../domain/types';
import { compareSessions, sortSessions, validatePerformance, type PerformanceError } from '../engine';
import { isIsoDate, localDate } from '../session/format';
import { isDefaultSessionName, storedDefaultName } from '../session/title';
import { parseIsoDay } from '../domain/calendar';
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

/** Le même moment de la journée (heure locale), `days` jours plus tard ou plus tôt, changements d'heure compris. */
function sameTimeShifted(ts: number, days: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()).getTime();
}

/**
 * Change la date d'une séance passée : elle est rejouée à sa nouvelle place chronologique (§7.9). Depuis la version
 * 1.41.4, le début et la fin passent au nouveau jour, à la même heure : le récapitulatif, les bilans et les séries par
 * semaine la comptent dans sa nouvelle semaine, comme le moteur. Une séance sans heure reste sans heure. Une séance non
 * renommée reçoit le nom par défaut de sa nouvelle date (la recherche par date la trouve, §5.14).
 */
export function setSessionDate(session: Session, date: string, now: number): Session {
  if (!isIsoDate(date)) throw new Error('Date invalide');
  if (date === session.date) return session;
  // Écart en jours civils entre le jour du début (la date pour une séance sans heure) et la nouvelle date.
  const from = session.startedAt !== null ? localDate(session.startedAt) : session.date;
  const days = Math.round((parseIsoDay(date, 0, 12).getTime() - parseIsoDay(from, 0, 12).getTime()) / 86_400_000);
  const moved: Session = {
    ...session,
    date,
    startedAt: session.startedAt === null ? null : sameTimeShifted(session.startedAt, days),
    endedAt: session.endedAt === null ? null : sameTimeShifted(session.endedAt, days),
    updatedAt: now,
  };
  return isDefaultSessionName(session.name) ? { ...moved, name: storedDefaultName(moved) } : moved;
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

/** Élément de l'historique (§10) : une séance, ou une activité rangée à son heure de début. */
export type HistoryKey = { date: string; session: Session } | { date: string; time: number };

/** Dernier instant d'une journée « AAAA-MM-JJ », heure locale. */
const endOfDay = (date: string) => parseIsoDay(date, 1).getTime() - 1;

/**
 * Ordre chronologique de l'historique (version 1.41.2), du plus ancien au plus récent : par date, puis, entre deux
 * séances du même jour, l'ordre du moteur (§7.9 : une séance sans heure passe après celles dont l'heure est connue) ;
 * une activité se range à son heure de début, une séance sans heure en fin de journée. L'historique, la « Dernière
 * fois » de la fiche et les exercices récents suivent ainsi le même ordre.
 */
export function compareHistory(a: HistoryKey, b: HistoryKey): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if ('session' in a && 'session' in b) return compareSessions(a.session, b.session);
  const time = (k: HistoryKey) => ('session' in k ? (k.session.startedAt ?? endOfDay(k.date)) : k.time);
  return time(a) - time(b);
}
