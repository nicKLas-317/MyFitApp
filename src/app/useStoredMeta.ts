/**
 * Réglages, activités, séance prévue et mémoire de l'appareil, enregistrés dans la méta de la base : leur état et leurs
 * actions, pour `AppProvider` (`src/app/store.tsx`). Découpage de la version 1.48.2, sans changement de comportement.
 */
import { useCallback, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { CardioMachine, SessionPlan } from '../domain/types';
import { CARDIO_MACHINES_VERSION, sanitizeCardioMachines } from '../cardio/model';
import { DEFAULT_RECAP_SETTINGS, type WeeklyRecapSettings } from '../analysis/weekly';
import { periodKey, type ReportPeriod } from '../analysis/reportPeriod';
import { DEFAULT_REPORT_SETTINGS, markSeen, type ReportSeen, type ReportSettings } from '../analysis/reportSettings';
import { ignoreAlert, type GroupAlert, type IgnoredAlerts } from '../analysis/groupAlerts';
import { dismissSetsHint as dismissHint, type SetsHint, type SetsHintDismissed } from '../analysis/setsHint';
import { answer, sanitizeHabits, type ActivityRecord, type Habit, type Occurrence } from '../activities/model';
import type { StoredData } from './stored';

/** Enregistre des valeurs de la méta, puis applique `apply` si l'écriture a réussi (`writeMeta` d'`AppProvider`). */
export type WriteMeta = (entries: [string, unknown][], apply: () => void) => Promise<boolean>;

export function useStoredMeta(writeMeta: WriteMeta, localChanges: MutableRefObject<number>) {
  const [lastExportAt, setLastExportAt] = useState<number | null>(null);
  const [recapSettings, setRecapState] = useState<WeeklyRecapSettings>(DEFAULT_RECAP_SETTINGS);
  const [cardioMachines, setMachinesState] = useState<CardioMachine[]>(() => sanitizeCardioMachines(undefined));
  const [reportSettings, setReportState] = useState<ReportSettings>(DEFAULT_REPORT_SETTINGS);
  const [reportSeen, setReportSeen] = useState<ReportSeen>({});
  const reportSeenRef = useRef<ReportSeen>({});
  const [coachSent, setCoachSent] = useState<string | null>(null);
  const [ignoredAlerts, setIgnoredAlerts] = useState<IgnoredAlerts>({});
  const ignoredAlertsRef = useRef<IgnoredAlerts>({});
  const [setsHintDismissed, setSetsHintDismissed] = useState<SetsHintDismissed>({});
  const setsHintDismissedRef = useRef<SetsHintDismissed>({});
  const [habits, setHabitsState] = useState<Habit[]>(() => sanitizeHabits(undefined));
  const [activities, setActivitiesState] = useState<ActivityRecord[]>([]);
  const activitiesRef = useRef<ActivityRecord[]>([]);
  const [storedPlan, setStoredPlan] = useState<SessionPlan | null>(null);

  /**
   * Applique ce qui vient d'être lu dans la base, hors séances et bibliothèque (réglages, activités, séance prévue,
   * mémoire de l'appareil) : au lancement, et à chaque relecture (autre fenêtre, retour au premier plan, §12).
   * Une valeur inchangée garde son objet, pour ne rien redessiner.
   */
  const applyStoredMeta = useCallback((stored: StoredData) => {
    const keep = <T,>(next: T) => (current: T) => (JSON.stringify(current) === JSON.stringify(next) ? current : next);
    setLastExportAt(stored.lastExportAt);
    setRecapState(keep(stored.recap));
    setMachinesState(keep(stored.machines));
    setReportState(keep(stored.reports));
    reportSeenRef.current = stored.reportSeen;
    setReportSeen(keep(stored.reportSeen));
    setCoachSent(stored.coachSent);
    ignoredAlertsRef.current = stored.ignoredAlerts;
    setIgnoredAlerts(keep(stored.ignoredAlerts));
    setsHintDismissedRef.current = stored.setsHintDismissed;
    setSetsHintDismissed(keep(stored.setsHintDismissed));
    setHabitsState(keep(stored.habits));
    activitiesRef.current = stored.activities;
    setActivitiesState(keep(stored.activities));
    setStoredPlan(keep(stored.plan));
  }, []);

  /** Après un import en une transaction : activités et séance prévue déjà enregistrées. */
  const applyImportedMeta = useCallback((next: { activities?: readonly ActivityRecord[]; plan?: SessionPlan | null }) => {
    if (next.activities) {
      activitiesRef.current = [...next.activities];
      setActivitiesState(activitiesRef.current);
    }
    if (next.plan !== undefined) setStoredPlan(next.plan);
  }, []);

  const setRecapSettings = useCallback(
    (next: WeeklyRecapSettings) => writeMeta([['weeklyRecap', next]], () => setRecapState(next)),
    [writeMeta],
  );

  const setCardioMachines = useCallback(
    (next: CardioMachine[]) =>
      writeMeta(
        [
          ['cardioMachines', next],
          ['cardioMachinesVersion', CARDIO_MACHINES_VERSION],
        ],
        () => setMachinesState(next),
      ),
    [writeMeta],
  );

  const setReportSettings = useCallback(
    (next: ReportSettings) => writeMeta([['reports', next]], () => setReportState(next)),
    [writeMeta],
  );

  const setHabits = useCallback(
    (next: Habit[]) => writeMeta([['habits', next]], () => setHabitsState(next)),
    [writeMeta],
  );

  /** Enregistre la liste complète des activités ; l'état n'est mis à jour qu'en cas de succès. */
  const writeActivities = useCallback(
    (next: ActivityRecord[]) =>
      writeMeta([['activities', next]], () => {
        activitiesRef.current = next;
        setActivitiesState(next);
      }),
    [writeMeta],
  );

  const answerActivity = useCallback(
    (occurrence: Occurrence, yes: boolean) => {
      const record = answer(occurrence, yes, Date.now());
      return writeActivities([...activitiesRef.current.filter((a) => a.id !== record.id), record]);
    },
    [writeActivities],
  );

  const addActivity = useCallback(
    (record: ActivityRecord) => writeActivities([...activitiesRef.current.filter((a) => a.id !== record.id), record]),
    [writeActivities],
  );

  const removeActivity = useCallback(
    (id: string) =>
      writeActivities(activitiesRef.current.map((a) => (a.id === id ? { ...a, status: 'declined' as const, answeredAt: Date.now() } : a))),
    [writeActivities],
  );

  const savePlan = useCallback((next: SessionPlan | null) => writeMeta([['plan', next]], () => setStoredPlan(next)), [writeMeta]);

  const markReportSeen = useCallback(
    async (period: ReportPeriod): Promise<void> => {
      const next = markSeen(reportSeenRef.current, period, Date.now());
      if (next === reportSeenRef.current) return;
      reportSeenRef.current = next;
      setReportSeen(next);
      // Une relecture de la base commencée avant ne doit pas rétablir l'ancienne valeur.
      localChanges.current++;
      // Un échec est sans gravité : le bandeau réapparaîtra à la prochaine ouverture.
      await writeMeta([['reportsSeen', next]], () => {});
    },
    [writeMeta, localChanges],
  );

  const markCoachSent = useCallback(
    async (period: ReportPeriod): Promise<void> => {
      const key = periodKey(period);
      setCoachSent(key);
      // Une relecture de la base commencée avant ne doit pas rétablir l'ancienne valeur.
      localChanges.current++;
      // Un échec est sans gravité : le bouton du bandeau réapparaîtra à la prochaine ouverture.
      await writeMeta([['coachSent', key]], () => {});
    },
    [writeMeta, localChanges],
  );

  const ignoreGroupAlert = useCallback(
    async (alert: GroupAlert): Promise<void> => {
      const next = ignoreAlert(ignoredAlertsRef.current, alert);
      ignoredAlertsRef.current = next;
      setIgnoredAlerts(next);
      // Une relecture de la base commencée avant ne doit pas rétablir l'ancienne valeur.
      localChanges.current++;
      // Un échec est sans gravité : l'alerte réapparaîtra à la prochaine ouverture.
      await writeMeta([['groupAlertsIgnored', next]], () => {});
    },
    [writeMeta, localChanges],
  );

  const dismissSetsHint = useCallback(
    async (hint: SetsHint): Promise<void> => {
      const next = dismissHint(setsHintDismissedRef.current, hint);
      setsHintDismissedRef.current = next;
      setSetsHintDismissed(next);
      // Une relecture de la base commencée avant ne doit pas rétablir l'ancienne valeur.
      localChanges.current++;
      // Un échec est sans gravité : la proposition réapparaîtra à la prochaine ouverture.
      await writeMeta([['setsHintDismissed', next]], () => {});
    },
    [writeMeta, localChanges],
  );

  const generalSettings = useMemo(
    () => ({ weeklyRecap: recapSettings, cardioMachines, cardioMachinesVersion: CARDIO_MACHINES_VERSION, reports: reportSettings, habits }),
    [recapSettings, cardioMachines, reportSettings, habits],
  );

  const markExported = useCallback((at: number) => writeMeta([['lastExportAt', at]], () => setLastExportAt(at)), [writeMeta]);

  return {
    storedPlan,
    setStoredPlan,
    applyStoredMeta,
    applyImportedMeta,
    values: {
      lastExportAt,
      recapSettings,
      setRecapSettings,
      reportSettings,
      setReportSettings,
      reportSeen,
      markReportSeen,
      coachSent,
      markCoachSent,
      ignoredAlerts,
      ignoreGroupAlert,
      setsHintDismissed,
      dismissSetsHint,
      habits,
      setHabits,
      activities,
      answerActivity,
      addActivity,
      removeActivity,
      savePlan,
      cardioMachines,
      setCardioMachines,
      generalSettings,
      markExported,
    },
  };
}
