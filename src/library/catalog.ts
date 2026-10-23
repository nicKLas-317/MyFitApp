import type { Exercise, Variant, VariantConfig } from '../domain/types';
import { DEFAULT_VARIANT_CONFIG, type EngineSettings } from '../engine';
import { GRIPS, gripOf } from './text';

export interface VariantRef {
  exercise: Exercise;
  variant: Variant;
}

/** Index des exercices-variantes par identifiant de variante. */
export function indexVariants(exercises: readonly Exercise[]): Map<string, VariantRef> {
  const map = new Map<string, VariantRef>();
  for (const exercise of exercises) {
    for (const variant of exercise.variants) map.set(variant.id, { exercise, variant });
  }
  return map;
}

/** Nom affiché : nom de l'exercice, suivi de la variante si ce n'est pas la variante standard. */
/** Nom de variante à afficher : null pour la variante standard sans nom propre (« Standard »). */
export function variantLabel(ref: VariantRef): string | null {
  // La variante standard n'est nommée que si elle porte un nom (« Prise moyenne » d'un exercice à prise, §4.3.1).
  return ref.variant.id === ref.exercise.id && ref.variant.name === 'Standard' ? null : ref.variant.name;
}

export function displayName(ref: VariantRef | undefined): string {
  if (!ref) return 'Exercice inconnu';
  const label = variantLabel(ref);
  return label ? `${ref.exercise.name} — ${label}` : ref.exercise.name;
}

/** Réglages du moteur dérivés des réglages spécifiques des variantes (§7.2, §14). */
export function buildEngineSettings(exercises: readonly Exercise[]): EngineSettings {
  const overrides: Record<string, Partial<VariantConfig>> = {};
  for (const e of exercises) {
    for (const v of e.variants) if (v.config) overrides[v.id] = v.config;
  }
  return { defaults: DEFAULT_VARIANT_CONFIG, overrides };
}

/** Entrée d'une liste d'exercices : un exercice-variante, ou les prises d'un même exercice regroupées (§4.3.1). */
export type GripEntry<T extends { ref: VariantRef }> = { kind: 'single'; item: T } | { kind: 'grips'; exercise: Exercise; items: T[] };

/**
 * Regroupement d'affichage des prises (§4.3.1) : les variantes de prise d'un même exercice (au moins deux dans la
 * liste) forment une seule entrée, à la place de la première, prises dans l'ordre très large, moyenne, serrée.
 * Chaque variante reste un exercice-variante distinct (données, moteur) ; les autres variantes ne sont pas regroupées.
 */
export function groupGrips<T extends { ref: VariantRef }>(list: readonly T[]): GripEntry<T>[] {
  const grips = new Map<string, T[]>();
  for (const l of list) if (gripOf(l.ref.variant.name)) grips.set(l.ref.exercise.id, [...(grips.get(l.ref.exercise.id) ?? []), l]);
  const rank = (x: T) => GRIPS.indexOf(gripOf(x.ref.variant.name)!);
  const out: GripEntry<T>[] = [];
  for (const l of list) {
    const group = grips.get(l.ref.exercise.id);
    if (!group || group.length < 2 || !gripOf(l.ref.variant.name)) out.push({ kind: 'single', item: l });
    else if (group[0] === l) out.push({ kind: 'grips', exercise: l.ref.exercise, items: [...group].sort((a, b) => rank(a) - rank(b)) });
  }
  return out;
}
