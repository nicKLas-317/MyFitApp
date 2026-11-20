/**
 * Format de la sauvegarde complète (§11.10) : identifiant de l'appli, version du format et contenu
 * (version 1.55.1 : découpé de backup.ts, sans changement de comportement).
 */
import type { Exercise, Session, SessionPlan } from '../domain/types';
import type { ActivityRecord } from '../activities/model';
import type { BodyTracking } from '../body/model';

export const APP_ID = 'MyFitApp';
export const SCHEMA_VERSION = 7;
/** Plus ancienne version du format natif, migrée à l'import. */
export const FIRST_NATIVE_VERSION = 2;

export interface Backup {
  app: typeof APP_ID;
  schemaVersion: typeof SCHEMA_VERSION;
  exportedAt: string;
  sessions: Session[];
  exercises: Exercise[];
  /** Réglages généraux ; les réglages par exercice sont portés par les variantes. */
  settings: Record<string, unknown>;
  bodyTracking: BodyTracking;
  /** Activités habituelles hors salle : réponses « Oui » (activités confirmées) et « Non ». */
  activities: ActivityRecord[];
  /** Séance prévue (§5.9), null sans plan ; absente d'une sauvegarde antérieure à la version 1.23.0. */
  plan: SessionPlan | null;
}
