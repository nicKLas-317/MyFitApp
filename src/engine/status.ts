import type { Performance, Status } from '../domain/types';

/** Performance exploitable par le moteur : cible et séries prévues connues, non partielle. */
export type EvaluablePerformance = Performance & { targetReps: number; plannedSets: number };

/** Un historique partiel (§11.8) est ignoré par le moteur (§7.11 H). */
export function isEvaluable(perf: Performance): perf is EvaluablePerformance {
  return perf.partial !== true && perf.targetReps !== null && perf.plannedSets !== null;
}

/** Séance complète : toutes les séries prévues ont été enregistrées (§7.1). */
export function isComplete(perf: EvaluablePerformance): boolean {
  return perf.reps.length >= perf.plannedSets;
}

/** Statut déterministe d'une performance (§7.4). La première règle applicable l'emporte. */
export function computeStatus(perf: EvaluablePerformance): Status {
  if (!isComplete(perf)) return 'orange';
  const belowTarget = perf.reps.filter((r) => r < perf.targetReps).length;
  if (belowTarget >= 2) return 'rouge';
  if (perf.feeling === 'tres_mal') return 'rouge';
  if (belowTarget === 1) return 'orange';
  if (perf.feeling === 'bien' || perf.feeling === 'tres_bien') return 'vert';
  return 'orange';
}

/** Borne une saisie de répétitions entre 0 et la cible : la cible n'est jamais dépassée (§5.4). */
export function clampReps(value: number, targetReps: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.round(value), 0), targetReps);
}

export type PerformanceError =
  | 'invalid_weight'
  | 'invalid_target'
  | 'invalid_planned_sets'
  | 'invalid_reps'
  | 'reps_above_target'
  | 'too_many_sets';

/**
 * Vérifie qu'une performance respecte les invariants de saisie. Liste vide = valide. Un exercice au poids du corps n'a
 * pas de charge (0) ; tout autre exercice a une charge strictement positive.
 */
export function validatePerformance(perf: Performance, bodyweight = false): PerformanceError[] {
  const errors: PerformanceError[] = [];
  if (bodyweight ? perf.weightKg !== 0 : !Number.isFinite(perf.weightKg) || perf.weightKg <= 0) errors.push('invalid_weight');
  if (!isEvaluable(perf)) return errors;
  if (!Number.isInteger(perf.targetReps) || perf.targetReps < 1) errors.push('invalid_target');
  if (!Number.isInteger(perf.plannedSets) || perf.plannedSets < 1) errors.push('invalid_planned_sets');
  if (perf.reps.some((r) => !Number.isInteger(r) || r < 0)) errors.push('invalid_reps');
  if (perf.reps.some((r) => r > perf.targetReps)) errors.push('reps_above_target');
  if (perf.reps.length > perf.plannedSets) errors.push('too_many_sets');
  return errors;
}
