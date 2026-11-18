/**
 * Export « coach » (§19.13) : la semaine exportée (dernière semaine terminée), son libellé, le nom du fichier, le titre
 * du partage, la semaine déjà envoyée (version 1.50.1 : découpé de coach.ts, sans changement de comportement).
 */
import { sessionStartTime, weekStart } from '../domain/calendar';
import type { Session } from '../domain/types';
import { parsePeriodKey, periodContaining, periodKey, periodLastDay, periodTitle, shiftPeriod, type ReportPeriod } from './reportPeriod';

/** Dernière semaine terminée (lundi 0 h 00 – dimanche) : exporté le lundi 16 novembre, du 9 au 15. */
export function coachWeek(now: number): ReportPeriod {
  return shiftPeriod(periodContaining('week', now), -1);
}

const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric' });
const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
export const DAY_MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** Libellé du bouton : « Semaine du 9 au 15 nov. », « du 26 oct. au 1 nov. », l'année seulement à cheval sur deux ans. */
export function coachWeekLabel(period: ReportPeriod): string {
  const start = period.start;
  const end = periodLastDay(period);
  if (start.getFullYear() !== end.getFullYear()) return `Semaine du ${DAY_MONTH_YEAR.format(start)} au ${DAY_MONTH_YEAR.format(end)}`;
  return `Semaine du ${start.getMonth() !== end.getMonth() ? DAY_MONTH.format(start) : DAY.format(start)} au ${DAY_MONTH.format(end)}`;
}

/**
 * « myfitapp-coach-2026-11-09.txt » : date du lundi de la semaine exportée. En .txt (version 1.47.1) : Chrome sur
 * Android refuse de partager un fichier .json (il le télécharge) ; le contenu reste du JSON lisible.
 */
export function coachFileName(period: ReportPeriod): string {
  return `myfitapp-coach-${periodKey(period)}.txt`;
}

/** Titre du partage : « MyFitApp — données pour le coach, semaine du 9 au 15 nov. 2026 ». */
export function coachShareTitle(period: ReportPeriod): string {
  const title = periodTitle(period);
  return `MyFitApp — données pour le coach, ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
}

/**
 * Semaine déjà envoyée au coach (version 1.47.0), mémorisée sur l'appareil seulement (méta `coachSent`) : clé du lundi
 * (« 2026-11-09 »), ou null. Une valeur invalide est ignorée.
 */
export function sanitizeCoachSent(value: unknown): string | null {
  return typeof value === 'string' && parsePeriodKey('week', value) !== null ? value : null;
}

/** Le bouton n'est proposé que si une séance a été terminée avant la semaine en cours (sinon rien à exporter). */
export function hasCoachWeek(sessions: readonly Session[], now: number): boolean {
  const current = weekStart(new Date(now)).getTime();
  return sessions.some((s) => s.state === 'done' && sessionStartTime(s) < current);
}
