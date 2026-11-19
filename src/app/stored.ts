/**
 * Lecture de la base par l'appli (`src/app/store.tsx`) : tout ce qu'elle contient, déjà contrôlé, au lancement et à
 * chaque relecture (§12). Découpage de la version 1.48.2, sans changement de comportement.
 */
import type { CardioMachine, Exercise, Session, SessionPlan } from '../domain/types';
import { CARDIO_MACHINES_VERSION, sanitizeCardioMachines, upgradeCardioMachines } from '../cardio/model';
import { sanitizeRecapSettings, type WeeklyRecapSettings } from '../analysis/weekly';
import { sanitizeReportSeen, sanitizeReportSettings, type ReportSeen, type ReportSettings } from '../analysis/reportSettings';
import { sanitizeCoachSent } from '../analysis/coachPeriod';
import { sanitizeIgnoredAlerts, type IgnoredAlerts } from '../analysis/groupAlerts';
import { sanitizeIgnoredJointAlerts, type IgnoredJointAlerts } from '../analysis/jointAlerts';
import { sanitizeSetsHintDismissed, type SetsHintDismissed } from '../analysis/setsHint';
import { sanitizeActivities, sanitizeHabits, type ActivityRecord, type Habit } from '../activities/model';
import { sanitizePlan } from '../plan/model';
import type { PersistState, Repository } from '../storage/db';

export function upsert<T extends { id: string }>(list: readonly T[], items: readonly T[]): T[] {
  const byId = new Map(items.map((x) => [x.id, x]));
  const next = list.map((x) => byId.get(x.id) ?? x);
  for (const x of items) if (!list.some((y) => y.id === x.id)) next.push(x);
  return next;
}

/** Même version de chaque séance (identifiant et dernière modification) dans les deux listes. */
export function sameVersions(a: readonly Session[], b: readonly Session[]): boolean {
  const versions = new Map(a.map((s) => [s.id, s.updatedAt]));
  return a.length === b.length && b.every((s) => versions.get(s.id) === s.updatedAt);
}

/** Tout ce que l'appli lit dans la base, déjà contrôlé : au lancement et à chaque relecture (§12). */
export interface StoredData {
  sessions: Session[];
  exercises: Exercise[];
  lastExportAt: number | null;
  recap: WeeklyRecapSettings;
  machines: CardioMachine[];
  /** Liste de machines enregistrée par une version antérieure, complétée ici (à réenregistrer au lancement). */
  machinesOutdated: boolean;
  reports: ReportSettings;
  reportSeen: ReportSeen;
  coachSent: string | null;
  ignoredAlerts: IgnoredAlerts;
  /** Articulations ignorées (version 1.53.0, §19.14) : mémoire de l'appareil, pas dans la sauvegarde. */
  ignoredJointAlerts: IgnoredJointAlerts;
  setsHintDismissed: SetsHintDismissed;
  habits: Habit[];
  activities: ActivityRecord[];
  plan: SessionPlan | null;
}

export async function loadStored(repo: Repository): Promise<StoredData> {
  const [sessions, exercises, exportedAt, recap, machines, machinesVersion, reports, seen, habits, activities, plan, ignored, coachSent, setsHints, ignoredJoints] = await Promise.all([
    repo.loadSessions(),
    repo.loadExercises(),
    repo.getMeta<number>('lastExportAt'),
    repo.getMeta<unknown>('weeklyRecap'),
    repo.getMeta<unknown>('cardioMachines'),
    repo.getMeta<number>('cardioMachinesVersion'),
    repo.getMeta<unknown>('reports'),
    repo.getMeta<unknown>('reportsSeen'),
    repo.getMeta<unknown>('habits'),
    repo.getMeta<unknown>('activities'),
    repo.getMeta<unknown>('plan'),
    repo.getMeta<unknown>('groupAlertsIgnored'),
    repo.getMeta<unknown>('coachSent'),
    repo.getMeta<unknown>('setsHintDismissed'),
    repo.getMeta<unknown>('jointAlertsIgnored'),
  ]);
  // Installation antérieure au cardio : aucune liste enregistrée, la liste par défaut s'applique.
  // Liste enregistrée par une version antérieure : les nouvelles machines sont ajoutées une seule fois.
  const machinesOutdated = machines !== undefined && (machinesVersion ?? 1) < CARDIO_MACHINES_VERSION;
  const machineList = sanitizeCardioMachines(machines);
  return {
    sessions,
    exercises,
    lastExportAt: exportedAt ?? null,
    recap: sanitizeRecapSettings(recap),
    machines: machinesOutdated ? upgradeCardioMachines(machineList, machinesVersion ?? 1) : machineList,
    machinesOutdated,
    reports: sanitizeReportSettings(reports),
    reportSeen: sanitizeReportSeen(seen),
    coachSent: sanitizeCoachSent(coachSent),
    ignoredAlerts: sanitizeIgnoredAlerts(ignored),
    ignoredJointAlerts: sanitizeIgnoredJointAlerts(ignoredJoints),
    setsHintDismissed: sanitizeSetsHintDismissed(setsHints),
    habits: sanitizeHabits(habits),
    activities: sanitizeActivities(activities),
    plan: sanitizePlan(plan),
  };
}

export async function currentPersistState(): Promise<PersistState> {
  const storage = navigator.storage;
  if (!storage?.persisted) return 'unsupported';
  try {
    return (await storage.persisted()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
