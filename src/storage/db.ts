import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { commitNow, STRICT } from './commit';
import type { Exercise, Session } from '../domain/types';
import {
  SEED_ADDITIONS,
  SEED_EXERCISES,
  SEED_GRIP_EXERCISES,
  SEED_GROUP_UPDATES,
  SEED_UPDATES,
  SEED_VARIANT_UPDATES,
  SEED_VERSION,
  redefineSeedExercise,
  sameGroups,
  sameNaming,
} from '../library/seed';
import { addGrips, addSeedVariants } from '../library/edit';
import { fixPlusEqualFeelings } from '../transfer/feelings';

/** Correction « += » → Moyen déjà appliquée à cette base. */
const PLUS_EQUAL_FIX_KEY = 'plusEqualFeelingFixed';

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

  /** Enregistre une séance, validée aussitôt (`commitNow`) et écrite sur le disque avant d'être annoncée. */
  async putSession(session: Session): Promise<void> {
    const tx = this.db.transaction('sessions', 'readwrite', STRICT);
    const done = Promise.all([tx.store.put(session), tx.done]);
    commitNow(tx);
    await done;
  }

  async deleteSession(id: string): Promise<void> {
    const tx = this.db.transaction('sessions', 'readwrite', STRICT);
    const done = Promise.all([tx.store.delete(id), tx.done]);
    commitNow(tx);
    await done;
  }

  loadExercises(): Promise<Exercise[]> {
    return this.db.getAll('exercises');
  }

  async putExercises(exercises: readonly Exercise[]): Promise<void> {
    const tx = this.db.transaction('exercises', 'readwrite', STRICT);
    const writes: Promise<unknown>[] = [];
    try {
      for (const e of exercises) writes.push(tx.store.put(e));
    } catch (error) {
      abortQuietly(tx, writes);
      throw error;
    }
    const done = Promise.all([...writes, tx.done]);
    commitNow(tx);
    await done;
  }

  async deleteExercise(id: string): Promise<void> {
    const tx = this.db.transaction('exercises', 'readwrite', STRICT);
    const done = Promise.all([tx.store.delete(id), tx.done]);
    commitNow(tx);
    await done;
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.get('meta', key)) as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    const tx = this.db.transaction('meta', 'readwrite', STRICT);
    const done = Promise.all([tx.store.put(value, key), tx.done]);
    commitNow(tx);
    await done;
  }

  /**
   * Enregistre un import en une seule transaction (§11.10, §12) : soit tout est écrit, soit rien.
   * `replace` vide d'abord séances et exercices ; l'appelant ne le demande qu'après confirmation explicite.
   * Les activités habituelles (méta « activities ») et la séance prévue (méta « plan ») sont écrites dans la même
   * transaction.
   */
  async applyImport(data: {
    sessions: readonly Session[];
    exercises: readonly Exercise[];
    /** Liste complète des activités habituelles (réponses) après l'import, écrite dans la même transaction. */
    activities?: readonly unknown[];
    /** Séance prévue après l'import (null : aucune) ; absente : inchangée. */
    plan?: unknown;
    replace?: boolean;
  }): Promise<void> {
    const tx = this.db.transaction(['sessions', 'exercises', 'meta'], 'readwrite', STRICT);
    const sessions = tx.objectStore('sessions');
    const exercises = tx.objectStore('exercises');
    const writes: Promise<unknown>[] = [];
    try {
      if (data.replace) writes.push(sessions.clear(), exercises.clear());
      for (const e of data.exercises) writes.push(exercises.put(e));
      for (const s of data.sessions) writes.push(sessions.put(s));
      if (data.activities) writes.push(tx.objectStore('meta').put([...data.activities], 'activities'));
      if (data.plan !== undefined) writes.push(tx.objectStore('meta').put(data.plan, 'plan'));
    } catch (error) {
      abortQuietly(tx, writes);
      throw error;
    }
    const done = Promise.all([...writes, tx.done]);
    commitNow(tx);
    await done;
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
    // Noms et synonymes corrigés par une version, seulement s'ils n'ont pas été personnalisés.
    // Seuls le nom et les synonymes de l'exercice changent : identifiant, variantes et historique restent.
    const updates = new Map<string, Exercise>();
    if (version > 0) {
      for (const [v, changes] of Object.entries(SEED_UPDATES)) {
        if (Number(v) <= version) continue;
        for (const [id, change] of Object.entries(changes)) {
          const { from, to } = change;
          const current = updates.get(id) ?? (await store.get(id));
          if (!current) continue;
          // Exercice redéfini (version 9) : toujours corrigé, synonymes ajoutés par l'utilisateur et nom personnalisé gardés.
          if (change.redefine) updates.set(id, redefineSeedExercise(current, change));
          else if (sameNaming(current, from)) updates.set(id, { ...current, name: to.name, synonyms: [...to.synonyms] });
        }
      }
      // Groupes secondaires corrigés, seulement s'ils n'ont pas été personnalisés.
      for (const [v, changes] of Object.entries(SEED_GROUP_UPDATES)) {
        if (Number(v) <= version) continue;
        for (const [id, { from, to }] of Object.entries(changes)) {
          const current = updates.get(id) ?? (await store.get(id));
          if (current && sameGroups(current.secondaryGroups, from)) updates.set(id, { ...current, secondaryGroups: [...to] });
        }
      }
      // Exercices devenus « à prise » : prise moyenne pour la variante standard, prises manquantes ajoutées une fois.
      const all = await store.getAll();
      for (const [v, ids] of Object.entries(SEED_GRIP_EXERCISES)) {
        if (Number(v) <= version) continue;
        for (const id of ids) {
          const current = updates.get(id) ?? all.find((e) => e.id === id);
          if (current) updates.set(id, addGrips(current, [...all, ...updates.values()]));
        }
      }
      // Variantes ajoutées à un exercice existant (mollets assis, extension poulie à la barre), une seule fois.
      for (const [v, changes] of Object.entries(SEED_VARIANT_UPDATES)) {
        if (Number(v) <= version) continue;
        for (const [id, spec] of Object.entries(changes)) {
          const current = updates.get(id) ?? all.find((e) => e.id === id);
          if (!current) continue;
          const next = addSeedVariants(current, spec);
          if (next !== current && JSON.stringify(next) !== JSON.stringify(current)) updates.set(id, next);
        }
      }
    }
    await Promise.all([
      ...wanted.filter((e) => !existing.has(e.id)).map((e) => store.put(e)),
      ...[...updates.values()].map((e) => store.put(e)),
      tx.objectStore('meta').put(true, 'seeded'),
      tx.objectStore('meta').put(SEED_VERSION, 'seedVersion'),
      tx.done,
    ]);
  }

  /**
   * Correction unique (§7.3) : les performances « += » enregistrées avec un autre ressenti que Moyen
   * passent à Moyen, dans une seule transaction. Le profil, dérivé des séances, est recalculé au chargement.
   * Renvoie le nombre de séances corrigées.
   */
  async ensurePlusEqualFix(): Promise<number> {
    const tx = this.db.transaction(['sessions', 'meta'], 'readwrite', STRICT);
    const meta = tx.objectStore('meta');
    if ((await meta.get(PLUS_EQUAL_FIX_KEY)) === true) {
      await tx.done;
      return 0;
    }
    const fixed = fixPlusEqualFeelings(await tx.objectStore('sessions').getAll());
    const done = Promise.all([...fixed.map((s) => tx.objectStore('sessions').put(s)), meta.put(true, PLUS_EQUAL_FIX_KEY), tx.done]);
    commitNow(tx);
    await done;
    return fixed.length;
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
