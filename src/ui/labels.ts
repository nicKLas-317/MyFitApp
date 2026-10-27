import type { Feeling, Status } from '../domain/types';
import type { Palier, ProgressMarker, Recommendation } from '../engine';
import type { RatedFeeling } from '../session/ops';
import { formatKg, formatSetsReps } from '../session/format';

export const FEELINGS: { value: RatedFeeling; label: string }[] = [
  { value: 'tres_mal', label: 'Très mal' },
  { value: 'mal', label: 'Mal' },
  { value: 'moyen', label: 'Moyen' },
  { value: 'bien', label: 'Bien' },
  { value: 'tres_bien', label: 'Très bien' },
];

export const FEELING_LABELS: Record<Feeling, string> = {
  tres_mal: 'Très mal passé',
  mal: 'Mal passé',
  moyen: 'Moyen',
  bien: 'Bien passé',
  tres_bien: 'Très bien passé',
  inconnu: 'Ressenti non renseigné',
};

export const STATUS_LABELS: Record<Status, string> = { vert: 'vert', orange: 'orange', rouge: 'rouge' };

/**
 * Changement de charge recommandé (§7.6, §7.8). Pour un exercice assisté (§7.12), la charge est une aide :
 * une charge plus difficile, c'est moins d'aide.
 */
export function loadChangeLabel(kind: 'weight_up' | 'weight_down', assisted: boolean): string {
  if (assisted) return kind === 'weight_up' ? 'Moins d’aide' : 'Plus d’aide';
  return kind === 'weight_up' ? 'Poids supérieur' : 'Poids inférieur';
}

/** Prochaine cible lisible : « 3 × 9 », « Poids supérieur · 3 × 8 », « Moins d’aide · 3 × 8 », « 3 × 35 s ». */
export function formatRecommendation(rec: Recommendation, assisted = false, seconds = false): string {
  const target = formatSetsReps(rec.plannedSets, rec.targetReps, seconds);
  if (rec.kind === 'weight_up' || rec.kind === 'weight_down') return `${loadChangeLabel(rec.kind, assisted)} · ${target}`;
  return target;
}

/** Flèche du repère de progression (§5.3.1) : vers le haut pour une progression, vers le bas pour une baisse. */
export function markerArrow(marker: ProgressMarker): '↑' | '↓' {
  return marker.kind === 'weight_down' || marker.kind === 'reps_down' ? '↓' : '↑';
}

/**
 * Texte court du repère, sous la cible : « +1 rép. », « +2 rép. », « −1 rép. », « +5 s » (exercice en secondes),
 * « Poids supérieur », « Moins d’aide »…
 */
export function markerLabel(marker: ProgressMarker, assisted = false, seconds = false): string {
  const unit = seconds ? 's' : 'rép.';
  if (marker.kind === 'reps_up') return `+${marker.added} ${unit}`;
  if (marker.kind === 'reps_down') return `−${marker.removed} ${unit}`;
  return loadChangeLabel(marker.kind, assisted);
}

const kgNumber = (kg: number) => kg.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

/**
 * Évolution d'un palier en quelques mots (bilan, §19.3) : « 8 → 9 rép. », « 40 → 45 kg, 12 → 8 rép. », « 30 → 27,5 kg »,
 * « 25 → 30 s » (exercice en secondes).
 */
export function changeText(c: { from: Palier; to: Palier }, seconds = false): string {
  const reps = `${c.from.targetReps} → ${c.to.targetReps} ${seconds ? 's' : 'rép.'}`;
  if (c.from.weightKg === c.to.weightKg) return reps;
  const weight = `${kgNumber(c.from.weightKg)} → ${formatKg(c.to.weightKg)}`;
  return c.from.targetReps === c.to.targetReps ? weight : `${weight}, ${reps}`;
}
