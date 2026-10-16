/**
 * Repère de progression (§5.3.1) : la cible a changé depuis la dernière séance sur l'exercice-variante.
 * Dérivé de la recommandation du moteur et de la dernière performance réelle ; aucune règle nouvelle.
 */
import type { ProgressState } from './progression';

export interface TargetShape {
  plannedSets: number;
  targetReps: number;
}

export type ProgressMarker =
  /** Hausse de répétitions au même poids : « +1 répétition : 3×9 (au lieu de 3×8) ». */
  | { kind: 'reps_up'; added: number; from: TargetShape; to: TargetShape }
  /** Changement de charge recommandé (§7.6, §7.8). */
  | { kind: 'weight_up' | 'weight_down' };

/** Repère à afficher, ou null quand la cible ne change pas (palier conservé, exercice jamais réalisé). */
export function progressMarker(state: ProgressState | undefined): ProgressMarker | null {
  if (!state) return null;
  const rec = state.recommendation;
  if (rec.kind === 'weight_up' || rec.kind === 'weight_down') return { kind: rec.kind };
  const last = state.lastPerformance;
  if (rec.kind === 'reps_up' && rec.targetReps > last.targetReps) {
    return {
      kind: 'reps_up',
      added: rec.targetReps - last.targetReps,
      from: { plannedSets: last.plannedSets, targetReps: last.targetReps },
      to: { plannedSets: rec.plannedSets, targetReps: rec.targetReps },
    };
  }
  return null;
}
