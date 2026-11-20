/**
 * Plan d'import d'une sauvegarde native (§11.10) : fusion par défaut, remplacement global sur confirmation
 * (version 1.55.1 : découpé de backup.ts, sans changement de comportement).
 */
import type { Exercise, Session, Variant } from '../domain/types';
import { SEED_EXERCISES, sameGroups, sameNaming, seedNamings, seedSecondaryGroups } from '../library/seed';
import { normalizeName } from '../library/text';
import { findDuplicates } from './draft';
import type { Backup } from './backupFormat';
import { isObj } from './jsonGuards';

export type ImportMode = 'merge' | 'replace';

export interface ImportPlan {
  mode: ImportMode;
  /** Séances à enregistrer. */
  sessions: Session[];
  /** Exercices à enregistrer (nouveaux ou complétés). */
  exercises: Exercise[];
  /** Déjà présentes à l'identique : ignorées. */
  identical: Session[];
  /** Même identifiant, contenu différent : la version locale est conservée. */
  conflicts: Session[];
  /** Même contenu sous un autre identifiant : importées seulement après confirmation (§11.9). */
  duplicates: Session[];
  /** Séance en cours importée alors qu'une autre est en cours sur l'appareil : ignorée. */
  skippedActive: Session[];
  /** Exercices modifiés des deux côtés : la version de l'appareil est conservée (synonymes et variantes ajoutés). */
  exerciseConflicts: Exercise[];
  /** Variantes de la sauvegarde rattachées localement à un autre exercice : import impossible. */
  blocking: string[];
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    isObj(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v,
  );
}

function union(a: readonly string[], b: readonly string[]): string[] {
  const seen = new Set(a.map(normalizeName));
  return [...a, ...b.filter((s) => !seen.has(normalizeName(s)) && seen.add(normalizeName(s)))];
}

/** Fusionne deux versions d'un exercice : `base` prime, synonymes et variantes s'additionnent. */
function mergeExercise(base: Exercise, other: Exercise): Exercise {
  const variants: Variant[] = base.variants.map((v) => {
    const same = other.variants.find((x) => x.id === v.id);
    return same ? { ...v, synonyms: union(v.synonyms, same.synonyms) } : v;
  });
  for (const v of other.variants) if (!variants.some((x) => x.id === v.id)) variants.push(v);
  return { ...base, synonyms: union(base.synonyms, other.synonyms), variants };
}

/** L'exercice local est celui de la bibliothèque initiale, jamais modifié sur l'appareil (un favori ne compte pas). */
function isPristine(local: Exercise): boolean {
  const seed = SEED_EXERCISES.find((e) => e.id === local.id);
  const withoutFavorites = { ...local, variants: local.variants.map(({ favorite: _f, ...v }) => v) };
  return seed !== undefined && stable(seed) === stable(withoutFavorites);
}

/**
 * L'exercice importé n'a que des métadonnées de la bibliothèque initiale, actuelles ou d'une version
 * antérieure (ex. « Élévations latérales » avant la séparation haltères / machine, presse à cuisses avec les
 * ischio-jambiers avant la version 5) : il n'apporte
 * que ses variantes et ses synonymes appris, jamais d'anciens noms ou synonymes.
 */
function isSeedExercise(imported: Exercise): boolean {
  const seed = SEED_EXERCISES.find((e) => e.id === imported.id);
  if (!seed || !seedNamings(seed.id).some((n) => sameNaming(n, imported))) return false;
  const config = (e: Exercise) => e.variants.find((v) => v.id === e.id)?.config ?? null;
  return (
    imported.primaryGroup === seed.primaryGroup &&
    seedSecondaryGroups(seed.id).some((g) => sameGroups(g, imported.secondaryGroups)) &&
    imported.equipment === seed.equipment &&
    imported.archived === seed.archived &&
    stable(config(imported)) === stable(config(seed))
  );
}

/**
 * Prépare l'import d'une sauvegarde native. Par défaut, fusion : aucune donnée créée ou modifiée
 * sur l'appareil n'est supprimée ni remplacée (§11.10). Le remplacement global n'est appliqué qu'avec `mode: 'replace'`,
 * que l'interface ne propose qu'après confirmation explicite.
 */
export function planImport(
  backup: Backup,
  local: { sessions: readonly Session[]; exercises: readonly Exercise[] },
  options: { mode: ImportMode; includeDuplicates?: boolean },
): ImportPlan {
  const plan: ImportPlan = {
    mode: options.mode,
    sessions: [],
    exercises: [],
    identical: [],
    conflicts: [],
    duplicates: [],
    skippedActive: [],
    exerciseConflicts: [],
    blocking: [],
  };
  if (options.mode === 'replace') {
    plan.sessions = [...backup.sessions];
    plan.exercises = [...backup.exercises];
    return plan;
  }

  const localVariantOwner = new Map(local.exercises.flatMap((e) => e.variants.map((v) => [v.id, e.id] as const)));
  for (const imported of backup.exercises) {
    for (const v of imported.variants) {
      const owner = localVariantOwner.get(v.id);
      if (owner !== undefined && owner !== imported.id) {
        plan.blocking.push(`La variante ${v.id} appartient ici à l’exercice ${owner} et là-bas à ${imported.id}.`);
      }
    }
    const existing = local.exercises.find((e) => e.id === imported.id);
    if (!existing) {
      plan.exercises.push(imported);
      continue;
    }
    // Un exercice jamais modifié ici reprend la version importée (nom, réglages…) ;
    // un exercice modifié ici est conservé, et la divergence est signalée.
    const keepLocal = mergeExercise(existing, imported);
    const importedFirst = mergeExercise(imported, existing);
    // Les favoris de l'appareil sont conservés.
    const takeImported = {
      ...importedFirst,
      variants: importedFirst.variants.map((v) => (existing.variants.find((x) => x.id === v.id)?.favorite ? { ...v, favorite: true } : v)),
    };
    // Exercice de la bibliothèque initiale, éventuellement d'une version antérieure : seuls ses variantes
    // et ses synonymes appris sont repris, le nom et les synonymes de l'appareil restent.
    const fromSeed = { ...keepLocal, synonyms: existing.synonyms };
    const merged = isSeedExercise(imported) ? fromSeed : isPristine(existing) ? takeImported : keepLocal;
    if (merged === keepLocal && stable(keepLocal) !== stable(takeImported)) plan.exerciseConflicts.push(imported);
    if (stable(merged) !== stable(existing)) plan.exercises.push(merged);
  }

  const localById = new Map(local.sessions.map((s) => [s.id, s]));
  const localActive = local.sessions.find((s) => s.state === 'active');
  const accepted: Session[] = [];
  for (const s of backup.sessions) {
    const same = localById.get(s.id);
    if (same) {
      if (stable(same) === stable(s)) plan.identical.push(s);
      else plan.conflicts.push(s);
      continue;
    }
    if (s.state === 'active' && localActive) {
      plan.skippedActive.push(s);
      continue;
    }
    if (s.state === 'done' && findDuplicates(s, [...local.sessions, ...accepted], null).length > 0) {
      plan.duplicates.push(s);
      if (!options.includeDuplicates) continue;
    }
    accepted.push(s);
  }
  plan.sessions = accepted;
  return plan;
}

/** Une sauvegarde en mode fusion qui n'apporterait rien. */
export function isEmptyPlan(plan: ImportPlan): boolean {
  return plan.sessions.length === 0 && plan.exercises.length === 0;
}
