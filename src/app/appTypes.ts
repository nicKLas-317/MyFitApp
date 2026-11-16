/**
 * Types de l'état de l'appli (`useApp`, `src/app/store.tsx`) : valeur partagée par tous les écrans, et import en une
 * transaction. Découpage de la version 1.48.2, sans changement de comportement.
 */
import type { CardioMachine, Exercise, Session, SessionPlan } from '../domain/types';
import type { EngineSettings, ReplayResult } from '../engine';
import type { VariantRef } from '../library/catalog';
import type { WeeklyRecapSettings } from '../analysis/weekly';
import type { ReportPeriod, ReportSeen, ReportSettings } from '../analysis/report';
import type { Records } from '../analysis/records';
import type { GroupAlert, IgnoredAlerts } from '../analysis/groupAlerts';
import type { ActivityRecord, Habit, Occurrence } from '../activities/model';
import type { RemovedPerformance, VariantContext } from '../session/ops';
import type { PersistState } from '../storage/db';

export type SaveStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error' };

export interface UndoEntry {
  id: number;
  label: string;
  previous: Session;
}

export interface FinishInfo {
  sessionId: string;
  removed: RemovedPerformance[];
}

export interface AppValue {
  sessions: Session[];
  exercises: Exercise[];
  variants: Map<string, VariantRef>;
  settings: EngineSettings;
  /** Profil recalculé à partir de l'historique (§7.9) et évaluations de chaque performance. */
  replay: ReplayResult;
  /** Records personnels, recalculés à partir de tout l'historique (séances terminées). */
  records: Records;
  active: Session | undefined;
  save: SaveStatus;
  persist: PersistState | null;
  undo: UndoEntry | null;
  lastFinish: FinishInfo | null;
  /** Date du dernier export (ms epoch), null si jamais exporté. */
  lastExportAt: number | null;
  /** Réglages du récapitulatif hebdomadaire de l'accueil (§19.6). */
  recapSettings: WeeklyRecapSettings;
  setRecapSettings(next: WeeklyRecapSettings): Promise<boolean>;
  /** Bilans de la semaine et du mois (§19.7) : bandeaux de l'accueil et adresse du mail. */
  reportSettings: ReportSettings;
  setReportSettings(next: ReportSettings): Promise<boolean>;
  /** Dernières périodes terminées dont le bilan a été ouvert : leur bandeau n'est plus affiché. */
  reportSeen: ReportSeen;
  markReportSeen(period: ReportPeriod): Promise<void>;
  /**
   * Dernière semaine envoyée au coach (version 1.47.0, clé du lundi), mémorisée sur l'appareil seulement : le bandeau du
   * bilan de la semaine affiche alors « Envoyé au coach ✓ ».
   */
  coachSent: string | null;
  markCoachSent(period: ReportPeriod): Promise<void>;
  /** Alertes « groupe moins travaillé » ignorées (version 1.38.0), mémorisées sur l'appareil seulement. */
  ignoredAlerts: IgnoredAlerts;
  ignoreGroupAlert(alert: GroupAlert): Promise<void>;
  /** Activités habituelles hors salle (badminton…), modifiables dans les réglages. */
  habits: Habit[];
  setHabits(next: Habit[]): Promise<boolean>;
  /** Réponses aux questions des habitudes : activités confirmées (« Oui ») ou refusées (« Non »). */
  activities: ActivityRecord[];
  /** Répond à la question d'une habitude ; rien d'autre à saisir. */
  answerActivity(occurrence: Occurrence, yes: boolean): Promise<boolean>;
  /** Enregistre une activité ponctuelle (« + Activité ») ; remplace une réponse « Non » du même jour. */
  addActivity(record: ActivityRecord): Promise<boolean>;
  /** Supprime une activité confirmée (historique) : la question ne revient pas pour ce jour. */
  removeActivity(id: string): Promise<boolean>;
  /** Séance prévue (§5.9), tant qu'elle n'a pas été réalisée ; null sans plan. */
  plan: SessionPlan | null;
  /** Enregistre la séance prévue (null : la supprime) ; l'état n'est mis à jour qu'en cas de succès. */
  savePlan(next: SessionPlan | null): Promise<boolean>;
  /** Machines de cardio proposées à la saisie, modifiables dans les réglages. */
  cardioMachines: CardioMachine[];
  setCardioMachines(next: CardioMachine[]): Promise<boolean>;
  /** Réglages généraux inclus dans l'export (§11.10). */
  generalSettings: Record<string, unknown>;
  /**
   * Contexte du moteur d'un exercice-variante : son suivi à la salle, ou à la maison (`home`, version 1.26.0) pour un
   * exercice à charge.
   */
  ctxFor(variantId: string, home?: boolean): VariantContext;
  /** Applique la nouvelle version d'une séance puis l'enregistre. Renvoie true si l'enregistrement a réussi. */
  commit(next: Session, undoLabel?: string): Promise<boolean>;
  retrySave(): void;
  applyUndo(): void;
  dismissUndo(): void;
  setLastFinish(info: FinishInfo | null): void;
  /** Enregistre un import en une transaction ; l'état n'est mis à jour qu'en cas de succès. */
  importData(data: ImportData): Promise<boolean>;
  /** Enregistre des exercices créés ou modifiés ; l'état n'est mis à jour qu'en cas de succès. */
  saveExercises(list: readonly Exercise[]): Promise<boolean>;
  /** Supprime un exercice sans historique (l'appelant le vérifie). */
  deleteExercise(exercise: Exercise): Promise<boolean>;
  markExported(at: number): Promise<boolean>;
  /** Supprime une séance passée (après confirmation explicite) ; le profil est recalculé (§10, §7.9). */
  deleteSession(id: string): Promise<boolean>;
}

export interface ImportData {
  sessions: readonly Session[];
  exercises: readonly Exercise[];
  /** Liste complète des activités habituelles après l'import (fusion déjà faite par l'appelant). */
  activities?: readonly ActivityRecord[];
  /** Séance prévue après l'import (null : aucune) ; absente : inchangée. */
  plan?: SessionPlan | null;
  /** Remplacement global, après confirmation explicite uniquement. */
  replace?: boolean;
}
