import { unwrap, type DBSchema, type IDBPTransaction, type StoreNames } from 'idb';

/**
 * Durabilité stricte : une écriture n'est annoncée comme faite qu'une fois sur le disque (§12),
 * même si Android ferme l'appli ou le navigateur juste après.
 */
export const STRICT = { durability: 'strict' } as const;

/**
 * Validation explicite d'une transaction (IndexedDB 3.0), appelée dès la dernière requête émise.
 * Sans elle, la transaction attend un aller-retour avec la page avant de se valider : une appli fermée
 * juste après une saisie l'annulait (mesuré : 10 séries perdues sur 10). Sans effet si le navigateur ne la connaît pas.
 */
export function commitNow<D extends DBSchema, S extends StoreNames<D>[]>(tx: IDBPTransaction<D, S, 'readwrite'>): void {
  const native = unwrap(tx);
  if (typeof native.commit === 'function') native.commit();
}
