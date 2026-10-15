/**
 * Gestion de la bibliothèque (§4.3, §14) : fonctions pures qui renvoient de nouvelles versions des exercices.
 * Les identifiants sont stables : renommer ou modifier les métadonnées ne touche jamais à l'historique,
 * qui est rattaché à l'identifiant de la variante.
 */
import type { Exercise, MuscleGroup, Session, Variant, VariantConfig } from '../domain/types';
import { DEFAULT_VARIANT_CONFIG } from '../engine';
import { normalizeName } from './text';

/** Matériel proposé à la saisie ; le champ reste libre pour les données importées. */
export const EQUIPMENT_OPTIONS = ['machine', 'poulie', 'haltères', 'barre', 'poids du corps', 'autre'] as const;

export function slug(name: string): string {
  return normalizeName(name).replace(/ /g, '-') || 'exercice';
}

/** Identifiant libre dérivé de `base` (« base », « base-2 »…), réservé dans `taken`. */
export function uniqueId(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

export function allIds(exercises: readonly Exercise[]): Set<string> {
  return new Set(exercises.flatMap((e) => [e.id, ...e.variants.map((v) => v.id)]));
}

/** Liste saisie librement : virgules, points-virgules ou retours à la ligne ; doublons retirés. */
export function parseList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const item = raw.trim().replace(/\s+/g, ' ');
    const key = normalizeName(item);
    if (!item || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Un exercice-variante a un historique dès qu'une séance, terminée ou en cours, l'utilise. */
export function variantHasHistory(variantId: string, sessions: readonly Session[]): boolean {
  return sessions.some((s) => s.performances.some((p) => p.variantId === variantId));
}

export function exerciseHasHistory(exercise: Exercise, sessions: readonly Session[]): boolean {
  return exercise.variants.some((v) => variantHasHistory(v.id, sessions));
}

export interface ExerciseInput {
  name: string;
  synonyms: string[];
  primaryGroup: MuscleGroup | null;
  secondaryGroups: MuscleGroup[];
  equipment: string;
}

export type ExerciseInputError = 'name_missing' | 'name_taken' | 'group_missing';

export function validateExerciseInput(input: ExerciseInput, exercises: readonly Exercise[], selfId?: string): ExerciseInputError[] {
  const errors: ExerciseInputError[] = [];
  const name = normalizeName(input.name);
  if (!name) errors.push('name_missing');
  else if (exercises.some((e) => e.id !== selfId && normalizeName(e.name) === name)) errors.push('name_taken');
  if (!input.primaryGroup) errors.push('group_missing');
  return errors;
}

function cleanInput(input: ExerciseInput): Omit<ExerciseInput, 'primaryGroup'> & { primaryGroup: MuscleGroup } {
  if (!input.primaryGroup) throw new Error('Groupe musculaire requis');
  return {
    name: input.name.trim().replace(/\s+/g, ' '),
    synonyms: input.synonyms,
    primaryGroup: input.primaryGroup,
    secondaryGroups: input.secondaryGroups.filter((g) => g !== input.primaryGroup),
    equipment: input.equipment.trim(),
  };
}

/** Nouvel exercice personnalisé, avec sa variante standard (même identifiant que l'exercice). */
export function createExercise(input: ExerciseInput, exercises: readonly Exercise[]): Exercise {
  const clean = cleanInput(input);
  const id = uniqueId(`perso-${slug(clean.name)}`, allIds(exercises));
  return { id, ...clean, archived: false, variants: [{ id, name: 'Standard', synonyms: [], archived: false }] };
}

/** Modifie les métadonnées d'un exercice ; identifiant, variantes et historique sont conservés. */
export function updateExercise(exercise: Exercise, input: ExerciseInput): Exercise {
  return { ...exercise, ...cleanInput(input) };
}

export function updateVariant(exercise: Exercise, variantId: string, patch: Partial<Omit<Variant, 'id'>>): Exercise {
  return { ...exercise, variants: exercise.variants.map((v) => (v.id === variantId ? { ...v, ...patch } : v)) };
}

export type VariantNameError = 'name_missing' | 'name_taken';

export function validateVariantName(exercise: Exercise, name: string, selfId?: string): VariantNameError | null {
  const n = normalizeName(name);
  if (!n) return 'name_missing';
  if (exercise.variants.some((v) => v.id !== selfId && normalizeName(v.name) === n)) return 'name_taken';
  return null;
}

/** Ajoute une variante : historique distinct, identifiant `<exercice>--<nom>`. */
export function addVariant(exercise: Exercise, name: string, exercises: readonly Exercise[]): { exercise: Exercise; variantId: string } {
  const id = uniqueId(`${exercise.id}--${slug(name)}`, allIds(exercises));
  const variant: Variant = { id, name: name.trim().replace(/\s+/g, ' '), synonyms: [], archived: false };
  return { exercise: { ...exercise, variants: [...exercise.variants, variant] }, variantId: id };
}

/** Supprime une variante sans historique. La variante standard ne se supprime qu'avec l'exercice. */
export function removeVariant(exercise: Exercise, variantId: string): Exercise {
  if (variantId === exercise.id) throw new Error('La variante standard ne se supprime qu’avec l’exercice');
  return { ...exercise, variants: exercise.variants.filter((v) => v.id !== variantId) };
}

export type ConfigError = 'sets' | 'range';

/** Réglages spécifiques (§7.2) : nombre de séries entre 1 et 10, plage de répétitions cohérente. */
export function validateConfig(cfg: VariantConfig): ConfigError[] {
  const errors: ConfigError[] = [];
  if (!Number.isInteger(cfg.sets) || cfg.sets < 1 || cfg.sets > 10) errors.push('sets');
  if (!Number.isInteger(cfg.minReps) || !Number.isInteger(cfg.maxReps) || cfg.minReps < 1 || cfg.maxReps < cfg.minReps || cfg.maxReps > 50) {
    errors.push('range');
  }
  return errors;
}

/** Ne conserve que les valeurs qui diffèrent des réglages par défaut ; aucune différence = pas de réglage spécifique. */
export function compactConfig(cfg: VariantConfig): Partial<VariantConfig> | undefined {
  const out: Partial<VariantConfig> = {};
  for (const k of ['sets', 'minReps', 'maxReps'] as const) if (cfg[k] !== DEFAULT_VARIANT_CONFIG[k]) out[k] = cfg[k];
  if (cfg.assisted) out.assisted = true;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function setVariantConfig(exercise: Exercise, variantId: string, cfg: VariantConfig): Exercise {
  const compact = compactConfig(cfg);
  return {
    ...exercise,
    variants: exercise.variants.map((v) => {
      if (v.id !== variantId) return v;
      const { config: _old, ...rest } = v;
      return compact ? { ...rest, config: compact } : rest;
    }),
  };
}
