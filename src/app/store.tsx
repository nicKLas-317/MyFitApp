import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CardioMachine, Exercise, Session } from '../domain/types';
import { CARDIO_MACHINES_VERSION, sanitizeCardioMachines, upgradeCardioMachines } from '../cardio/model';
import { rebuildProfile, resolveConfig, type EngineSettings, type ReplayResult } from '../engine';
import { buildEngineSettings, indexVariants, type VariantRef } from '../library/catalog';
import { exerciseHasHistory } from '../library/edit';
import { DEFAULT_RECAP_SETTINGS, sanitizeRecapSettings, type WeeklyRecapSettings } from '../analysis/weekly';
import { DEFAULT_REPORT_SETTINGS, markSeen, sanitizeReportSeen, sanitizeReportSettings, type ReportPeriod, type ReportSeen, type ReportSettings } from '../analysis/report';
import { answer, sanitizeActivities, sanitizeHabits, type ActivityRecord, type Habit, type Occurrence } from '../activities/model';
import type { RemovedPerformance, VariantContext } from '../session/ops';
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
  /** Activités habituelles hors salle (badminton…), modifiables dans les réglages. */
  habits: Habit[];
  setHabits(next: Habit[]): Promise<boolean>;
  /** Réponses aux questions des habitudes : activités confirmées (« Oui ») ou refusées (« Non »). */
  activities: ActivityRecord[];
  /** Répond à la question d'une habitude ; rien d'autre à saisir. */
  answerActivity(occurrence: Occurrence, yes: boolean): Promise<boolean>;
  /** Supprime une activité confirmée (historique) : la question ne revient pas pour ce jour. */
  removeActivity(id: string): Promise<boolean>;
  /** Machines de cardio proposées à la saisie, modifiables dans les réglages. */
  cardioMachines: CardioMachine[];
  setCardioMachines(next: CardioMachine[]): Promise<boolean>;
  /** Réglages généraux inclus dans l'export (§11.10). */
  generalSettings: Record<string, unknown>;
  ctxFor(variantId: string): VariantContext;
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
  const [habits, setHabitsState] = useState<Habit[]>(() => sanitizeHabits(undefined));
  const [activities, setActivitiesState] = useState<ActivityRecord[]>([]);
  const activitiesRef = useRef<ActivityRecord[]>([]);

  const sessionsRef = useRef<Session[]>([]);
  const pending = useRef(new PendingWrites<Session>());
  const undoCounter = useRef(0);
  /** Nombre de modifications locales : une relecture de la base commencée avant l'une d'elles est périmée. */
  const localChanges = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);

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
        const [loadedSessions, loadedExercises, exportedAt, recap, machines, machinesVersion, reports, seen, loadedHabits, loadedActivities] = await Promise.all([
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
        ]);
        // Installation antérieure au cardio : aucune liste enregistrée, la liste par défaut s'applique.
        // Liste enregistrée par une version antérieure : les nouvelles machines sont ajoutées une seule fois.
        let machineList = sanitizeCardioMachines(machines);
        if (machines !== undefined && (machinesVersion ?? 1) < CARDIO_MACHINES_VERSION) {
          machineList = upgradeCardioMachines(machineList, machinesVersion ?? 1);
          try {
            await repo.setMeta('cardioMachines', machineList);
            await repo.setMeta('cardioMachinesVersion', CARDIO_MACHINES_VERSION);
          } catch (error) {
            // Sans gravité : la mise à niveau sera refaite au prochain lancement.
            console.error('[MyFitApp] liste des machines non mise à jour', error);
          }
        }
        if (cancelled) return;
        sessionsRef.current = loadedSessions;
        setSessions(loadedSessions);
        setExercises(loadedExercises);
        setLastExportAt(exportedAt ?? null);
        setRecapState(sanitizeRecapSettings(recap));
        setMachinesState(machineList);
        setReportState(sanitizeReportSettings(reports));
        reportSeenRef.current = sanitizeReportSeen(seen);
        setReportSeen(reportSeenRef.current);
        setHabitsState(sanitizeHabits(loadedHabits));
        activitiesRef.current = sanitizeActivities(loadedActivities);
        setActivitiesState(activitiesRef.current);
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
   * Relit séances et bibliothèque dans la base, écrites peut-être par une autre fenêtre : une fenêtre restée
   * en arrière-plan n'écrit jamais une ancienne version d'une séance par-dessus une version plus récente.
   * Une écriture locale non confirmée garde sa version, plus récente que la base.
   */
  const reloadFromDb = useCallback(async () => {
    if (!repo) return;
    const startedAt = localChanges.current;
    let loadedSessions: Session[];
    let loadedExercises: Exercise[];
    let loadedActivities: unknown;
    try {
      [loadedSessions, loadedExercises, loadedActivities] = await Promise.all([repo.loadSessions(), repo.loadExercises(), repo.getMeta<unknown>('activities')]);
    } catch (error) {
      console.error('[MyFitApp] relecture de la base impossible', error);
      return;
    }
    // Une modification faite ici entre-temps est plus récente que ce qui vient d'être lu.
    if (localChanges.current !== startedAt) return;
    const unconfirmed = new Map(pending.current.toRetry().map((s) => [s.id, s]));
    const list = loadedSessions.map((s) => unconfirmed.get(s.id) ?? s);
    for (const s of unconfirmed.values()) if (!loadedSessions.some((x) => x.id === s.id)) list.push(s);
    if (!sameVersions(sessionsRef.current, list)) {
      sessionsRef.current = list;
      setSessions(list);
      // L'annulation reprendrait une version antérieure aux modifications de l'autre fenêtre.
      setUndo(null);
    }
    setExercises((current) => (JSON.stringify(current) === JSON.stringify(loadedExercises) ? current : loadedExercises));
    const nextActivities = sanitizeActivities(loadedActivities);
    if (JSON.stringify(nextActivities) !== JSON.stringify(activitiesRef.current)) {
      activitiesRef.current = nextActivities;
      setActivitiesState(nextActivities);
    }
  }, [repo]);

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
    async (next: WeeklyRecapSettings): Promise<boolean> => {
      if (!repo) return false;
      try {
        await repo.setMeta('weeklyRecap', next);
      } catch {
        return false;
      }
      setRecapState(next);
      return true;
    },
    [repo],
  );

  const setCardioMachines = useCallback(
    async (next: CardioMachine[]): Promise<boolean> => {
      if (!repo) return false;
      try {
        await repo.setMeta('cardioMachines', next);
        await repo.setMeta('cardioMachinesVersion', CARDIO_MACHINES_VERSION);
      } catch {
        return false;
      }
      setMachinesState(next);
      return true;
    },
    [repo],
  );

  const setReportSettings = useCallback(
    async (next: ReportSettings): Promise<boolean> => {
      if (!repo) return false;
      try {
        await repo.setMeta('reports', next);
      } catch {
        return false;
      }
      setReportState(next);
      return true;
    },
    [repo],
  );

  const setHabits = useCallback(
    async (next: Habit[]): Promise<boolean> => {
      if (!repo) return false;
      try {
        await repo.setMeta('habits', next);
      } catch {
        return false;
      }
      setHabitsState(next);
      return true;
    },
    [repo],
  );

  /** Enregistre la liste complète des activités ; l'état n'est mis à jour qu'en cas de succès. */
  const writeActivities = useCallback(
    async (next: ActivityRecord[]): Promise<boolean> => {
      if (!repo) return false;
      try {
        await repo.setMeta('activities', next);
      } catch (error) {
        console.error('[MyFitApp] activité non enregistrée', error);
        return false;
      }
      activitiesRef.current = next;
      setActivitiesState(next);
      localChanges.current++;
      announce();
      return true;
    },
    [repo, announce],
  );

  const answerActivity = useCallback(
    (occurrence: Occurrence, yes: boolean) => {
      const record = answer(occurrence, yes, Date.now());
      return writeActivities([...activitiesRef.current.filter((a) => a.id !== record.id), record]);
    },
    [writeActivities],
  );

  const removeActivity = useCallback(
    (id: string) =>
      writeActivities(activitiesRef.current.map((a) => (a.id === id ? { ...a, status: 'declined' as const, answeredAt: Date.now() } : a))),
    [writeActivities],
  );

  const markReportSeen = useCallback(
    async (period: ReportPeriod): Promise<void> => {
      const next = markSeen(reportSeenRef.current, period, Date.now());
      if (next === reportSeenRef.current) return;
      reportSeenRef.current = next;
      setReportSeen(next);
      try {
        await repo?.setMeta('reportsSeen', next);
      } catch (error) {
        // Sans gravité : le bandeau réapparaîtra à la prochaine ouverture.
        console.error('[MyFitApp] bilan ouvert non mémorisé', error);
      }
    },
    [repo],
  );

  const generalSettings = useMemo(
    () => ({ weeklyRecap: recapSettings, cardioMachines, cardioMachinesVersion: CARDIO_MACHINES_VERSION, reports: reportSettings, habits }),
    [recapSettings, cardioMachines, reportSettings, habits],
  );

  const markExported = useCallback(
    async (at: number): Promise<boolean> => {
      if (!repo) return false;
      try {
        await repo.setMeta('lastExportAt', at);
        setLastExportAt(at);
        return true;
      } catch {
        return false;
      }
    },
    [repo],
  );

  const settings = useMemo(() => buildEngineSettings(exercises), [exercises]);
  const variants = useMemo(() => indexVariants(exercises), [exercises]);
  const replay = useMemo(() => rebuildProfile(sessions, settings), [sessions, settings]);
  const active = useMemo(() => sessions.find((s) => s.state === 'active'), [sessions]);

  const ctxFor = useCallback(
    (variantId: string): VariantContext => ({
      state: replay.profile.variants[variantId],
      cfg: resolveConfig(settings, variantId),
    }),
    [replay, settings],
  );

  const value: AppValue = {
    sessions,
    exercises,
    variants,
    settings,
    replay,
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
    habits,
    setHabits,
    activities,
    answerActivity,
    removeActivity,
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
        <p>Impossible d’ouvrir la base de données de l’appareil. Vérifiez que le navigateur n’est pas en navigation privée.</p>
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
