import type { Exercise, Variant, VariantConfig } from '../domain/types';
import { DEFAULT_VARIANT_CONFIG, type EngineSettings } from '../engine';

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
export function displayName(ref: VariantRef | undefined): string {
  if (!ref) return 'Exercice inconnu';
  return ref.variant.id === ref.exercise.id ? ref.exercise.name : `${ref.exercise.name} — ${ref.variant.name}`;
}

/** Réglages du moteur dérivés des réglages spécifiques des variantes (§7.2, §14). */
export function buildEngineSettings(exercises: readonly Exercise[]): EngineSettings {
  const overrides: Record<string, Partial<VariantConfig>> = {};
  for (const e of exercises) {
    for (const v of e.variants) if (v.config) overrides[v.id] = v.config;
  }
  return { defaults: DEFAULT_VARIANT_CONFIG, overrides };
}
