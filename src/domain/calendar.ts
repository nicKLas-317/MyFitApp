/**
 * Calendrier (version 1.41.3) : jours, semaines et moments de la journée, en heure locale de l'appareil (Paris, §1).
 * Une seule définition pour tout le code : semaine du lundi 0 h 00 au dimanche, date « AAAA-MM-JJ » lue en heure
 * locale, début d'une séance. Aucune dépendance hors des types.
 */
import type { Session } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Date locale de l'appareil au format « AAAA-MM-JJ ». */
export function localDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Jour « AAAA-MM-JJ » en heure locale, décalé de `delta` jours, à l'heure `hour` (0 h par défaut ; midi pour ignorer
 * les changements d'heure). Une date illisible donne le 1er janvier 1970.
 */
export function parseIsoDay(date: string, delta = 0, hour = 0): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + delta, hour);
}

/** Jour civil décalé de `delta` jours (« AAAA-MM-JJ »). */
export function shiftIsoDay(date: string, delta: number): string {
  return localDate(parseIsoDay(date, delta, 12).getTime());
}

/** Lundi 0 h 00 de la semaine (heure locale) contenant `date`. */
export function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7; // lundi = 0 … dimanche = 6
  d.setDate(d.getDate() - offset);
  return d;
}

/** Semaine contenant `ts` : lundi 0 h 00 et lundi suivant 0 h 00 (borne exclue). */
export function weekBounds(ts: number): { start: Date; next: Date } {
  const start = weekStart(new Date(ts));
  return { start, next: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) };
}

/** Début de la séance : heure de début si connue, sinon minuit (heure locale) de sa date. */
export function sessionStartTime(session: Pick<Session, 'startedAt' | 'date'>): number {
  return session.startedAt ?? parseIsoDay(session.date).getTime();
}

/** Moment de la journée d'une heure (en minutes depuis minuit) : avant midi, avant 18 h, ensuite. */
export function dayPart(minutes: number): 'matin' | 'après-midi' | 'soir' {
  return minutes < 12 * 60 ? 'matin' : minutes < 18 * 60 ? 'après-midi' : 'soir';
}
