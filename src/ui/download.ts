import type { ActivityRecord } from '../activities/model';
import type { BodyTracking } from '../body/model';
import type { Exercise, Session, SessionPlan } from '../domain/types';
import { backupFileName, buildBackup } from '../transfer/backup';

/** Télécharge une sauvegarde complète au format JSON (§11.10). Renvoie l'horodatage de l'export. */
export function downloadBackup(data: {
  sessions: readonly Session[];
  exercises: readonly Exercise[];
  bodyTracking?: BodyTracking;
  settings?: Record<string, unknown>;
  activities?: readonly ActivityRecord[];
  plan?: SessionPlan | null;
}): number {
  const now = Date.now();
  downloadFile(new Blob([JSON.stringify(buildBackup(data, now), null, 2)], { type: 'application/json' }), backupFileName(now));
  return now;
}

/** Télécharge un fichier (sauvegarde, export pour le coach). */
export function downloadFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
