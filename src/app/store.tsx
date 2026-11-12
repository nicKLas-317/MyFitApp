import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CardioMachine, Exercise, Session, SessionPlan } from '../domain/types';
import { CARDIO_MACHINES_VERSION, sanitizeCardioMachines, upgradeCardioMachines } from '../cardio/model';
import { rebuildProfile, resolveConfig, trackKey, type EngineSettings, type ReplayResult } from '../engine';
import { buildEngineSettings, indexVariants, type VariantRef } from '../library/catalog';
import { exerciseHasHistory } from '../library/edit';
import { DEFAULT_RECAP_SETTINGS, sanitizeRecapSettings, type WeeklyRecapSettings } from '../analysis/weekly';
import { DEFAULT_REPORT_SETTINGS, markSeen, periodKey, sanitizeReportSeen, sanitizeReportSettings, type ReportPeriod, type ReportSeen, type ReportSettings } from '../analysis/report';
import { sanitizeCoachSent } from '../analysis/coach';
import { computeRecords, type Records } from '../analysis/records';
import { ignoreAlert, sanitizeIgnoredAlerts, type GroupAlert, type IgnoredAlerts } from '../analysis/groupAlerts';
import { answer, sanitizeActivities, sanitizeHabits, type ActivityRecord, type Habit, type Occurrence } from '../activities/model';
import type { RemovedPerformance, VariantContext } from '../session/ops';
import { currentPlan, sanitizePlan } from '../plan/model';
import { openAppDb, Repository, requestPersistence, type PersistState } from '../storage/db';
import { PendingWrites } from '../storage/pending';

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

interface AppValue {
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

function upsert<T extends { id: string }>(list: readonly T[], items: readonly T[]): T[] {
  const byId = new Map(items.map((x) => [x.id, x]));
  const next = list.map((x) => byId.get(x.id) ?? x);
  for (const x of items) if (!list.some((y) => y.id === x.id)) next.push(x);
  return next;
}

/** Même version de chaque séance (identifiant et dernière modification) dans les deux listes. */
function sameVersions(a: readonly Session[], b: readonly Session[]): boolean {
  const versions = new Map(a.map((s) => [s.id, s.updatedAt]));
  return a.length === b.length && b.every((s) => versions.get(s.id) === s.updatedAt);
}

/**
 * Canal entre les fenêtres de l'appli ouvertes en même temps sur l'appareil (appli installée et onglet Chrome,
 * par exemple) : chacune prévient les autres de ses écritures pour qu'aucune n'écrase une séance plus récente.
 */
const CHANNEL_NAME = 'myfitapp-donnees';

const AppContext = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp hors de AppProvider');
  return value;
}

/** Tout ce que l'appli lit dans la base, déjà contrôlé : au lancement et à chaque relecture (§12). */
interface StoredData {
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
  habits: Habit[];
  activities: ActivityRecord[];
  plan: SessionPlan | null;
}

async function loadStored(repo: Repository): Promise<StoredData> {
  const [sessions, exercises, exportedAt, recap, machines, machinesVersion, reports, seen, habits, activities, plan, ignored, coachSent] = await Promise.all([
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
    habits: sanitizeHabits(habits),
    activities: sanitizeActivities(activities),
    plan: sanitizePlan(plan),
  };
}

type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; repo: Repository };

export function AppProvider({ children }: { children: ReactNode }) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [save, setSave] = useState<SaveStatus>({ kind: 'idle' });
  const [persist, setPersist] = useState<PersistState | null>(null);
  const [undo, setUndo] = useState<UndoEntry | null>(null);
  const [lastFinish, setLastFinish] = useState<FinishInfo | null>(null);
  const [lastExportAt, setLastExportAt] = useState<number | null>(null);
  const [recapSettings, setRecapState] = useState<WeeklyRecapSettings>(DEFAULT_RECAP_SETTINGS);
  const [cardioMachines, setMachinesState] = useState<CardioMachine[]>(() => sanitizeCardioMachines(undefined));
  const [reportSettings, setReportState] = useState<ReportSettings>(DEFAULT_REPORT_SETTINGS);
  const [reportSeen, setReportSeen] = useState<ReportSeen>({});
  const reportSeenRef = useRef<ReportSeen>({});
  const [coachSent, setCoachSent] = useState<string | null>(null);
  const [ignoredAlerts, setIgnoredAlerts] = useState<IgnoredAlerts>({});
  const ignoredAlertsRef = useRef<IgnoredAlerts>({});
  const [habits, setHabitsState] = useState<Habit[]>(() => sanitizeHabits(undefined));
  const [activities, setActivitiesState] = useState<ActivityRecord[]>([]);
  const activitiesRef = useRef<ActivityRecord[]>([]);
  const [storedPlan, setStoredPlan] = useState<SessionPlan | null>(null);

  const sessionsRef = useRef<Session[]>([]);
  const pending = useRef(new PendingWrites<Session>());
  const undoCounter = useRef(0);
  /** Nombre de modifications locales : une relecture de la base commencée avant l'une d'elles est périmée. */
  const localChanges = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);

  /**
   * Applique ce qui vient d'être lu dans la base, hors séances (bibliothèque, réglages, activités, séance prévue,
   * mémoire de l'appareil) : au lancement, et à chaque relecture (autre fenêtre, retour au premier plan, §12).
   * Une valeur inchangée garde son objet, pour ne rien redessiner.
   */
  const applyStored = useCallback((stored: StoredData) => {
    const keep = <T,>(next: T) => (current: T) => (JSON.stringify(current) === JSON.stringify(next) ? current : next);
    setExercises(keep(stored.exercises));
    setLastExportAt(stored.lastExportAt);
    setRecapState(keep(stored.recap));
    setMachinesState(keep(stored.machines));
    setReportState(keep(stored.reports));
    reportSeenRef.current = stored.reportSeen;
    setReportSeen(keep(stored.reportSeen));
    setCoachSent(stored.coachSent);
    ignoredAlertsRef.current = stored.ignoredAlerts;
    setIgnoredAlerts(keep(stored.ignoredAlerts));
    setHabitsState(keep(stored.habits));
    activitiesRef.current = stored.activities;
    setActivitiesState(keep(stored.activities));
    setStoredPlan(keep(stored.plan));
  }, []);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const repo = new Repository(await openAppDb());
        await repo.ensureSeed();
        try {
          await repo.ensurePlusEqualFix();
        } catch (error) {
          // Sans gravité : la correction sera refaite au prochain lancement.
          console.error('[MyFitApp] correction des ressentis « += » non appliquée', error);
        }
        const stored = await loadStored(repo);
        // Liste de machines enregistrée par une version antérieure : les nouvelles machines sont ajoutées une seule fois.
        if (stored.machinesOutdated) {
          try {
            await repo.setMeta('cardioMachines', stored.machines);
            await repo.setMeta('cardioMachinesVersion', CARDIO_MACHINES_VERSION);
          } catch (error) {
            // Sans gravité : la mise à niveau sera refaite au prochain lancement.
            console.error('[MyFitApp] liste des machines non mise à jour', error);
          }
        }
        if (cancelled) return;
        sessionsRef.current = stored.sessions;
        setSessions(stored.sessions);
        applyStored(stored);
        setLoad({ kind: 'ready', repo });

        // §12 : stockage persistant demandé au premier lancement, état affiché ensuite.
        const asked = await repo.getMeta<boolean>('persistRequested');
        const state = asked ? await currentPersistState() : await requestPersistence();
        if (!asked) await repo.setMeta('persistRequested', true);
        if (!cancelled) setPersist(state);
      } catch (error) {
        if (!cancelled) setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const repo = load.kind === 'ready' ? load.repo : null;

  /** Prévient les autres fenêtres qu'une écriture a abouti. */
  const announce = useCallback(() => {
    try {
      channel.current?.postMessage('changed');
    } catch {
      // Canal fermé ou indisponible : les autres fenêtres reliront la base en revenant au premier plan.
    }
  }, []);

  /**
   * Enregistre une ou plusieurs valeurs de la méta (réglages, activités, séance prévue…), puis met l'état à jour et
   * prévient les autres fenêtres (§12) ; rien n'est changé si l'écriture échoue.
   */
  const writeMeta = useCallback(
    async (entries: [string, unknown][], apply: () => void): Promise<boolean> => {
      if (!repo) return false;
      try {
        for (const [key, value] of entries) await repo.setMeta(key, value);
      } catch (error) {
        console.error(`[MyFitApp] ${entries.map(([k]) => k).join(', ')} non enregistré`, error);
        return false;
      }
      apply();
      localChanges.current++;
      announce();
      return true;
    },
    [repo, announce],
  );

  /**
   * Relit toute la base (séances, bibliothèque, réglages, activités, séance prévue, mémoire de l'appareil), écrite
   * peut-être par une autre fenêtre : une fenêtre restée en arrière-plan n'écrit jamais une ancienne version d'une
   * séance ou d'un réglage par-dessus une version plus récente. Une écriture locale non confirmée garde sa version,
   * plus récente que la base.
   */
  const reloadFromDb = useCallback(async () => {
    if (!repo) return;
    const startedAt = localChanges.current;
    let stored: StoredData;
    try {
      stored = await loadStored(repo);
    } catch (error) {
      console.error('[MyFitApp] relecture de la base impossible', error);
      return;
    }
    // Une modification faite ici entre-temps est plus récente que ce qui vient d'être lu.
    if (localChanges.current !== startedAt) return;
    const unconfirmed = new Map(pending.current.toRetry().map((s) => [s.id, s]));
    const list = stored.sessions.map((s) => unconfirmed.get(s.id) ?? s);
    for (const s of unconfirmed.values()) if (!stored.sessions.some((x) => x.id === s.id)) list.push(s);
    if (!sameVersions(sessionsRef.current, list)) {
      sessionsRef.current = list;
      setSessions(list);
      // L'annulation reprendrait une version antérieure aux modifications de l'autre fenêtre.
      setUndo(null);
    }
    applyStored(stored);
  }, [repo, applyStored]);

  useEffect(() => {
    if (!repo || typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(CHANNEL_NAME);
    bc.onmessage = () => void reloadFromDb();
    channel.current = bc;
    return () => {
      bc.close();
      channel.current = null;
    };
  }, [repo, reloadFromDb]);

  /**
   * Écrit la séance tout de suite : aucun délai ni regroupement entre une saisie et IndexedDB (§12).
   * L'écriture reste suivie jusqu'à sa confirmation, pour être relancée si besoin (arrière-plan, échec).
   */
  const persistSession = useCallback(
    async (session: Session): Promise<boolean> => {
      if (!repo) return false;
      pending.current.begin(session);
      setSave({ kind: 'saving' });
      try {
        await repo.putSession(session);
        pending.current.confirm(session);
        announce();
        setSave(pending.current.hasFailures() ? { kind: 'error' } : { kind: 'saved' });
        return true;
      } catch (error) {
        console.error('[MyFitApp] échec d’enregistrement', error);
        pending.current.fail(session);
        setSave({ kind: 'error' });
        return false;
      }
    },
    [repo, announce],
  );

  const commit = useCallback(
    (next: Session, undoLabel?: string) => {
      const previous = sessionsRef.current.find((s) => s.id === next.id);
      const list = previous
        ? sessionsRef.current.map((s) => (s.id === next.id ? next : s))
        : [...sessionsRef.current, next];
      sessionsRef.current = list;
      localChanges.current++;
      setSessions(list);
      // Toute nouvelle modification remplace la précédente possibilité d'annulation :
      // annuler ne doit jamais défaire une action plus récente (ni rouvrir une séance terminée).
      setUndo(undoLabel && previous ? { id: ++undoCounter.current, label: undoLabel, previous } : null);
      return persistSession(next);
    },
    [persistSession],
  );

  /** Relance les écritures non confirmées (toutes, ou seulement celles qui ont échoué), dans leur dernière version. */
  const flushWrites = useCallback(
    (onlyFailed: boolean) => {
      for (const item of pending.current.toRetry(onlyFailed)) {
        const latest = sessionsRef.current.find((s) => s.id === item.id);
        if (latest) void persistSession(latest);
        else pending.current.forget(item.id);
      }
    },
    [persistSession],
  );

  const retrySave = useCallback(() => flushWrites(true), [flushWrites]);

  // Android peut geler ou fermer l'appli dès qu'elle passe en arrière-plan (écran verrouillé, autre appli) :
  // les écritures non confirmées sont relancées à ce moment-là, puis au retour au premier plan.
  useEffect(() => {
    const onHide = () => flushWrites(false);
    // Au retour au premier plan, la base peut avoir été modifiée par une autre fenêtre de l'appli.
    const onVisible = () => {
      retrySave();
      void reloadFromDb();
    };
    const onVisibility = () => (document.visibilityState === 'visible' ? onVisible() : flushWrites(false));
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('freeze', onHide);
    document.addEventListener('resume', onVisible);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('freeze', onHide);
      document.removeEventListener('resume', onVisible);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onVisible);
    };
  }, [flushWrites, retrySave, reloadFromDb]);

  const applyUndo = useCallback(() => {
    if (!undo) return;
    setUndo(null);
    void commit({ ...undo.previous, updatedAt: Date.now() });
  }, [undo, commit]);

  const dismissUndo = useCallback(() => setUndo(null), []);

  const importData = useCallback(
    async (data: ImportData): Promise<boolean> => {
      if (!repo) return false;
      try {
        await repo.applyImport(data);
      } catch (error) {
        console.error('[MyFitApp] échec de l’import', error);
        return false;
      }
      if (data.activities) {
        activitiesRef.current = [...data.activities];
        setActivitiesState(activitiesRef.current);
      }
      if (data.plan !== undefined) setStoredPlan(data.plan);
      const list = data.replace ? [...data.sessions] : upsert(sessionsRef.current, data.sessions);
      if (data.replace) pending.current.clear();
      localChanges.current++;
      announce();
      sessionsRef.current = list;
      setSessions(list);
      setExercises((current) => (data.replace ? [...data.exercises] : upsert(current, data.exercises)));
      // Une annulation ne doit jamais défaire un import.
      setUndo(null);
      setLastFinish(null);
      return true;
    },
    [repo, announce],
  );

  const saveExercises = useCallback(
    async (list: readonly Exercise[]): Promise<boolean> => {
      if (!repo) return false;
      setSave({ kind: 'saving' });
      try {
        await repo.putExercises(list);
      } catch (error) {
        console.error('[MyFitApp] échec d’enregistrement de la bibliothèque', error);
        setSave({ kind: 'error' });
        return false;
      }
      localChanges.current++;
      announce();
      setExercises((current) => upsert(current, list));
      setSave(pending.current.hasFailures() ? { kind: 'error' } : { kind: 'saved' });
      return true;
    },
    [repo, announce],
  );

  const deleteExercise = useCallback(
    async (exercise: Exercise): Promise<boolean> => {
      // Un exercice avec historique ne se supprime jamais : il s'archive (§4.3).
      if (!repo || exerciseHasHistory(exercise, sessionsRef.current)) return false;
      try {
        await repo.deleteExercise(exercise.id);
      } catch {
        return false;
      }
      localChanges.current++;
      announce();
      setExercises((current) => current.filter((e) => e.id !== exercise.id));
      return true;
    },
    [repo, announce],
  );

  const deleteSession = useCallback(
    async (id: string): Promise<boolean> => {
      if (!repo) return false;
      try {
        await repo.deleteSession(id);
      } catch (error) {
        console.error('[MyFitApp] échec de suppression', error);
        return false;
      }
      const list = sessionsRef.current.filter((s) => s.id !== id);
      localChanges.current++;
      announce();
      sessionsRef.current = list;
      setSessions(list);
      pending.current.forget(id);
      setUndo(null);
      return true;
    },
    [repo, announce],
  );

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
    [writeMeta],
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
    [writeMeta],
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
    [writeMeta],
  );

  const generalSettings = useMemo(
    () => ({ weeklyRecap: recapSettings, cardioMachines, cardioMachinesVersion: CARDIO_MACHINES_VERSION, reports: reportSettings, habits }),
    [recapSettings, cardioMachines, reportSettings, habits],
  );

  const markExported = useCallback((at: number) => writeMeta([['lastExportAt', at]], () => setLastExportAt(at)), [writeMeta]);

  const settings = useMemo(() => buildEngineSettings(exercises), [exercises]);
  const variants = useMemo(() => indexVariants(exercises), [exercises]);
  const replay = useMemo(() => rebuildProfile(sessions, settings), [sessions, settings]);
  const records = useMemo(() => computeRecords(sessions, settings), [sessions, settings]);
  const active = useMemo(() => sessions.find((s) => s.state === 'active'), [sessions]);
  const plan = useMemo(() => currentPlan(storedPlan, sessions), [storedPlan, sessions]);

  // Plan réalisé (séance démarrée à partir de lui, terminée) : retiré de la base, pour qu'il ne revienne pas si cette
  // séance est supprimée ensuite de l'historique.
  useEffect(() => {
    if (!repo || !storedPlan || plan) return;
    // Un échec est sans gravité : le plan réalisé n'est plus proposé ; le retrait sera refait au prochain lancement.
    void writeMeta([['plan', null]], () => setStoredPlan((current) => (current?.id === storedPlan.id ? null : current)));
  }, [repo, storedPlan, plan, writeMeta]);

  const ctxFor = useCallback(
    (variantId: string, home = false): VariantContext => {
      const track = trackKey(settings, variantId, home);
      return { state: replay.profile.variants[track], cfg: resolveConfig(settings, track) };
    },
    [replay, settings],
  );

  const value: AppValue = {
    sessions,
    exercises,
    variants,
    settings,
    replay,
    records,
    active,
    save,
    persist,
    undo,
    lastFinish,
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
    habits,
    setHabits,
    activities,
    answerActivity,
    addActivity,
    removeActivity,
    plan,
    savePlan,
    cardioMachines,
    setCardioMachines,
    generalSettings,
    ctxFor,
    commit,
    retrySave,
    applyUndo,
    dismissUndo,
    setLastFinish,
    importData,
    saveExercises,
    deleteExercise,
    markExported,
    deleteSession,
  };

  if (load.kind === 'loading') return <div className="splash">Chargement…</div>;
  if (load.kind === 'error') {
    return (
      <div className="splash error-screen" role="alert">
        <h1>Stockage local indisponible</h1>
        <p>Impossible d’ouvrir la base de données de l’appareil. Vérifie que le navigateur n’est pas en navigation privée.</p>
        <p className="muted">{load.message}</p>
      </div>
    );
  }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

async function currentPersistState(): Promise<PersistState> {
  const storage = navigator.storage;
  if (!storage?.persisted) return 'unsupported';
  try {
    return (await storage.persisted()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
