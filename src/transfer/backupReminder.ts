/** Rappel de sauvegarde (§12) (version 1.55.1 : découpé de backup.ts, sans changement de comportement). */
import type { Session } from '../domain/types';
import type { PersistState } from '../storage/db';

const DAY = 24 * 60 * 60 * 1000;
/** Délai au-delà duquel l'accueil rappelle d'exporter (§12). */
export const BACKUP_REMINDER_MS = 14 * DAY;
/**
 * Délai quand le navigateur n'a pas accordé le stockage persistant (version 1.56.0) : il peut effacer les données en
 * cas de manque de place, la sauvegarde est la seule protection.
 */
export const UNPROTECTED_REMINDER_MS = 7 * DAY;

/** Délai du rappel selon l'état du stockage : 14 jours s'il est accordé (ou pas encore connu), 7 jours sinon. */
export function backupReminderDelay(persist: PersistState | null): number {
  return persist === null || persist === 'granted' ? BACKUP_REMINDER_MS : UNPROTECTED_REMINDER_MS;
}

/**
 * Rappel de sauvegarde (§12) : plus de 14 jours sans export (7 jours si le stockage n'est pas protégé, version
 * 1.56.0) (ou depuis la première séance si aucun export n'a jamais été fait) et des séances terminées enregistrées
 * depuis.
 */
export function needsBackupReminder(sessions: readonly Session[], lastExportAt: number | null, now: number, delay = BACKUP_REMINDER_MS): boolean {
  const done = sessions.filter((s) => s.state === 'done');
  if (done.length === 0) return false;
  const since = lastExportAt ?? Math.min(...done.map((s) => s.createdAt));
  if (now - since < delay) return false;
  return lastExportAt === null || done.some((s) => s.updatedAt > lastExportAt);
}
