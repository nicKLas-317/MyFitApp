/**
 * Groupes musculaires (version 1.41.3) : listes de référence et rattachement des sous-groupes des jambes, définis une
 * seule fois. Aucune dépendance hors des types.
 */
import type { MuscleGroup } from './types';

/** Tous les groupes, dans l'ordre de la bibliothèque (choix des groupes d'un exercice, sauvegarde). */
export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  'dos', 'pectoraux', 'epaules', 'biceps', 'triceps', 'jambes', 'quadriceps', 'ischio-jambiers', 'mollets', 'fessiers', 'adducteurs', 'abdominaux',
];

/** Tous les groupes, dans l'ordre de référence du récapitulatif hebdomadaire (§19.6). */
export const RECAP_GROUP_ORDER: readonly MuscleGroup[] = [
  'pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'quadriceps', 'ischio-jambiers', 'mollets', 'fessiers', 'adducteurs', 'abdominaux',
];

/** Sous-groupes des jambes (§4.2.1) : comptés dans « Jambes » quand ils ne sont pas affichés eux-mêmes. */
export const LEG_SUBGROUPS: readonly MuscleGroup[] = ['quadriceps', 'ischio-jambiers', 'mollets', 'fessiers', 'adducteurs'];

/**
 * Les sept groupes principaux, sans les sous-groupes des jambes, dans l'ordre du récapitulatif : choix du récapitulatif,
 * groupes d'une activité, bilan par groupe (§19.10).
 */
export const MAIN_GROUPS: readonly MuscleGroup[] = RECAP_GROUP_ORDER.filter((g) => !LEG_SUBGROUPS.includes(g));

/** Groupe principal d'un groupe : « jambes » pour un sous-groupe des jambes, le groupe lui-même sinon. */
export function parentGroup(group: MuscleGroup): MuscleGroup {
  return LEG_SUBGROUPS.includes(group) ? 'jambes' : group;
}

/**
 * Groupe du récapitulatif (et de la suggestion) où compte un groupe : lui-même s'il est affiché, sinon « jambes » pour
 * un sous-groupe des jambes quand « jambes » est affiché ; null sinon.
 */
export function recapGroupOf(group: MuscleGroup | undefined, shown: ReadonlySet<MuscleGroup>): MuscleGroup | null {
  if (!group) return null;
  if (shown.has(group)) return group;
  const parent = parentGroup(group);
  return parent !== group && shown.has(parent) ? parent : null;
}
