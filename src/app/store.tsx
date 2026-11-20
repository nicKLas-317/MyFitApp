import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Exercise, Session } from '../domain/types';
import { CARDIO_MACHINES_VERSION } from '../cardio/model';
import { rebuildProfile, resolveConfig, trackKey } from '../engine';
import { buildEngineSettings, indexVariants } from '../library/catalog';
import { exerciseHasHistory } from '../library/edit';
import { computeRecords } from '../analysis/records';
import type { VariantContext } from '../session/ops';
import { currentPlan } from '../plan/model';
import { openAppDb, Repository, requestPersistence, type PersistState } from '../storage/db';
import { PendingWrites } from '../storage/pending';
import type { AppValue, FinishInfo, ImportData, SaveStatus, UndoEntry } from './appTypes';
import { loadStored, sameVersions, upsert, type StoredData } from './stored';
import { useStoredMeta } from './useStoredMeta';

// Types de l'état de l'appli (découpage de la version 1.48.2) : `appTypes.ts`.
export type { AppValue, FinishInfo, ImportData, SaveStatus, UndoEntry } from './appTypes';

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

  const sessionsRef = useRef<Session[]>([]);
  const pending = useRef(new PendingWrites<Session>());
  const undoCounter = useRef(0);
  /** Nombre de modifications locales : une relecture de la base commencée avant l'une d'elles est périmée. */
  const localChanges = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);

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

  const meta = useStoredMeta(writeMeta, localChanges);
  const { storedPlan, setStoredPlan, applyStoredMeta, applyImportedMeta } = meta;

  /**
   * Applique ce qui vient d'être lu dans la base, hors séances (bibliothèque, réglages, activités, séance prévue,
   * mémoire de l'appareil) : au lancement, et à chaque relecture (autre fenêtre, retour au premier plan, §12).
   * Une valeur inchangée garde son objet, pour ne rien redessiner.
   */
  const applyStored = useCallback(
    (stored: StoredData) => {
      setExercises((current) => (JSON.stringify(current) === JSON.stringify(stored.exercises) ? current : stored.exercises));
      applyStoredMeta(stored);
    },
    [applyStoredMeta],
  );

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

        // §12 : stockage persistant demandé à chaque lancement tant qu'il n'est pas accordé (version 1.56.0 : avant,
        // une seule fois, au premier lancement, souvent dans un onglet avant l'installation de l'appli, où Chrome le
        // refuse ; il n'était plus jamais redemandé). Chrome ne pose aucune question : il accorde ou refuse seul.
        const state = await requestPersistence();
        if (!cancelled) setPersist(state);
      } catch (error) {
        if (!cancelled) setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      applyImportedMeta(data);
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
    [repo, announce, applyImportedMeta],
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

  /** Redemande le stockage persistant (§12, version 1.56.0) : bouton des réglages, et après chaque séance terminée. */
  const askPersistence = useCallback(async (): Promise<PersistState> => {
    const state = await requestPersistence();
    setPersist(state);
    return state;
  }, []);
  const doneCount = sessions.filter((s) => s.state === 'done').length;
  const lastDoneCount = useRef(0);
  useEffect(() => {
    // Une séance de plus terminée (ou importée) : l'engagement a augmenté, Chrome peut accorder ce qu'il a refusé.
    if (doneCount > lastDoneCount.current && persist !== null && persist !== 'granted') void askPersistence();
    lastDoneCount.current = doneCount;
  }, [doneCount]);

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
    askPersistence,
    undo,
    lastFinish,
    ...meta.values,
    plan,
    ctxFor,
    commit,
    retrySave,
    applyUndo,
    dismissUndo,
    setLastFinish,
    importData,
    saveExercises,
    deleteExercise,
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
