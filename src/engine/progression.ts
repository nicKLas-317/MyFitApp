import type { Status, VariantConfig } from '../domain/types';
import { GREEN_STREAK_TO_PROGRESS, RED_STREAK_TO_DECREASE } from './config';
import { computeStatus, isComplete, type EvaluablePerformance } from './status';
import { compareWeight } from './weight';

/** Palier : couple (poids, cible de répétitions) d'un exercice-variante (§7.1). */
export interface Palier {
  weightKg: number;
  targetReps: number;
}

/**
 * - `start` : exercice jamais réalisé, saisir le poids de départ (§5.3).
 * - `keep` : conserver le palier.
 * - `reps_up` : même poids, cible + 1 (§7.5).
 * - `weight_up` / `weight_down` : poids supérieur / inférieur, sans valeur (§7.6, §7.8).
 *   `targetReps` est alors la cible à appliquer avec la nouvelle charge.
 */
export type RecommendationKind = 'start' | 'keep' | 'reps_up' | 'weight_up' | 'weight_down';

export interface Recommendation {
  kind: RecommendationKind;
  targetReps: number;
  plannedSets: number;
}

/** État de progression d'un exercice-variante (§9). Donnée dérivée de l'historique. */
export interface ProgressState {
  variantId: string;
  palier: Palier;
  /** Validations vertes standard consécutives au palier actuel (§7.5). */
  greenStreak: number;
  /** Séances rouges consécutives au même poids (§7.8, §7.11 E). */
  redStreak: number;
  lastStatus: Status;
  lastPerformance: EvaluablePerformance;
  lastSessionId: string;
  recommendation: Recommendation;
}

/**
 * Nature de la séance par rapport à la recommandation :
 * - `first` : première performance de l'exercice-variante (§7.11 G).
 * - `follow` : palier actuel ou recommandation suivie.
 * - `refusal` : palier actuel refait alors qu'un changement était recommandé (§7.11 D).
 * - `manual_weight` : changement de charge non recommandé (§7.11 B).
 * - `manual_target` : cible choisie hors palier actuel et hors recommandation (§7.11 C).
 */
export type Decision = 'first' | 'follow' | 'refusal' | 'manual_weight' | 'manual_target';

export interface Evaluation {
  sessionId: string;
  variantId: string;
  status: Status;
  standard: boolean;
  /** La séance compte comme validation (verte et standard). */
  validation: boolean;
  decision: Decision;
  /** État après cette performance. */
  palier: Palier;
  greenStreak: number;
  redStreak: number;
  recommendation: Recommendation;
}

type Counters = Pick<ProgressState, 'palier' | 'greenStreak' | 'redStreak'>;

/** Prochaine recommandation, selon la priorité du §7.10. */
export function recommend(state: Counters | undefined, cfg: VariantConfig): Recommendation {
  const plannedSets = cfg.sets;
  if (!state) return { kind: 'start', targetReps: cfg.minReps, plannedSets };
  const { palier } = state;
  if (state.redStreak >= RED_STREAK_TO_DECREASE) {
    return { kind: 'weight_down', targetReps: palier.targetReps, plannedSets };
  }
  if (state.greenStreak >= GREEN_STREAK_TO_PROGRESS) {
    // §7.11 I : jamais de cible au-delà de la borne haute.
    if (palier.targetReps >= cfg.maxReps) {
      return { kind: 'weight_up', targetReps: cfg.minReps, plannedSets };
    }
    return { kind: 'reps_up', targetReps: palier.targetReps + 1, plannedSets };
  }
  return { kind: 'keep', targetReps: palier.targetReps, plannedSets };
}

/**
 * Cible attendue pour une séance faite à la charge saisie (§7.7, §7.11 A).
 * C'est la cible à proposer dès que l'utilisateur saisit son poids.
 */
export function expectedTarget(
  state: ProgressState | undefined,
  weightKg: number,
  cfg: VariantConfig,
): number {
  if (!state) return cfg.minReps;
  const cmp = compareWeight(weightKg, state.palier.weightKg);
  if (cmp > 0) return cfg.minReps;
  if (cmp < 0) return state.palier.targetReps;
  const rec = recommend(state, cfg);
  return rec.kind === 'reps_up' ? rec.targetReps : state.palier.targetReps;
}

/**
 * Applique une performance évaluable à l'état d'un exercice-variante.
 * Fonction pure : ne modifie ni `prev` ni `perf`.
 */
export function applyPerformance(
  prev: ProgressState | undefined,
  perf: EvaluablePerformance,
  sessionId: string,
  cfg: VariantConfig,
): { state: ProgressState; evaluation: Evaluation } {
  const status = computeStatus(perf);
  const complete = isComplete(perf);
  const isGreen = status === 'vert';
  const isRed = status === 'rouge';
  const standardShape = complete && perf.plannedSets === cfg.sets;
  const performedPalier: Palier = { weightKg: perf.weightKg, targetReps: perf.targetReps };

  let decision: Decision;
  let standard: boolean;
  let palier: Palier;
  let greenStreak: number;
  let redStreak: number;

  if (!prev) {
    // §7.11 G : la première performance fixe le palier de départ.
    decision = 'first';
    standard =
      standardShape && perf.targetReps >= cfg.minReps && perf.targetReps <= cfg.maxReps;
    palier = performedPalier;
    greenStreak = standard && isGreen ? 1 : 0;
    redStreak = isRed ? 1 : 0;
  } else {
    const rec = recommend(prev, cfg);
    const weightCmp = compareWeight(perf.weightKg, prev.palier.weightKg);

    if (weightCmp !== 0) {
      // Nouveau poids : nouveau palier, compteurs repartant de 0 (§7.5, §7.8).
      const recommendedWeight =
        (weightCmp > 0 && rec.kind === 'weight_up') ||
        (weightCmp < 0 && rec.kind === 'weight_down');
      const onTarget = perf.targetReps === expectedTarget(prev, perf.weightKg, cfg);
      decision = !recommendedWeight ? 'manual_weight' : onTarget ? 'follow' : 'manual_target';
      standard = decision === 'follow' && standardShape;
      palier = performedPalier;
      greenStreak = standard && isGreen ? 1 : 0;
      redStreak = isRed ? 1 : 0;
    } else {
      // Même poids : le compteur de rouges continue (§7.8, §7.11 E et F).
      redStreak = isRed ? prev.redStreak + 1 : complete ? 0 : prev.redStreak;

      if (perf.targetReps === prev.palier.targetReps) {
        // Palier actuel refait : conforme si rien d'autre n'était recommandé, sinon refus (§7.11 D).
        decision = rec.kind === 'keep' ? 'follow' : 'refusal';
        standard = decision === 'follow' && standardShape;
        palier = prev.palier;
        if (standard && isGreen) greenStreak = prev.greenStreak + 1;
        else if (isGreen) greenStreak = prev.greenStreak; // verte non standard : ni gain ni remise à 0 (§7.7)
        else greenStreak = 0;
      } else if (rec.kind === 'reps_up' && perf.targetReps === rec.targetReps) {
        decision = 'follow';
        standard = standardShape;
        palier = performedPalier;
        greenStreak = standard && isGreen ? 1 : 0;
      } else {
        // §7.11 C : cible choisie manuellement.
        decision = 'manual_target';
        standard = false;
        palier = performedPalier;
        greenStreak = 0;
      }
    }
  }

  const counters: Counters = { palier, greenStreak, redStreak };
  const recommendation = recommend(counters, cfg);
  const state: ProgressState = {
    variantId: perf.variantId,
    ...counters,
    lastStatus: status,
    lastPerformance: { ...perf, reps: [...perf.reps] },
    lastSessionId: sessionId,
    recommendation,
  };
  const evaluation: Evaluation = {
    sessionId,
    variantId: perf.variantId,
    status,
    standard,
    validation: standard && isGreen,
    decision,
    palier,
    greenStreak,
    redStreak,
    recommendation,
  };
  return { state, evaluation };
}
