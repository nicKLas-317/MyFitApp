import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { type BodyImportPlan, type BodyTracking, sortWeighIns, type WeighIn } from './model';

/**
 * Base séparée de celle de l'entraînement (§20) : une erreur ici ne peut ni bloquer ni altérer les séances.
 */
export const BODY_DB_NAME = 'myfitapp-corps';
export const BODY_DB_VERSION = 1;

interface BodySchema extends DBSchema {
  weighIns: { key: string; value: WeighIn };
  meta: { key: string; value: unknown };
}

export type BodyDb = IDBPDatabase<BodySchema>;

export function openBodyDb(name: string = BODY_DB_NAME): Promise<BodyDb> {
  return openDB<BodySchema>(name, BODY_DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('weighIns', { keyPath: 'date' });
        db.createObjectStore('meta');
      }
    },
  });
}

export class BodyRepository {
  constructor(private readonly db: BodyDb) {}

  async load(): Promise<BodyTracking> {
    const [weighIns, heightCm] = await Promise.all([this.db.getAll('weighIns'), this.db.get('meta', 'heightCm')]);
    return { heightCm: typeof heightCm === 'number' ? heightCm : null, weighIns: sortWeighIns(weighIns) };
  }

  /** Enregistre une pesée ; `replacedDate` retire l'ancienne date en cas de correction de date (même transaction). */
  async putWeighIn(w: WeighIn, replacedDate?: string): Promise<void> {
    const tx = this.db.transaction('weighIns', 'readwrite');
    const writes: Promise<unknown>[] = [];
    if (replacedDate && replacedDate !== w.date) writes.push(tx.store.delete(replacedDate));
    writes.push(tx.store.put(w));
    await Promise.all([...writes, tx.done]);
  }

  async deleteWeighIn(date: string): Promise<void> {
    const tx = this.db.transaction('weighIns', 'readwrite');
    await Promise.all([tx.store.delete(date), tx.done]);
  }

  async setHeight(heightCm: number | null): Promise<void> {
    const tx = this.db.transaction('meta', 'readwrite');
    await Promise.all([heightCm === null ? tx.store.delete('heightCm') : tx.store.put(heightCm, 'heightCm'), tx.done]);
  }

  /** Applique un import en une transaction. */
  async applyImport(plan: BodyImportPlan): Promise<void> {
    const tx = this.db.transaction(['weighIns', 'meta'], 'readwrite');
    const store = tx.objectStore('weighIns');
    const meta = tx.objectStore('meta');
    const writes: Promise<unknown>[] = [];
    if (plan.replace) writes.push(store.clear());
    for (const w of plan.weighIns) writes.push(store.put(w));
    if (plan.heightCm !== undefined) writes.push(plan.heightCm === null ? meta.delete('heightCm') : meta.put(plan.heightCm, 'heightCm'));
    await Promise.all([...writes, tx.done]);
  }

  close(): void {
    this.db.close();
  }
}
