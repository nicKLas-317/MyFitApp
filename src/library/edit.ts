/**
 * Gestion de la bibliothèque (§4.3, §14) : fonctions pures qui renvoient de nouvelles versions des exercices.
 * Les identifiants sont stables : renommer ou modifier les métadonnées ne touche jamais à l'historique,
 * qui est rattaché à l'identifiant de la variante.
 */
import type { Exercise, MuscleGroup, Session, Variant, VariantConfig } from '../domain/types';
import { BODYWEIGHT_RANGE, DEFAULT_VARIANT_CONFIG, homeRange, SECONDS_RANGE } from '../engine';
import { GRIPS, gripOf, MEDIUM_GRIP, normalizeName } from './text';

/** Matériel proposé à la saisie ; le champ reste libre pour les données importées. */
export const EQUIPMENT_OPTIONS = ['machine', 'poulie', 'haltères', 'barre', 'kettlebell', 'poids du corps', 'autre'] as const;

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

/**
 * Nouvel exercice personnalisé, avec sa variante standard (même identifiant que l'exercice) ; `config` : son type et sa
 * plage choisis à la création (version 1.31.0).
 */
export function createExercise(input: ExerciseInput, exercises: readonly Exercise[], config?: VariantConfig): Exercise {
  const clean = cleanInput(input);
  const id = uniqueId(`perso-${slug(clean.name)}`, allIds(exercises));
  const exercise: Exercise = { id, ...clean, archived: false, variants: [{ id, name: 'Standard', synonyms: [], archived: false }] };
  return config ? setVariantConfig(exercise, id, config) : exercise;
}

/**
 * Type d'un exercice-variante (version 1.31.0) : à charge (kg), au poids du corps (répétitions) ou en durée (secondes).
 * Figé dès que la variante a un historique : les performances enregistrées ne sont pas comparables d'un type à l'autre.
 */
export type ExerciseKind = 'load' | 'bodyweight' | 'seconds';

export const EXERCISE_KINDS: readonly { kind: ExerciseKind; label: string }[] = [
  { kind: 'load', label: 'Charge (kg)' },
  { kind: 'bodyweight', label: 'Poids du corps (répétitions)' },
  { kind: 'seconds', label: 'Durée (secondes)' },
];

/** Plage par défaut de chaque type : 8 à 12 répétitions, 10 à 40 répétitions, 20 à 60 s. */
export const KIND_RANGES: Readonly<Record<ExerciseKind, { minReps: number; maxReps: number }>> = {
  load: { minReps: DEFAULT_VARIANT_CONFIG.minReps, maxReps: DEFAULT_VARIANT_CONFIG.maxReps },
  bodyweight: BODYWEIGHT_RANGE,
  seconds: SECONDS_RANGE,
};

export function kindOf(cfg: Pick<VariantConfig, 'bodyweight' | 'seconds'>): ExerciseKind {
  return cfg.seconds ? 'seconds' : cfg.bodyweight ? 'bodyweight' : 'load';
}

/** Réglages d'un type : au poids du corps et en durée, sans charge ni aide (un exercice en durée est au poids du corps). */
export function kindFlags(kind: ExerciseKind): Pick<VariantConfig, 'bodyweight' | 'seconds'> {
  return { ...(kind !== 'load' ? { bodyweight: true } : {}), ...(kind === 'seconds' ? { seconds: true } : {}) };
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
  // Une même prise écrite autrement (« prise large » = « Prise très large ») ; la prise moyenne est la variante standard.
  const grip = gripOf(name);
  if (grip && exercise.variants.some((v) => v.id !== selfId && variantGrip(exercise, v) === grip)) return 'name_taken';
  return null;
}

/** Prise d'une variante (§4.3.1) : celle de son nom ; la variante standard est en prise moyenne. */
export function variantGrip(exercise: Exercise, variant: Variant): string | null {
  return gripOf(variant.name) ?? (variant.id === exercise.id ? MEDIUM_GRIP : null);
}

/**
 * Un exercice qui reçoit une prise devient « à prise » (§4.3.1) : sa variante standard, si elle s'appelle encore
 * « Standard », prend le nom « Prise moyenne ». Identifiant et historique ne changent pas.
 */
export function withMediumGrip(exercise: Exercise): Exercise {
  return {
    ...exercise,
    variants: exercise.variants.map((v) => (v.id === exercise.id && v.name === 'Standard' ? { ...v, name: MEDIUM_GRIP } : v)),
  };
}

/** Ajoute une variante : historique distinct, identifiant `<exercice>--<nom>`. Une prise prend son nom de référence. */
export function addVariant(exercise: Exercise, name: string, exercises: readonly Exercise[]): { exercise: Exercise; variantId: string } {
  const grip = gripOf(name);
  const label = grip ?? name.trim().replace(/\s+/g, ' ');
  const id = uniqueId(`${exercise.id}--${slug(label)}`, allIds(exercises));
  const variant: Variant = { id, name: label, synonyms: [], archived: false };
  const next = { ...exercise, variants: [...exercise.variants, variant] };
  return { exercise: grip ? withMediumGrip(next) : next, variantId: id };
}

/**
 * Rend un exercice « à prise » : prise moyenne pour la variante standard, prises très large et serrée ajoutées
 * si aucune variante (même archivée) n'a déjà cette prise. Rien n'est supprimé ni renommé d'autre.
 */
export function addGrips(exercise: Exercise, exercises: readonly Exercise[]): Exercise {
  let next = withMediumGrip(exercise);
  const taken = allIds(exercises);
  for (const grip of GRIPS) {
    if (next.variants.some((v) => variantGrip(next, v) === grip)) continue;
    const id = uniqueId(`${exercise.id}--${slug(grip)}`, taken);
    next = { ...next, variants: [...next.variants, { id, name: grip, synonyms: [], archived: false }] };
  }
  return next;
}

/**
 * Variantes apportées par une version de la bibliothèque à un exercice existant (version 8 : mollets assis, extension
 * triceps poulie à la barre). La variante standard prend son nom si elle s'appelle encore « Standard », et les
 * synonymes de ce nom s'ajoutent aux siens ; une variante n'est ajoutée que si aucune variante (même archivée) ne
 * porte déjà son identifiant ou son nom. Identifiants, synonymes appris et historique sont conservés.
 */
export function addSeedVariants(
  exercise: Exercise,
  spec: { standard: { name: string; synonyms: readonly string[] }; others: readonly { suffix: string; name: string; synonyms: readonly string[] }[] },
): Exercise {
  const known = (v: Variant) => normalizeName(v.name);
  const variants = exercise.variants.map((v) => {
    if (v.id !== exercise.id || v.name !== 'Standard') return v;
    const synonyms = [...v.synonyms];
    for (const s of spec.standard.synonyms) if (!synonyms.some((x) => normalizeName(x) === normalizeName(s))) synonyms.push(s);
    return { ...v, name: spec.standard.name, synonyms };
  });
  for (const other of spec.others) {
    const id = `${exercise.id}--${other.suffix}`;
    if (variants.some((v) => v.id === id || known(v) === normalizeName(other.name))) continue;
    variants.push({ id, name: other.name, synonyms: [...other.synonyms], archived: false });
  }
  return { ...exercise, variants };
}

/** Supprime une variante sans historique. La variante standard ne se supprime qu'avec l'exercice. */
export function removeVariant(exercise: Exercise, variantId: string): Exercise {
  if (variantId === exercise.id) throw new Error('La variante standard ne se supprime qu’avec l’exercice');
  return { ...exercise, variants: exercise.variants.filter((v) => v.id !== variantId) };
}

export type ConfigError = 'sets' | 'range' | 'home_range';

/** Réglages spécifiques (§7.2) : nombre de séries entre 1 et 10, plage de répétitions cohérente. */
export function validateConfig(cfg: VariantConfig): ConfigError[] {
  const errors: ConfigError[] = [];
  if (!Number.isInteger(cfg.sets) || cfg.sets < 1 || cfg.sets > 10) errors.push('sets');
  // Plage en secondes (gainage) jusqu'à 10 minutes ; en répétitions jusqu'à 50.
  const ceiling = cfg.seconds ? 600 : 50;
  const badRange = (min: number, max: number) => !Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > ceiling;
  if (badRange(cfg.minReps, cfg.maxReps)) errors.push('range');
  // Plage de la maison (exercice à charge, version 1.26.0).
  if (!cfg.bodyweight && (cfg.homeMinReps !== undefined || cfg.homeMaxReps !== undefined)) {
    const { minReps, maxReps } = homeRange(cfg);
    if (badRange(minReps, maxReps)) errors.push('home_range');
  }
  return errors;
}

/**
 * Ne conserve que les valeurs qui diffèrent des réglages par défaut ; aucune différence = pas de réglage spécifique.
 * Exercice au poids du corps : la plage par défaut est celle du poids du corps (10 à 40) ; en secondes, 20 à 60 s.
 */
export function compactConfig(cfg: VariantConfig): Partial<VariantConfig> | undefined {
  const out: Partial<VariantConfig> = {};
  const range = cfg.seconds ? SECONDS_RANGE : cfg.bodyweight ? BODYWEIGHT_RANGE : {};
  const defaults = { ...DEFAULT_VARIANT_CONFIG, ...range };
  if (cfg.bodyweight || cfg.seconds) out.bodyweight = true;
  if (cfg.seconds) out.seconds = true;
  for (const k of ['sets', 'minReps', 'maxReps'] as const) if (cfg[k] !== defaults[k]) out[k] = cfg[k];
  if (cfg.assisted) out.assisted = true;
  // Cible de départ : gardée si elle est dans la plage et n'en est pas la borne basse.
  if (cfg.startReps !== undefined && cfg.startReps > cfg.minReps && cfg.startReps <= cfg.maxReps) out.startReps = cfg.startReps;
  // Plage de la maison : gardée seulement si elle diffère de celle par défaut (exercice à charge).
  if (!cfg.bodyweight) {
    const byDefault = homeRange({ minReps: cfg.minReps, maxReps: cfg.maxReps });
    const home = homeRange(cfg);
    if (home.minReps !== byDefault.minReps) out.homeMinReps = home.minReps;
    if (home.maxReps !== byDefault.maxReps) out.homeMaxReps = home.maxReps;
  }
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
