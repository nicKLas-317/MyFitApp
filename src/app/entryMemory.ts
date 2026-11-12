/**
 * Mémoire d'un écran liée à son entrée d'historique (version 1.48.0) : quitter un écran vers une fiche puis revenir
 * (bouton « ‹ » ou retour d'Android) le retrouve exactement comme il était (saisie en cours ; la position de défilement
 * est suivie par la navigation, `scrollOnOpen`) ; le rouvrir autrement (onglet, accueil, lien) le montre neuf.
 * Rien n'est enregistré dans la base.
 */
import { useState } from 'react';
import { entryKey } from './navigation';

const memories = new Map<string, { key: string; value: unknown }>();

/**
 * Objet modifiable propre à l'écran `name` et à l'entrée d'historique courante : le même objet est rendu en revenant
 * à cette entrée, un objet neuf (`initial`) à toute autre ouverture.
 */
export function useEntryMemory<T extends object>(name: string, initial: () => T): T {
  const [value] = useState(() => {
    const key = entryKey();
    const kept = memories.get(name);
    if (kept?.key === key) return kept.value as T;
    const fresh = initial();
    memories.set(name, { key, value: fresh });
    return fresh;
  });
  return value;
}
