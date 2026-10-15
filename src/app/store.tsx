import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Exercise, Session } from '../domain/types';
import { rebuildProfile, resolveConfig, type EngineSettings, type ReplayResult } from '../engine';
import { buildEngineSettings, indexVariants, type VariantRef } from '../library/catalog';
import { exerciseHasHistory } from '../library/edit';
import { DEFAULT_RECAP_SETTINGS, sanitizeRecapSettings, type WeeklyRecapSettings } from '../analysis/weekly';
import type { RemovedPerformance, VariantContext } from '../session/ops';
import { openAppDb, Repository, requestPersistence, type PersistState } from '../storage/db';

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
  /** Remplacement global, après confirmation explicite uniquement. */
  replace?: boolean;
}

function upsert<T extends { id: string }>(list: readonly T[], items: readonly T[]): T[] {
  const byId = new Map(items.map((x) => [x.id, x]));
  const next = list.map((x) => byId.get(x.id) ?? x);
  for (const x of items) if (!list.some((y) => y.id === x.id)) next.push(x);
  return next;
}

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

  const sessionsRef = useRef<Session[]>([]);
  const failedIds = useRef(new Set<string>());
  const undoCounter = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const repo = new Repository(await openAppDb());
        await repo.ensureSeed();
        const [loadedSessions, loadedExercises, exportedAt, recap] = await Promise.all([
          repo.loadSessions(),
          repo.loadExercises(),
          repo.getMeta<number>('lastExportAt'),
          repo.getMeta<unknown>('weeklyRecap'),
        ]);
        if (cancelled) return;
        sessionsRef.current = loadedSessions;
        setSessions(loadedSessions);
        setExercises(loadedExercises);
        setLastExportAt(exportedAt ?? null);
        setRecapState(sanitizeRecapSettings(recap));
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

  const persistSession = useCallback(
    async (session: Session): Promise<boolean> => {
      if (!repo) return false;
      setSave({ kind: 'saving' });
      try {
        await repo.putSession(session);
        failedIds.current.delete(session.id);
        setSave(failedIds.current.size > 0 ? { kind: 'error' } : { kind: 'saved' });
        return true;
      } catch (error) {
        console.error('[MyFitApp] échec d’enregistrement', error);
        failedIds.current.add(session.id);
        setSave({ kind: 'error' });
        return false;
      }
    },
    [repo],
  );

  const commit = useCallback(
    (next: Session, undoLabel?: string) => {
      const previous = sessionsRef.current.find((s) => s.id === next.id);
      const list = previous
        ? sessionsRef.current.map((s) => (s.id === next.id ? next : s))
        : [...sessionsRef.current, next];
      sessionsRef.current = list;
      setSessions(list);
      // Toute nouvelle modification remplace la précédente possibilité d'annulation :
      // annuler ne doit jamais défaire une action plus récente (ni rouvrir une séance terminée).
      setUndo(undoLabel && previous ? { id: ++undoCounter.current, label: undoLabel, previous } : null);
      return persistSession(next);
    },
    [persistSession],
  );

  const retrySave = useCallback(() => {
    for (const id of [...failedIds.current]) {
      const latest = sessionsRef.current.find((s) => s.id === id);
      if (latest) void persistSession(latest);
    }
  }, [persistSession]);

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
      const list = data.replace ? [...data.sessions] : upsert(sessionsRef.current, data.sessions);
      if (data.replace) failedIds.current.clear();
      sessionsRef.current = list;
      setSessions(list);
      setExercises((current) => (data.replace ? [...data.exercises] : upsert(current, data.exercises)));
      // Une annulation ne doit jamais défaire un import.
      setUndo(null);
      setLastFinish(null);
      return true;
    },
    [repo],
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
      setExercises((current) => upsert(current, list));
      setSave(failedIds.current.size > 0 ? { kind: 'error' } : { kind: 'saved' });
      return true;
    },
    [repo],
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
      setExercises((current) => current.filter((e) => e.id !== exercise.id));
      return true;
    },
    [repo],
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
      sessionsRef.current = list;
      setSessions(list);
      failedIds.current.delete(id);
      setUndo(null);
      return true;
    },
    [repo],
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
