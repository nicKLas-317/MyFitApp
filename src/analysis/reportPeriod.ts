/**
 * Périodes des bilans de la semaine et du mois (§19.7) : semaine du lundi 0 h 00 au dimanche, mois calendaire, heure
 * locale ; clés, titres, objet du mail, période ouverte par défaut. Calcul pur (découpé de `report.ts`, version 1.49.3).
 */
import type { Session } from '../domain/types';
import { localDate, sessionStartTime, weekStart } from '../domain/calendar';

export type ReportKind = 'week' | 'month';

/** Période d'un bilan : semaine du lundi 0 h 00 au dimanche, ou mois calendaire, heure locale. */
export interface ReportPeriod {
  kind: ReportKind;
  /** Premier jour, 0 h 00. */
  start: Date;
  /** Premier jour de la période suivante, 0 h 00 (borne exclue). */
  next: Date;
}

function makePeriod(kind: ReportKind, start: Date): ReportPeriod {
  const next = new Date(start);
  if (kind === 'week') next.setDate(next.getDate() + 7);
  else next.setMonth(next.getMonth() + 1);
  return { kind, start, next };
}

/** Période contenant l'instant `ts`. */
export function periodContaining(kind: ReportKind, ts: number): ReportPeriod {
  const d = new Date(ts);
  return makePeriod(kind, kind === 'week' ? weekStart(d) : new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Période décalée de `delta` semaines ou mois. */
export function shiftPeriod(period: ReportPeriod, delta: number): ReportPeriod {
  const start = new Date(period.start);
  if (period.kind === 'week') start.setDate(start.getDate() + 7 * delta);
  else start.setMonth(start.getMonth() + delta, 1);
  return makePeriod(period.kind, start);
}

/** Clé stable et triable : lundi « 2026-10-19 » pour une semaine, « 2026-10 » pour un mois. */
export function periodKey(period: ReportPeriod): string {
  const day = localDate(period.start.getTime());
  return period.kind === 'week' ? day : day.slice(0, 7);
}

export function parsePeriodKey(kind: ReportKind, key: string): ReportPeriod | null {
  const m = kind === 'week' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(key) : /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const start = new Date(Number(m[1]), Number(m[2]) - 1, kind === 'week' ? Number(m[3]) : 1);
  const period = periodContaining(kind, start.getTime());
  return periodKey(period) === key ? period : null;
}

/** Dernier jour de la période. */
export function periodLastDay(period: ReportPeriod): Date {
  const d = new Date(period.next);
  d.setDate(d.getDate() - 1);
  return d;
}

export function containsTime(period: Pick<ReportPeriod, 'start' | 'next'>, ts: number): boolean {
  return ts >= period.start.getTime() && ts < period.next.getTime();
}

const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric' });
const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

/** « du 19 au 25 oct. 2026 », « du 28 sept. au 4 oct. 2026 », « du 29 déc. 2025 au 4 janv. 2026 ». */
function weekRange(period: ReportPeriod): string {
  const { start } = period;
  const end = periodLastDay(period);
  const from =
    start.getFullYear() !== end.getFullYear() ? DAY_MONTH_YEAR.format(start) : start.getMonth() !== end.getMonth() ? DAY_MONTH.format(start) : DAY.format(start);
  return `du ${from} au ${DAY_MONTH_YEAR.format(end)}`;
}

/** « Semaine du 19 au 25 oct. 2026 », « Octobre 2026 ». */
export function periodTitle(period: ReportPeriod): string {
  if (period.kind === 'week') return `Semaine ${weekRange(period)}`;
  const month = MONTH_YEAR.format(period.start);
  return month.charAt(0).toUpperCase() + month.slice(1);
}

/** Objet du mail : « MyFitApp — Bilan semaine du 19 au 25 oct. 2026 », « MyFitApp — Bilan octobre 2026 ». */
export function mailSubject(period: ReportPeriod): string {
  return `MyFitApp — Bilan ${period.kind === 'week' ? `semaine ${weekRange(period)}` : MONTH_YEAR.format(period.start)}`;
}

/** Séance terminée commencée dans la période. */
export const inPeriod = (period: Pick<ReportPeriod, 'start' | 'next'>) => (s: Session) => s.state === 'done' && containsTime(period, sessionStartTime(s));

/** Période ouverte par défaut : la période en cours si elle contient une séance, sinon la précédente. */
export function defaultPeriod(kind: ReportKind, sessions: readonly Session[], now: number): ReportPeriod {
  const current = periodContaining(kind, now);
  return sessions.some(inPeriod(current)) ? current : shiftPeriod(current, -1);
}

/** Première période contenant une séance terminée : on ne remonte pas plus loin. */
export function firstPeriod(kind: ReportKind, sessions: readonly Session[]): ReportPeriod | null {
  const times = sessions.filter((s) => s.state === 'done').map(sessionStartTime);
  return times.length > 0 ? periodContaining(kind, Math.min(...times)) : null;
}
