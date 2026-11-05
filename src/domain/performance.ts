/** Ce qui compte dans une performance (version 1.41.3), une seule définition. */
import type { Performance } from './types';

/**
 * Une performance compte comme du travail sur ses groupes (récapitulatif, bilans, nom de séance, « la veille » de la
 * séance pour compléter la semaine) si au moins une série est enregistrée ; une performance partielle importée (poids
 * sans répétitions, §7.11 H) compte aussi. Un exercice sans aucune série ne compte jamais (§5.6).
 */
export function countsAsWork(p: Pick<Performance, 'reps' | 'partial'>): boolean {
  return p.reps.length > 0 || !!p.partial;
}
