/**
 * Alerte « groupe moins travaillé » (§19.11). Version 1.51.0 : un groupe est en alerte quand son score de la semaine
 * (celui du récapitulatif, en séries : directes, indirectes ½, maison, activités, cardio des jambes) est sous le seuil
 * (6 séries par défaut, réglable de 3 à 9) sur chacune des 2 dernières semaines terminées ; un seul bandeau, qui cite
 * tous les groupes en alerte du plus bas au plus haut (version 1.52.1 ; 1.51.0 : le plus bas seulement). Avant (versions 1.38.0 à 1.50.1) : les 2 semaines sous la moyenne des semaines d'avant, avec
 * les séries du graphique. Calcul pur, refait à l'affichage à partir des séances terminées ; jamais stocké, aucun effet
 * sur le moteur.
 */
import type { ActivityRecord } from '../activities/model';
import { localDate, sessionStartTime } from '../domain/calendar';
import type { CardioMachine, Exercise, MuscleGroup, Session } from '../domain/types';
import { MUSCLE_GROUP_LABELS } from '../library/seed';
import { formatDecimal } from '../session/format';
import { GROUP_VIEW_GROUPS, SETS_ONLY_GROUPS } from './groups';
import { periodContaining, shiftPeriod } from './reportPeriod';
import { groupScore, groupSeries, LEG_CARDIO_GROUP, legCardioWeek } from './weekly';

/** Semaines regardées : les dernières semaines terminées. */
export const ALERT_RECENT_WEEKS = 2;

export interface AlertInput {
  sessions: readonly Session[];
  exercises: readonly Exercise[];
  activities?: readonly ActivityRecord[];
  machines?: readonly CardioMachine[];
  /** Groupes du récapitulatif (§19.6) : ceux qui peuvent être en alerte, et ceux qui reçoivent les sous-groupes. */
  groups: readonly MuscleGroup[];
  /** Seuil, en séries : alerte quand chacune des 2 semaines est strictement en dessous. */
  threshold: number;
  now: number;
}

export interface GroupAlert {
  group: MuscleGroup;
  /** Lundi de la dernière semaine terminée (« YYYY-MM-DD ») : la clé de « Ignorer ». */
  week: string;
  /** Scores des 2 dernières semaines terminées (séries, comme le récapitulatif), la plus ancienne d'abord. */
  recent: number[];
  /** Seuil en vigueur. */
  threshold: number;
}

/**
 * Groupes concernés : ceux du récapitulatif qui ont un graphique « Séries par semaine » (§19.10 : l'alerte y mène),
 * jamais les abdominaux.
 */
export function alertGroups(groups: readonly MuscleGroup[]): MuscleGroup[] {
  return GROUP_VIEW_GROUPS.filter((g) => groups.includes(g) && !SETS_ONLY_GROUPS.includes(g));
}

/**
 * Tous les groupes en alerte, du plus bas au plus haut : somme des 2 semaines, puis la dernière semaine, puis l'ordre
 * des groupes. Rien tant qu'il n'y a pas 2 semaines terminées depuis la semaine de la première séance terminée ; la
 * semaine en cours n'entre jamais dans le calcul (l'alerte change le lundi à 0 h 00).
 */
export function groupAlertCandidates(input: AlertInput): GroupAlert[] {
  const done = input.sessions.filter((s) => s.state === 'done');
  if (done.length === 0) return [];
  const first = Math.min(...done.map(sessionStartTime));
  const current = periodContaining('week', input.now);
  const weeks = Array.from({ length: ALERT_RECENT_WEEKS }, (_, i) => shiftPeriod(current, i - ALERT_RECENT_WEEKS));
  if (weeks[0]!.start.getTime() < periodContaining('week', first).start.getTime()) return [];
  const scores = weeks.map((w) => {
    const inWeek = (t: number) => t >= w.start.getTime() && t < w.next.getTime();
    const series = groupSeries(done, input.exercises, input.groups, inWeek, input.activities ?? []);
    const legCardio = legCardioWeek(done, input.machines ?? [], inWeek);
    return (g: MuscleGroup) =>
      groupScore({ sets: series.sets.get(g) ?? 0, activities: series.activities.get(g)?.length ?? 0, cardioWeeks: g === LEG_CARDIO_GROUP && legCardio > 0 ? 1 : 0 });
  });
  const week = localDate(weeks.at(-1)!.start.getTime());
  const order = alertGroups(input.groups);
  const sum = (a: GroupAlert) => a.recent.reduce((s, x) => s + x, 0);
  return order
    .map((group) => ({ group, week, recent: scores.map((score) => score(group)), threshold: input.threshold }))
    .filter((a) => a.recent.every((x) => x < input.threshold))
    .sort((a, b) => sum(a) - sum(b) || a.recent.at(-1)! - b.recent.at(-1)! || order.indexOf(a.group) - order.indexOf(b.group));
}

/** Alerte d'un groupe, ou null. */
export function groupAlert(input: AlertInput, group: MuscleGroup): GroupAlert | null {
  return groupAlertCandidates(input).find((a) => a.group === group) ?? null;
}

/**
 * Chiffres de l'alerte, après le nom du groupe : « 4 et 2 séries ces 2 semaines (sous 6) », la plus ancienne semaine
 * d'abord. Court pour tenir sur 2 lignes à 320 px à côté de « Ignorer » (« Démarrer » à l'écran sans défiler, §3.7).
 * Une décimale au plus ; « série » au singulier quand les deux sont sous 2. Espaces insécables : ni « : » ni unité en
 * début de ligne, « (sous 6) » d'un bloc.
 */
export function alertFigures(alert: GroupAlert): string {
  const shown = alert.recent.map(formatDecimal);
  const word = alert.recent.every((x) => Number(formatDecimal(x).replace(',', '.')) < 2) ? 'série' : 'séries';
  return `${shown.join(' et ')} ${word} ces ${ALERT_RECENT_WEEKS} semaines (sous ${alert.threshold})`;
}

/**
 * Texte du bandeau (version 1.52.1), en deux parties : les noms (en gras) et le reste. Un groupe : « Dos » et « 0 et 6
 * séries ces 2 semaines (sous 7) » ; plusieurs, du plus bas au plus haut : « Dos, Pectoraux » et « sous 7 séries ces 2
 * semaines ».
 */
export function alertBanner(alerts: readonly GroupAlert[]): { names: string; rest: string } {
  const names = alerts.map((a) => MUSCLE_GROUP_LABELS[a.group]).join(', ');
  if (alerts.length === 1) return { names, rest: alertFigures(alerts[0]!) };
  return { names, rest: `sous ${alerts[0]!.threshold} séries ces ${ALERT_RECENT_WEEKS} semaines` };
}

/**
 * Ligne du bilan de la semaine (version 1.52.1), en texte simple : le texte du bandeau, et pour plusieurs groupes les
 * séries de chacun : « Dos, Pectoraux : sous 7 séries ces 2 semaines (Dos 0 et 6, Pectoraux 3 et 4) ».
 */
export function alertReportText(alerts: readonly GroupAlert[]): string {
  const { names, rest } = alertBanner(alerts);
  const detail = alerts.length > 1 ? ` (${alerts.map((a) => `${MUSCLE_GROUP_LABELS[a.group]} ${a.recent.map(formatDecimal).join(' et ')}`).join(', ')})` : '';
  return `${names} : ${rest}${detail}`.replace(/ /g, ' ');
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
 * Groupes cités par le bandeau (version 1.52.1 : tous, dans un seul bandeau ; 1.51.0 : le plus bas seulement), du plus
 * bas au plus haut, sans ceux ignorés pour la même dernière semaine terminée (une nouvelle semaine encore sous le seuil
 * fait revenir l'alerte du groupe).
 */
export function groupAlerts(input: AlertInput, ignored: IgnoredAlerts = {}): GroupAlert[] {
  return groupAlertCandidates(input).filter((a) => ignored[a.group] !== a.week);
}

/**
 * Ignorer (la croix) : chaque groupe cité est masqué tant que la dernière semaine terminée reste celle-ci, c'est-à-dire
 * jusqu'au lundi 0 h 00 suivant ; il revient si la nouvelle semaine terminée est encore sous le seuil avec la précédente.
 */
export function ignoreAlerts(ignored: IgnoredAlerts, alerts: readonly GroupAlert[]): IgnoredAlerts {
  const next = { ...ignored };
  for (const a of alerts) next[a.group] = a.week;
  return next;
}

/** Un seul groupe (tests, compatibilité). */
export function ignoreAlert(ignored: IgnoredAlerts, alert: GroupAlert): IgnoredAlerts {
  return ignoreAlerts(ignored, [alert]);
}
