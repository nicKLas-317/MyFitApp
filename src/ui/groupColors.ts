import type { CSSProperties } from 'react';
import type { Exercise, MuscleGroup } from '../domain/types';

/** Groupes qui ont une couleur propre ; les sous-groupes des jambes prennent celle des jambes. */
export type ColorGroup = 'epaules' | 'triceps' | 'dos' | 'pectoraux' | 'biceps' | 'jambes' | 'abdominaux';

/**
 * Couleur fixe de chaque groupe musculaire (§3.2) : la seule définition de cette correspondance. Les teintes sont les
 * jetons de styles.css (couleurs vives et claires, jamais vert, orange ni rouge, réservés aux statuts).
 */
export const GROUP_COLORS: Readonly<Record<ColorGroup, string>> = {
  epaules: '--frame-1', // jaune
  pectoraux: '--frame-2', // cyan
  triceps: '--frame-3', // bleu clair
  dos: '--frame-4', // mauve / violet
  biceps: '--frame-5', // rose / magenta
  jambes: '--frame-white', // blanc
  abdominaux: '--frame-grey', // gris clair
};

/** Groupe dont un groupe musculaire prend la couleur. */
const COLOR_GROUP: Readonly<Record<MuscleGroup, ColorGroup>> = {
  epaules: 'epaules',
  pectoraux: 'pectoraux',
  triceps: 'triceps',
  dos: 'dos',
  biceps: 'biceps',
  jambes: 'jambes',
  quadriceps: 'jambes',
  'ischio-jambiers': 'jambes',
  mollets: 'jambes',
  fessiers: 'jambes',
  adducteurs: 'jambes',
  abdominaux: 'abdominaux',
};

export function colorGroupOf(group: MuscleGroup): ColorGroup {
  return COLOR_GROUP[group];
}

/**
 * Attributs d'un élément coloré selon le groupe : `data-group-color` (le cadre prend cette couleur au lieu de
 * l'alternance, §3.1) et la variable `--group-color` (bordure du cadre, fond du pictogramme).
 */
export function groupColorProps(group: MuscleGroup): { 'data-group-color': ColorGroup; style: CSSProperties } {
  const color = colorGroupOf(group);
  return { 'data-group-color': color, style: { '--group-color': `var(${GROUP_COLORS[color]})` } as CSSProperties };
}

/** Les mêmes attributs pour un exercice connu ; rien pour un exercice introuvable. */
export function exerciseColorProps(exercise: Exercise | undefined): Partial<ReturnType<typeof groupColorProps>> {
  return exercise ? groupColorProps(exercise.primaryGroup) : {};
}

/**
 * Écran lié à des exercices de plusieurs groupes (séance, détail et récapitulatif d'une séance, historique, bilan,
 * bibliothèque) : les cadres qui ne concernent pas un exercice précis sont neutres, jamais d'une couleur de groupe.
 */
export const NEUTRAL_FRAMES = { 'data-neutral-frames': '' } as const;
