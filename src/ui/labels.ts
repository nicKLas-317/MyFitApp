import type { Feeling, Status } from '../domain/types';
import type { Recommendation } from '../engine';

export const FEELINGS: { value: Exclude<Feeling, 'inconnu'>; label: string }[] = [
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

/** Prochaine cible lisible : « 3 × 9 », « Poids supérieur · 3 × 8 ». */
export function formatRecommendation(rec: Recommendation): string {
  const target = `${rec.plannedSets} × ${rec.targetReps}`;
  if (rec.kind === 'weight_up') return `Poids supérieur · ${target}`;
  if (rec.kind === 'weight_down') return `Poids inférieur · ${target}`;
  return target;
}
