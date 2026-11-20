/** Rappel de sauvegarde (§12) (version 1.55.1 : découpé de backup.ts, sans changement de comportement). */
import type { Session } from '../domain/types';

/** Délai au-delà duquel l'accueil rappelle d'exporter (§12). */
export const BACKUP_REMINDER_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Rappel de sauvegarde (§12) : plus de 14 jours sans export (ou depuis la première séance
 * si aucun export n'a jamais été fait) et des séances terminées enregistrées depuis.
 */
export function needsBackupReminder(sessions: readonly Session[], lastExportAt: number | null, now: number): boolean {
  const done = sessions.filter((s) => s.state === 'done');
  if (done.length === 0) return false;
  const since = lastExportAt ?? Math.min(...done.map((s) => s.createdAt));
  if (now - since < BACKUP_REMINDER_MS) return false;
  return lastExportAt === null || done.some((s) => s.updatedAt > lastExportAt);
}
