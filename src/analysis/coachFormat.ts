/**
 * Export « coach » (§19.13) : mise en forme des valeurs (heures, jours, ressentis, types d'exercice, charges, cibles,
 * recommandations), version 1.50.1 : découpé de coach.ts, sans changement de comportement.
 */
import { parseIsoDay } from '../domain/calendar';
import type { Feeling, MuscleGroup, VariantConfig } from '../domain/types';
import type { ProgressState } from '../engine';
import type { VariantRef } from '../library/catalog';
import { perDumbbell } from '../library/search';
import { MUSCLE_GROUP_LABELS } from '../library/seed';
import { formatLoad, formatSetsReps } from '../session/format';

const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' });

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const pad = (n: number) => String(n).padStart(2, '0');
export const clock = (ts: number) => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const weekday = (date: string) => WEEKDAY.format(parseIsoDay(date));
export const groupLabel = (g: MuscleGroup) => MUSCLE_GROUP_LABELS[g];

export const FEELINGS: Record<Feeling, string> = {
  tres_bien: 'très bien',
  bien: 'bien',
  moyen: 'moyen',
  mal: 'mal',
  tres_mal: 'très mal',
  inconnu: 'non renseigné',
};

export type CoachType = 'charge' | 'haltères' | 'assisté' | 'poids du corps' | 'durée';

export function typeOf(cfg: VariantConfig, ref: VariantRef | undefined): CoachType {
  if (cfg.seconds) return 'durée';
  if (cfg.bodyweight) return 'poids du corps';
  if (cfg.assisted) return 'assisté';
  return perDumbbell(ref) ? 'haltères' : 'charge';
}

/** Charge sous une clé explicite : aucune pour le poids du corps et la durée. */
export function loadField(type: CoachType, kg: number): Record<string, number> {
  if (type === 'charge') return { charge_kg: kg };
  if (type === 'haltères') return { charge_kg_par_haltere: kg };
  if (type === 'assisté') return { aide_kg: kg };
  return {};
}

/** « 3 × 9 à 73 kg », « 3 × 9 avec 23 kg d’aide », « 3 × 9 à 12 kg / haltère », « 3 × 25 », « 3 × 45 s ». */
export function targetText(sets: number, reps: number, kg: number, type: CoachType): string {
  const load = type === 'poids du corps' || type === 'durée' ? '' : formatLoad(kg, type === 'assisté', type === 'haltères');
  return `${formatSetsReps(sets, reps, type === 'durée')}${load}`;
}

/** Recommandation du moteur, en mots. */
export function recommendationText(state: ProgressState, type: CoachType): string {
  const rec = state.recommendation;
  const step = rec.targetReps - state.palier.targetReps;
  const unit = type === 'durée' ? ' s' : step > 1 || step < -1 ? ' répétitions' : ' répétition';
  switch (rec.kind) {
    case 'reps_up':
      return `+${step}${unit}`;
    case 'reps_down':
      return `−${-step}${unit}`;
    case 'weight_up':
      return type === 'assisté' ? 'moins d’aide' : 'poids supérieur';
    case 'weight_down':
      return type === 'assisté' ? 'plus d’aide' : 'poids inférieur';
    case 'ceiling':
      return 'plafond atteint : garder le palier';
    default:
      return 'garder le palier';
  }
}

/** Prochaine cible : avec la charge du palier, ou « poids supérieur, puis 3 × 8 » (la charge est à choisir). */
export function nextTargetText(state: ProgressState, type: CoachType): string {
  const rec = state.recommendation;
  if (rec.kind === 'weight_up' || rec.kind === 'weight_down') return `${recommendationText(state, type)}, puis ${formatSetsReps(rec.plannedSets, rec.targetReps, type === 'durée')}`;
  return targetText(rec.plannedSets, rec.targetReps, state.palier.weightKg, type);
}

/** Plage du suivi (celle de la maison pour le suivi de la maison). */
export function rangeText(cfg: Pick<VariantConfig, 'minReps' | 'maxReps'>, type: CoachType): string {
  return type === 'durée' ? `${cfg.minReps} à ${cfg.maxReps} s` : `${cfg.minReps} à ${cfg.maxReps} répétitions`;
}
