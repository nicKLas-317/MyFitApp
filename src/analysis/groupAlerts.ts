/**
 * Alerte « groupe moins travaillé » (version 1.38.0, §19.11) : un groupe dont les séries des 2 dernières semaines
 * terminées sont toutes les deux sous sa moyenne. Calcul pur, refait à l'affichage à partir des séances terminées,
 * avec les séries du graphique « Séries par semaine » (§19.10) ; jamais stocké, aucun effet sur le moteur.
 */
import type { MuscleGroup, Exercise, Session } from '../domain/types';
import { GROUP_VIEW_GROUPS, groupWeeklySets, SETS_WEEKS } from './groups';

/** Semaines terminées au total (depuis la semaine de la première séance) avant toute alerte. */
export const ALERT_MIN_FINISHED_WEEKS = 6;
/** Semaines de référence au moins (semaines terminées avant les 2 dernières, où le groupe a été travaillé). */
export const ALERT_MIN_REFERENCE_WEEKS = 4;
/** Semaines comparées à la moyenne : les dernières semaines terminées. */
export const ALERT_RECENT_WEEKS = 2;
/** Alertes affichées au plus. */
export const ALERT_MAX = 3;

export interface GroupAlert {
  group: MuscleGroup;
  /** Lundi de la dernière semaine terminée (« YYYY-MM-DD ») : la clé de « Ignorer ». */
  week: string;
  /** Totaux des 2 dernières semaines terminées (directes + indirectes ÷ 2), la plus ancienne d'abord. */
  recent: number[];
  /** Moyenne des semaines de référence. */
  average: number;
  /** Nombre de semaines de référence. */
  referenceWeeks: number;
}

/**
 * Alerte d'un groupe, ou null. Mêmes semaines que le graphique (lundi – dimanche, depuis la semaine de la première
 * séance, 12 au plus, semaine en cours comprise mais jamais comptée) :
 * - au moins 6 semaines terminées au total, sinon rien ;
 * - les 2 dernières semaines terminées sont comparées à la moyenne des semaines terminées d'avant, de la première
 *   où le groupe a des séries (vacances comprises, comme la moyenne du graphique), 4 au moins ;
 * - alerte si les deux sont strictement sous cette moyenne.
 */
export function groupAlert(sessions: readonly Session[], exercises: readonly Exercise[], group: MuscleGroup, now: number): GroupAlert | null {
  const { weeks } = groupWeeklySets(sessions, exercises, group, now, SETS_WEEKS);
  const finished = weeks.slice(0, -1);
  if (finished.length < ALERT_MIN_FINISHED_WEEKS) return null;
  const recent = finished.slice(-ALERT_RECENT_WEEKS);
  const before = finished.slice(0, -ALERT_RECENT_WEEKS);
  const firstActive = before.findIndex((w) => w.direct + w.indirect > 0);
  if (firstActive < 0) return null;
  const reference = before.slice(firstActive);
  if (reference.length < ALERT_MIN_REFERENCE_WEEKS) return null;
  const average = reference.reduce((a, w) => a + w.total, 0) / reference.length;
  if (!recent.every((w) => w.total < average)) return null;
  return { group, week: recent.at(-1)!.start, recent: recent.map((w) => w.total), average, referenceWeeks: reference.length };
}

/** Alertes ignorées sur l'appareil : groupe → dernière semaine terminée au moment de « Ignorer ». */
export type IgnoredAlerts = Partial<Record<MuscleGroup, string>>;

export function sanitizeIgnoredAlerts(value: unknown): IgnoredAlerts {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: IgnoredAlerts = {};
  for (const [group, week] of Object.entries(value as Record<string, unknown>)) {
    if (GROUP_VIEW_GROUPS.includes(group as MuscleGroup) && typeof week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(week)) out[group as MuscleGroup] = week;
  }
  return out;
}

/**
 * Alertes à afficher : groupes suivis au récapitulatif qui ont un graphique (§19.10), sans celles ignorées pour la
 * même dernière semaine terminée (une nouvelle semaine encore sous la moyenne la fait revenir) ; le plus en retrait
 * d'abord (rapport des 2 semaines à la moyenne), puis l'ordre des groupes ; 3 au plus.
 */
export function groupAlerts(
  sessions: readonly Session[],
  exercises: readonly Exercise[],
  groups: readonly MuscleGroup[],
  now: number,
  ignored: IgnoredAlerts = {},
): GroupAlert[] {
  const shown = GROUP_VIEW_GROUPS.filter((g) => groups.includes(g));
  const ratio = (a: GroupAlert) => a.recent.reduce((s, x) => s + x, 0) / (a.recent.length * a.average);
  return shown
    .map((g) => groupAlert(sessions, exercises, g, now))
    .filter((a): a is GroupAlert => a !== null && ignored[a.group] !== a.week)
    .sort((a, b) => ratio(a) - ratio(b) || shown.indexOf(a.group) - shown.indexOf(b.group))
    .slice(0, ALERT_MAX);
}

/** Ignorer une alerte : jusqu'à la fin de la semaine suivante encore sous la moyenne. */
export function ignoreAlert(ignored: IgnoredAlerts, alert: GroupAlert): IgnoredAlerts {
  return { ...ignored, [alert.group]: alert.week };
}
