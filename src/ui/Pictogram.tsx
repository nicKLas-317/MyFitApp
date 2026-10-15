import type { Exercise } from '../domain/types';
import { equipmentKey } from '../library/search';

/**
 * Pictogrammes embarqués (§4.0.1) : faute d'illustrations sous licence vérifiable, un pictogramme
 * SVG simple par type de matériel, sur un fond teinté selon le groupe musculaire principal.
 * Dessins originaux, sans ressource externe.
 */
const EQUIPMENT_PATHS: Record<string, string> = {
  // Haltère : barre courte et deux disques.
  haltere: 'M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10',
  // Barre : longue barre, disques larges.
  barre: 'M2 12h20M5 6v12M8 8v8M16 8v8M19 6v12',
  // Poulie : roue, câble et poignée.
  poulie: 'M12 3a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5M12 8v9M8 17h8M9 17l-1 3M15 17l1 3',
  // Machine : cadre et pile de charges.
  machine: 'M5 3h14v18H5zM12 3v7M8 12h8M8 15h8M8 18h8',
  // Poids du corps : silhouette.
  'poids du corps': 'M12 3a2 2 0 1 0 0 4a2 2 0 1 0 0-4M12 7v7M7 10h10M12 14l-4 6M12 14l4 6',
  autre: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M9 12h6',
};

const EQUIPMENT_LABELS: Record<string, string> = {
  haltere: 'haltères',
  barre: 'barre',
  poulie: 'poulie',
  machine: 'machine',
  'poids du corps': 'poids du corps',
  autre: 'autre matériel',
};

export function ExercisePicto({ exercise, large = false }: { exercise: Exercise; large?: boolean }) {
  const key = equipmentKey(exercise.equipment);
  const path = EQUIPMENT_PATHS[key] ?? EQUIPMENT_PATHS.autre!;
  return (
    <span className={`picto picto-${exercise.primaryGroup}${large ? ' large' : ''}`} aria-hidden="true" title={EQUIPMENT_LABELS[key] ?? exercise.equipment}>
      <svg viewBox="0 0 24 24">
        <path d={path} />
      </svg>
    </span>
  );
}

export function equipmentLabel(exercise: Exercise): string {
  const key = equipmentKey(exercise.equipment);
  return EQUIPMENT_LABELS[key] ?? exercise.equipment;
}
