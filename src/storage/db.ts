import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Exercise, Session } from '../domain/types';
import { SEED_ADDITIONS, SEED_EXERCISES, SEED_VERSION } from '../library/seed';

/**
 * Base d'entraînement. Le suivi corporel (§20) aura sa propre base, séparée.
 * Toute évolution de structure passe par une nouvelle version et une migration dans `upgrade`.
 */
export const DB_NAME = 'myfitapp';
export const DB_VERSION = 1;

interface FitSchema extends DBSchema {
  sessions: { key: string; value: Session; indexes: { byState: string } };
  exercises: { key: string; value: Exercise };
  meta: { key: string; value: unknown };
}

export type FitDb = IDBPDatabase<FitSchema>;

export function openAppDb(name: string = DB_NAME): Promise<FitDb> {
  return openDB<FitSchema>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('byState', 'state');
        db.createObjectStore('exercises', { keyPath: 'id' });
        db.createObjectStore('meta');
      }
    },
  });
}

/**
 * Accès aux données. Chaque écriture attend la validation de la transaction (`tx.done`) :
 * une promesse résolue signifie que la donnée est réellement enregistrée.
 */
export class Repository {
  constructor(private readonly db: FitDb) {}

  loadSessions(): Promise<Session[]> {
    return this.db.getAll('sessions');
  }

  async putSession(session: Session): Promise<void> {
    const tx = this.db.transaction('sessions', 'readwrite');
    await Promise.all([tx.store.put(session), tx.done]);
  }

  async deleteSession(id: string): Promise<void> {
    const tx = this.db.transaction('sessions', 'readwrite');
    await Promise.all([tx.store.delete(id), tx.done]);
  }

  loadExercises(): Promise<Exercise[]> {
    return this.db.getAll('exercises');
  }

  async putExercises(exercises: readonly Exercise[]): Promise<void> {
    const tx = this.db.transaction('exercises', 'readwrite');
    const writes: Promise<unknown>[] = [];
    try {
      for (const e of exercises) writes.push(tx.store.put(e));
    } catch (error) {
      abortQuietly(tx, writes);
      throw error;
    }
    await Promise.all([...writes, tx.done]);
  }

  async deleteExercise(id: string): Promise<void> {
    const tx = this.db.transaction('exercises', 'readwrite');
    await Promise.all([tx.store.delete(id), tx.done]);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.get('meta', key)) as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    const tx = this.db.transaction('meta', 'readwrite');
    await Promise.all([tx.store.put(value, key), tx.done]);
  }

  /**
   * Enregistre un import en une seule transaction (§11.10, §12) : soit tout est écrit, soit rien.
   * `replace` vide d'abord séances et exercices ; l'appelant ne le demande qu'après confirmation explicite.
   */
  async applyImport(data: { sessions: readonly Session[]; exercises: readonly Exercise[]; replace?: boolean }): Promise<void> {
    const tx = this.db.transaction(['sessions', 'exercises'], 'readwrite');
    const sessions = tx.objectStore('sessions');
    const exercises = tx.objectStore('exercises');
    const writes: Promise<unknown>[] = [];
    try {
      if (data.replace) writes.push(sessions.clear(), exercises.clear());
      for (const e of data.exercises) writes.push(exercises.put(e));
      for (const s of data.sessions) writes.push(sessions.put(s));
    } catch (error) {
      abortQuietly(tx, writes);
      throw error;
    }
    await Promise.all([...writes, tx.done]);
  }

  /**
   * Installe la bibliothèque initiale au premier lancement, puis les exercices ajoutés par chaque nouvelle
   * version (une seule fois). Les modifications et suppressions ultérieures sont conservées.
   */
  async ensureSeed(): Promise<void> {
    const seeded = await this.getMeta<boolean>('seeded');
    const version = seeded ? ((await this.getMeta<number>('seedVersion')) ?? 1) : 0;
    if (version >= SEED_VERSION) return;
    const wanted =
      version === 0
        ? SEED_EXERCISES
        : SEED_EXERCISES.filter((e) => Object.entries(SEED_ADDITIONS).some(([v, ids]) => Number(v) > version && ids.includes(e.id)));
    const tx = this.db.transaction(['exercises', 'meta'], 'readwrite');
    const store = tx.objectStore('exercises');
    const existing = new Set(await store.getAllKeys());
    await Promise.all([
      ...wanted.filter((e) => !existing.has(e.id)).map((e) => store.put(e)),
      tx.objectStore('meta').put(true, 'seeded'),
      tx.objectStore('meta').put(SEED_VERSION, 'seedVersion'),
      tx.done,
    ]);
  }

  close(): void {
    this.db.close();
  }
}

/**
 * Annule une transaction après une erreur levée en préparant les écritures (enregistrement
 * invalide) : sans cela, les écritures déjà lancées seraient validées.
 */
function abortQuietly(tx: { abort(): void; done: Promise<void> }, writes: readonly Promise<unknown>[]): void {
  for (const w of writes) w.catch(() => undefined);
  tx.done.catch(() => undefined);
  tx.abort();
}

export type PersistState = 'granted' | 'denied' | 'unsupported';

/** Demande un stockage persistant au navigateur (§12). */
export async function requestPersistence(): Promise<PersistState> {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!storage?.persist || !storage.persisted) return 'unsupported';
  try {
    if (await storage.persisted()) return 'granted';
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
