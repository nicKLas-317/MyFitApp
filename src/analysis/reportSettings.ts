/**
 * Réglages des bilans (§14, §19.7) et bilans à signaler : bandeaux, adresse e-mail, rappel de l’export coach, bilans
 * déjà ouverts. Calcul pur (découpé de `report.ts`, version 1.49.3).
 */
import type { Session } from '../domain/types';
import { inPeriod, parsePeriodKey, periodContaining, periodKey, shiftPeriod, type ReportKind, type ReportPeriod } from './reportPeriod';

/** Réglages des bilans (§14), inclus dans l'export. */
export interface ReportSettings {
  /** Bandeau « Ton bilan de la semaine est prêt » sur l'accueil. */
  weekBanner: boolean;
  monthBanner: boolean;
  /** Adresse préremplie dans le lien mailto, facultative. */
  email: string;
  /**
   * Rappel de l'export pour le coach (version 1.47.0, §19.13) : bouton « Partager pour le coach » dans le bandeau du
   * bilan de la semaine. Coché par défaut ; absent d'une sauvegarde antérieure : coché.
   */
  coachReminder: boolean;
}

export const DEFAULT_REPORT_SETTINGS: ReportSettings = { weekBanner: true, monthBanner: true, email: '', coachReminder: true };

export function isValidEmail(email: string): boolean {
  return email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function sanitizeReportSettings(value: unknown): ReportSettings {
  if (typeof value !== 'object' || value === null) return DEFAULT_REPORT_SETTINGS;
  const v = value as Record<string, unknown>;
  const email = typeof v.email === 'string' && isValidEmail(v.email.trim()) ? v.email.trim() : '';
  return {
    weekBanner: typeof v.weekBanner === 'boolean' ? v.weekBanner : true,
    monthBanner: typeof v.monthBanner === 'boolean' ? v.monthBanner : true,
    email,
    coachReminder: typeof v.coachReminder === 'boolean' ? v.coachReminder : true,
  };
}

/** Dernière période terminée déjà ouverte, par type de bilan (clés de `periodKey`). */
export type ReportSeen = Partial<Record<ReportKind, string>>;

export function sanitizeReportSeen(value: unknown): ReportSeen {
  if (typeof value !== 'object' || value === null) return {};
  const v = value as Record<string, unknown>;
  const seen: ReportSeen = {};
  if (typeof v.week === 'string' && parsePeriodKey('week', v.week)) seen.week = v.week;
  if (typeof v.month === 'string' && parsePeriodKey('month', v.month)) seen.month = v.month;
  return seen;
}

/**
 * Bilans à signaler sur l'accueil : la semaine écoulée à partir du lundi, le mois écoulé à partir du 1er,
 * s'ils contiennent au moins une séance, que leur bandeau est activé et qu'ils n'ont pas encore été ouverts.
 */
export function pendingReports(sessions: readonly Session[], now: number, settings: ReportSettings, seen: ReportSeen): ReportPeriod[] {
  const out: ReportPeriod[] = [];
  for (const kind of ['week', 'month'] as const) {
    if (!(kind === 'week' ? settings.weekBanner : settings.monthBanner)) continue;
    const period = shiftPeriod(periodContaining(kind, now), -1);
    const key = periodKey(period);
    const last = seen[kind];
    if (last !== undefined && last >= key) continue;
    if (sessions.some(inPeriod(period))) out.push(period);
  }
  return out;
}

/** Bilan ouvert : une période terminée ne sera plus signalée ; une période en cours ne compte pas. */
export function markSeen(seen: ReportSeen, period: ReportPeriod, now: number): ReportSeen {
  if (now < period.next.getTime()) return seen;
  const key = periodKey(period);
  const last = seen[period.kind];
  return last !== undefined && last >= key ? seen : { ...seen, [period.kind]: key };
}
