import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Exercise, Session } from '../domain/types';
import { SEED_EXERCISES } from '../library/seed';

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
    await Promise.all([...exercises.map((e) => tx.store.put(e)), tx.done]);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.get('meta', key)) as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    const tx = this.db.transaction('meta', 'readwrite');
    await Promise.all([tx.store.put(value, key), tx.done]);
  }

  /** Installe la bibliothèque initiale au premier lancement uniquement : les modifications ultérieures sont conservées. */
  async ensureSeed(): Promise<void> {
    if (await this.getMeta<boolean>('seeded')) return;
    const tx = this.db.transaction(['exercises', 'meta'], 'readwrite');
    const store = tx.objectStore('exercises');
    const existing = new Set(await store.getAllKeys());
    await Promise.all([
      ...SEED_EXERCISES.filter((e) => !existing.has(e.id)).map((e) => store.put(e)),
      tx.objectStore('meta').put(true, 'seeded'),
      tx.done,
    ]);
  }

  close(): void {
    this.db.close();
  }
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
