/** Validation stricte d'une sauvegarde native (version 1.55.1 : découpé de backup.ts, sans changement de comportement). */
import type { Exercise, MuscleGroup, Session } from '../domain/types';
import { cardioBlockErrors } from '../cardio/model';
import { isValidHeight, isValidWeighIn } from '../body/model';
import { activityErrors } from '../activities/model';
import { legacyPlanErrors, migratePlan, planErrors, planExercises, planOriginErrors } from '../plan/model';
import { isIsoDate } from '../session/format';
import { isFeeling } from './feelings';
import { MUSCLE_GROUPS } from '../domain/muscleGroups';
import { APP_ID } from './backupFormat';
import { isInt, isNum, isObj, isStr, isStrArray, type Obj } from './jsonGuards';

function validateVariant(v: unknown, path: string, errors: string[]): void {
  if (!isObj(v)) return void errors.push(`${path} : variante invalide.`);
  if (!isStr(v.id) || !v.id) errors.push(`${path}.id manquant.`);
  if (!isStr(v.name)) errors.push(`${path}.name manquant.`);
  if (!isStrArray(v.synonyms)) errors.push(`${path}.synonyms invalide.`);
  if (typeof v.archived !== 'boolean') errors.push(`${path}.archived invalide.`);
  if (v.favorite !== undefined && typeof v.favorite !== 'boolean') errors.push(`${path}.favorite invalide.`);
  if (v.config !== undefined) {
    if (!isObj(v.config)) errors.push(`${path}.config invalide.`);
    else {
      // Cible de départ (version 1.31.0) : un entier positif, ramené dans la plage à l'usage.
      for (const k of ['sets', 'minReps', 'maxReps', 'startReps']) {
        if (v.config[k] !== undefined && !(isInt(v.config[k]) && (v.config[k] as number) > 0)) errors.push(`${path}.config.${k} invalide.`);
      }
      if (v.config.assisted !== undefined && typeof v.config.assisted !== 'boolean') errors.push(`${path}.config.assisted invalide.`);
      if (v.config.bodyweight !== undefined && typeof v.config.bodyweight !== 'boolean') errors.push(`${path}.config.bodyweight invalide.`);
      // En secondes (gainage) : toujours au poids du corps.
      if (v.config.seconds !== undefined && (typeof v.config.seconds !== 'boolean' || (v.config.seconds && v.config.bodyweight !== true))) {
        errors.push(`${path}.config.seconds invalide.`);
      }
      // Plage de la maison (version 1.26.0).
      for (const k of ['homeMinReps', 'homeMaxReps']) {
        if (v.config[k] !== undefined && !(isInt(v.config[k]) && (v.config[k] as number) > 0)) errors.push(`${path}.config.${k} invalide.`);
      }
      if (isInt(v.config.homeMinReps) && isInt(v.config.homeMaxReps) && v.config.homeMinReps > v.config.homeMaxReps) {
        errors.push(`${path}.config.homeMaxReps invalide.`);
      }
    }
  }
}

function validateExercise(e: unknown, path: string, errors: string[]): void {
  if (!isObj(e)) return void errors.push(`${path} : exercice invalide.`);
  if (!isStr(e.id) || !e.id) errors.push(`${path}.id manquant.`);
  if (!isStr(e.name) || !e.name.trim()) errors.push(`${path}.name manquant.`);
  if (!isStrArray(e.synonyms)) errors.push(`${path}.synonyms invalide.`);
  if (!MUSCLE_GROUPS.includes(e.primaryGroup as MuscleGroup)) errors.push(`${path}.primaryGroup inconnu.`);
  if (!Array.isArray(e.secondaryGroups) || !e.secondaryGroups.every((g) => MUSCLE_GROUPS.includes(g as MuscleGroup))) {
    errors.push(`${path}.secondaryGroups invalide.`);
  }
  if (!isStr(e.equipment)) errors.push(`${path}.equipment invalide.`);
  if (typeof e.archived !== 'boolean') errors.push(`${path}.archived invalide.`);
  if (!Array.isArray(e.variants) || e.variants.length === 0) errors.push(`${path}.variants manquant.`);
  else e.variants.forEach((v, i) => validateVariant(v, `${path}.variants[${i}]`, errors));
}

function validatePerformanceShape(p: unknown, path: string, errors: string[]): void {
  if (!isObj(p)) return void errors.push(`${path} : performance invalide.`);
  if (!isStr(p.variantId)) errors.push(`${path}.variantId manquant.`);
  // 0 seulement pour un exercice au poids du corps (contrôlé avec la bibliothèque, plus bas).
  if (!isNum(p.weightKg) || p.weightKg < 0) errors.push(`${path}.weightKg invalide.`);
  const partial = p.partial === true;
  if (p.partial !== undefined && typeof p.partial !== 'boolean') errors.push(`${path}.partial invalide.`);
  if (!Array.isArray(p.reps) || !p.reps.every((r) => isInt(r) && r >= 0)) errors.push(`${path}.reps invalide.`);
  if (!isFeeling(p.feeling)) errors.push(`${path}.feeling inconnu.`);
  if (p.feelingSymbol !== undefined && !isStr(p.feelingSymbol)) errors.push(`${path}.feelingSymbol invalide.`);
  if (partial) return;
  if (!isInt(p.targetReps) || p.targetReps < 1) errors.push(`${path}.targetReps invalide.`);
  if (!isInt(p.plannedSets) || p.plannedSets < 1) errors.push(`${path}.plannedSets invalide.`);
  if (Array.isArray(p.reps) && isInt(p.targetReps) && p.reps.some((r) => isNum(r) && r > (p.targetReps as number))) {
    errors.push(`${path}.reps dépasse la cible.`);
  }
  if (Array.isArray(p.reps) && isInt(p.plannedSets) && p.reps.length > p.plannedSets) errors.push(`${path}.reps : trop de séries.`);
}

function validateSession(s: unknown, path: string, errors: string[]): void {
  if (!isObj(s)) return void errors.push(`${path} : séance invalide.`);
  if (!isStr(s.id) || !s.id) errors.push(`${path}.id manquant.`);
  if (!isStr(s.name)) errors.push(`${path}.name manquant.`);
  if (!isStr(s.date) || !isIsoDate(s.date)) errors.push(`${path}.date invalide.`);
  for (const k of ['startedAt', 'endedAt'] as const) if (s[k] !== null && !isNum(s[k])) errors.push(`${path}.${k} invalide.`);
  for (const k of ['createdAt', 'updatedAt'] as const) if (!isNum(s[k])) errors.push(`${path}.${k} invalide.`);
  if (s.origin !== 'app' && s.origin !== 'import') errors.push(`${path}.origin invalide.`);
  if (s.state !== 'active' && s.state !== 'done') errors.push(`${path}.state invalide.`);
  if (s.state === 'active' && !isNum(s.startedAt)) errors.push(`${path} : séance en cours sans heure de début.`);
  if (s.sourceText !== undefined && !isStr(s.sourceText)) errors.push(`${path}.sourceText invalide.`);
  if (!Array.isArray(s.performances)) errors.push(`${path}.performances manquant.`);
  else s.performances.forEach((p, i) => validatePerformanceShape(p, `${path}.performances[${i}]`, errors));
  if (s.cardio !== undefined) {
    if (!Array.isArray(s.cardio)) errors.push(`${path}.cardio invalide.`);
    else s.cardio.forEach((b, i) => errors.push(...cardioBlockErrors(b, `${path}.cardio[${i}]`)));
  }
  if (s.fromPlan !== undefined) errors.push(...planOriginErrors(s.fromPlan, `${path}.fromPlan`));
  // Lieu : « maison », ou absent (salle).
  if (s.location !== undefined && s.location !== 'maison') errors.push(`${path}.location invalide.`);
  // Séance complétée (version 1.28.0) : pause en millisecondes ; partie fermée seulement pendant la séance.
  if (s.pauseMs !== undefined && !(isInt(s.pauseMs) && s.pauseMs >= 0)) errors.push(`${path}.pauseMs invalide.`);
  if (s.locked !== undefined) {
    const l = s.locked;
    const ids = (v: unknown) => Array.isArray(v) && v.every(isStr);
    if (s.state !== 'active' || !isObj(l) || !ids(l.variantIds) || !ids(l.cardioIds) || !isNum(l.endedAt) || !(isInt(l.pauseMs) && l.pauseMs >= 0)) {
      errors.push(`${path}.locked invalide.`);
    }
  }
  // Éléments remis à plus tard (version 1.29.0) : seulement pendant la séance.
  if (s.later !== undefined && (s.state !== 'active' || !Array.isArray(s.later) || !s.later.every(isStr))) {
    errors.push(`${path}.later invalide.`);
  }
}

/** Validation stricte d'une sauvegarde native. Liste vide = valide. */
export function validateBackup(data: Obj): string[] {
  const errors: string[] = [];
  if (data.app !== APP_ID) errors.push('app : ce fichier ne provient pas de MyFitApp.');
  if (!Array.isArray(data.sessions)) errors.push('sessions manquant.');
  if (!Array.isArray(data.exercises)) errors.push('exercises manquant.');
  if (errors.length > 0) return errors;
  const sessions = data.sessions as unknown[];
  const exercises = data.exercises as unknown[];
  exercises.forEach((e, i) => validateExercise(e, `exercises[${i}]`, errors));
  sessions.forEach((s, i) => validateSession(s, `sessions[${i}]`, errors));
  if (data.settings !== undefined && !isObj(data.settings)) errors.push('settings invalide.');
  const body = data.bodyTracking;
  if (body !== undefined) {
    if (!isObj(body)) errors.push('bodyTracking invalide.');
    else {
      if (!isValidHeight(body.heightCm)) errors.push('bodyTracking.heightCm invalide.');
      if (!Array.isArray(body.weighIns)) errors.push('bodyTracking.weighIns invalide.');
      else {
        body.weighIns.forEach((w, i) => {
          if (!isValidWeighIn(w)) errors.push(`bodyTracking.weighIns[${i}] invalide.`);
        });
        const dates = body.weighIns.map((w) => (isObj(w) ? w.date : null));
        if (new Set(dates).size !== dates.length) errors.push('bodyTracking.weighIns : plusieurs pesées à la même date.');
      }
    }
  }
  if (data.activities !== undefined) {
    if (!Array.isArray(data.activities)) errors.push('activities invalide.');
    else {
      data.activities.forEach((a, i) => errors.push(...activityErrors(a, `activities[${i}]`)));
      const ids = data.activities.map((a) => (isObj(a) ? a.id : null));
      if (new Set(ids).size !== ids.length) errors.push('activities : plusieurs réponses avec le même identifiant.');
    }
  }
  if (data.plan !== undefined && data.plan !== null) {
    errors.push(...(isInt(data.schemaVersion) && data.schemaVersion < 5 ? legacyPlanErrors(data.plan) : planErrors(data.plan)));
  }
  if (errors.length > 0) return errors;

  // Cohérence : identifiants uniques, séances rattachées à des variantes existantes.
  const ids = new Set<string>();
  const variantIds = new Set<string>();
  const bodyweight = new Set<string>();
  for (const e of exercises as Exercise[]) {
    if (ids.has(e.id)) errors.push(`Exercice en double : ${e.id}.`);
    ids.add(e.id);
    for (const v of e.variants) {
      if (variantIds.has(v.id)) errors.push(`Variante en double : ${v.id}.`);
      variantIds.add(v.id);
      if (v.config?.bodyweight) bodyweight.add(v.id);
    }
  }
  const sessionIds = new Set<string>();
  let active = 0;
  for (const s of sessions as Session[]) {
    if (sessionIds.has(s.id)) errors.push(`Séance en double : ${s.id}.`);
    sessionIds.add(s.id);
    if (s.state === 'active') active++;
    const blocks = new Set<string>();
    for (const b of s.cardio ?? []) {
      if (blocks.has(b.id)) errors.push(`Séance ${s.id} : bloc de cardio en double ${b.id}.`);
      blocks.add(b.id);
    }
    for (const p of s.performances) {
      if (!variantIds.has(p.variantId)) errors.push(`Séance ${s.id} : exercice inconnu ${p.variantId}.`);
      // Charge nulle pour un exercice au poids du corps, et pour lui seulement ; ou, dans une séance en cours, pour un
      // exercice sans série dont le poids de départ reste à saisir (lieu changé, version 1.30.1).
      else if ((p.weightKg === 0) !== bodyweight.has(p.variantId) && !(s.state === 'active' && p.weightKg === 0 && p.reps.length === 0)) {
        errors.push(`Séance ${s.id} : charge invalide pour ${p.variantId}.`);
      }
    }
  }
  if (active > 1) errors.push('Plusieurs séances en cours.');
  const plan = migratePlan(data.plan);
  for (const e of plan ? planExercises(plan) : []) {
    if (!variantIds.has(e.variantId)) errors.push(`Séance prévue : exercice inconnu ${e.variantId}.`);
  }
  return errors;
}
