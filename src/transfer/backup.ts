/**
 * Export complet et import JSON (§11.9, §11.10).
 * - schemaVersion 2 : format natif complet, restauré tel quel après validation stricte.
 * - schemaVersion 1 : format simple (ex. `docs/exemples/seance-exemple-1.json`), adapté en brouillons à vérifier.
 * - Autre JSON : structure détectée si possible, sinon erreur détaillée. Jamais d'échec silencieux.
 * Aucune fonction de ce module n'écrit : l'import passe par un plan appliqué en une seule transaction.
 */
import type { Exercise, Feeling, MuscleGroup, Session, Variant } from '../domain/types';
import { MUSCLE_GROUP_LABELS, SEED_EXERCISES } from '../library/seed';
import { EMPTY_BODY, isValidHeight, isValidWeighIn, type BodyTracking } from '../body/model';

export { EMPTY_BODY, type BodyTracking };
import { importedSessionName, isIsoDate, localDate } from '../session/format';
import { draftExercise, findDuplicates, type DraftExerciseInput, type DraftIssue, type DraftSession } from './draft';
import { isFeeling, readFeelingSymbol } from './feelings';
import { detectDate } from './notes';
import { newId } from '../session/ops';
import { normalizeName } from '../library/text';

export const APP_ID = 'MyFitApp';
export const SCHEMA_VERSION = 2;
/** Délai au-delà duquel l'accueil rappelle d'exporter (§12). */
export const BACKUP_REMINDER_MS = 14 * 24 * 60 * 60 * 1000;


export interface Backup {
  app: typeof APP_ID;
  schemaVersion: typeof SCHEMA_VERSION;
  exportedAt: string;
  sessions: Session[];
  exercises: Exercise[];
  /** Réglages généraux ; les réglages par exercice sont portés par les variantes. */
  settings: Record<string, unknown>;
  bodyTracking: BodyTracking;
}


export function buildBackup(
  data: { sessions: readonly Session[]; exercises: readonly Exercise[]; bodyTracking?: BodyTracking },
  now: number,
): Backup {
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date(now).toISOString(),
    sessions: [...data.sessions],
    exercises: [...data.exercises],
    settings: {},
    bodyTracking: data.bodyTracking ?? EMPTY_BODY,
  };
}

export function backupFileName(now: number): string {
  return `myfitapp-sauvegarde-${localDate(now)}.json`;
}

/**
 * Rappel de sauvegarde (§12) : plus de 14 jours sans export (ou depuis la première séance
 * si aucun export n'a jamais été fait) et des séances terminées enregistrées depuis.
 */
export function needsBackupReminder(sessions: readonly Session[], lastExportAt: number | null, now: number): boolean {
  const done = sessions.filter((s) => s.state === 'done');
  if (done.length === 0) return false;
  const since = lastExportAt ?? Math.min(...done.map((s) => s.createdAt));
  if (now - since < BACKUP_REMINDER_MS) return false;
  return lastExportAt === null || done.some((s) => s.updatedAt > lastExportAt);
}

// ——— Lecture ————————————————————————————————————————————————————

export type ParsedImport =
  | { kind: 'backup'; backup: Backup }
  | { kind: 'drafts'; drafts: DraftSession[]; format: 'simple' | 'detected'; notes: string[] }
  | { kind: 'error'; message: string; details: string[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const MUSCLE_GROUPS = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[];

/** Analyse un contenu JSON collé ou chargé. `exercises` : bibliothèque locale (rapprochement des noms). */
export function parseJsonImport(text: string, exercises: readonly Exercise[], today: string): ParsedImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return {
      kind: 'error',
      message: 'Le contenu n’est pas un JSON valide. Aucune donnée n’a été modifiée.',
      details: [error instanceof Error ? error.message : String(error)],
    };
  }

  if (isObj(data) && 'schemaVersion' in data) {
    const version = data.schemaVersion;
    if (!isInt(version) || version < 1) {
      return { kind: 'error', message: 'Version de format illisible.', details: [`schemaVersion : ${JSON.stringify(version)}`] };
    }
    if (version > SCHEMA_VERSION) {
      return {
        kind: 'error',
        message: `Ce fichier vient d’une version plus récente de MyFitApp (format ${version}). Mettez l’application à jour avant de l’importer.`,
        details: [],
      };
    }
    if (version === SCHEMA_VERSION) {
      const errors = validateBackup(data);
      if (errors.length > 0) {
        return { kind: 'error', message: 'Sauvegarde MyFitApp invalide : rien n’a été importé.', details: errors.slice(0, 20) };
      }
      return { kind: 'backup', backup: data as unknown as Backup };
    }
  }

  // Format simple (version 1) ou structure inconnue : adaptation en brouillons à vérifier.
  const simple = isObj(data) && data.schemaVersion === 1;
  const rawSessions = findSessions(data);
  if (!rawSessions || rawSessions.length === 0) {
    return {
      kind: 'error',
      message: 'Structure JSON non reconnue : aucune séance trouvée. Aucune donnée n’a été modifiée.',
      details: [
        'Attendu : une sauvegarde MyFitApp, ou une liste de séances comportant chacune une date et une liste d’exercices (nom, poids, répétitions).',
      ],
    };
  }
  const notes: string[] = [];
  const drafts: DraftSession[] = [];
  rawSessions.forEach((raw, i) => {
    const result = readSession(raw, i, exercises, today);
    if (typeof result === 'string') notes.push(result);
    else drafts.push(result);
  });
  if (drafts.length === 0) {
    return { kind: 'error', message: 'Aucune séance exploitable dans ce JSON.', details: notes };
  }
  notes.unshift(
    simple
      ? `Format simple (version 1) : ${drafts.length} séance${drafts.length > 1 ? 's' : ''} à vérifier avant l’import.`
      : `Format inconnu : ${drafts.length} séance${drafts.length > 1 ? 's' : ''} détectée${drafts.length > 1 ? 's' : ''} automatiquement. Vérifiez l’interprétation.`,
  );
  return { kind: 'drafts', drafts, format: simple ? 'simple' : 'detected', notes };
}

function pick(o: Obj, keys: readonly string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}

const SESSION_LIST_KEYS = ['sessions', 'seances', 'séances', 'workouts', 'history', 'historique'];
const EXERCISE_LIST_KEYS = ['exercises', 'exercices', 'performances', 'items', 'entries'];

function findSessions(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (!isObj(data)) return null;
  const list = pick(data, SESSION_LIST_KEYS);
  if (Array.isArray(list)) return list;
  // Une séance seule.
  if (Array.isArray(pick(data, EXERCISE_LIST_KEYS))) return [data];
  return null;
}

function readNumber(v: unknown): number | null {
  if (isNum(v)) return v;
  if (isStr(v)) {
    const m = /(\d+(?:[.,]\d+)?)/.exec(v);
    if (m) return Number(m[1]!.replace(',', '.'));
  }
  return null;
}

function readDate(v: unknown, today: string): string | null {
  if (!isStr(v)) return null;
  const head = v.slice(0, 10);
  if (isIsoDate(head)) return head;
  return detectDate(v, today)?.date ?? null;
}

/** Heure « 15:45 » ou date-heure ISO → horodatage local, à la date de la séance. */
function readTime(v: unknown, date: string): number | null {
  if (isNum(v)) return v;
  if (!isStr(v)) return null;
  const hm = /^(\d{1,2})[:h](\d{2})$/.exec(v.trim());
  if (hm) {
    const [y, mo, d] = date.split('-').map(Number);
    return new Date(y!, mo! - 1, d!, Number(hm[1]), Number(hm[2])).getTime();
  }
  const ts = Date.parse(v);
  return Number.isFinite(ts) ? ts : null;
}

function readGroup(v: unknown): MuscleGroup | null {
  if (!isStr(v)) return null;
  const n = normalizeName(v);
  return MUSCLE_GROUPS.find((g) => normalizeName(g) === n || normalizeName(MUSCLE_GROUP_LABELS[g]) === n) ?? null;
}

function readSession(raw: unknown, index: number, exercises: readonly Exercise[], today: string): DraftSession | string {
  const label = `Séance ${index + 1}`;
  if (!isObj(raw)) return `${label} ignorée : ce n’est pas un objet.`;
  const list = pick(raw, EXERCISE_LIST_KEYS);
  if (!Array.isArray(list)) return `${label} ignorée : liste d’exercices introuvable.`;

  const foundDate = readDate(pick(raw, ['date', 'day', 'jour', 'startTime', 'startedAt']), today);
  const date = foundDate ?? today;
  const rawName = pick(raw, ['name', 'nom', 'title', 'titre']);
  const name = isStr(rawName) && rawName.trim() ? rawName.trim() : null;
  const startedAt = foundDate ? readTime(pick(raw, ['startTime', 'startedAt', 'heureDebut']), date) : null;
  let endedAt = foundDate ? readTime(pick(raw, ['endTime', 'endedAt', 'heureFin']), date) : null;
  const duration = readNumber(pick(raw, ['durationMinutes', 'duration', 'duree', 'durée']));
  if (endedAt === null && startedAt !== null && duration !== null) endedAt = startedAt + duration * 60_000;
  const sourceText = pick(raw, ['sourceText', 'notes', 'texte']);
  const id = raw.id;

  return {
    key: newId(),
    source: 'json',
    sourceId: isStr(id) && id.trim() ? id : null,
    date,
    dateConfirmed: foundDate !== null,
    dateSource: foundDate ? 'json' : 'today',
    dateYearAssumed: false,
    name: name ?? importedSessionName(date),
    nameAuto: name === null,
    startedAt,
    endedAt: startedAt !== null ? endedAt : null,
    sourceText: isStr(sourceText) && sourceText.trim() ? sourceText : null,
    exercises: list.map((e, i) => draftExercise(readExercise(e), exercises, `e${i + 1}`)),
    allowDuplicate: false,
  };
}

function readExercise(raw: unknown): DraftExerciseInput {
  const o = isObj(raw) ? raw : {};
  const issues: DraftIssue[] = [];
  const nameValue = pick(o, ['sourceName', 'name', 'nom', 'exercise', 'exercice', 'suggestedExercise']);
  const hintValue = pick(o, ['suggestedExercise', 'exerciseName']);
  const variant = pick(o, ['variant', 'variante']);

  // Répétitions : tableau série par série, ou nombre uniforme avec un nombre de séries.
  const setsValue = pick(o, ['sets', 'series', 'séries', 'plannedSets']);
  const repsValue = pick(o, ['reps', 'repetitions', 'répétitions']);
  let reps: number[] | null = null;
  let plannedSets: number | null = null;
  if (Array.isArray(setsValue) && setsValue.every(isNum)) reps = setsValue;
  else if (Array.isArray(repsValue) && repsValue.every(isNum)) reps = repsValue;
  if (isNum(setsValue)) plannedSets = setsValue;
  else if (isNum(o.plannedSets)) plannedSets = o.plannedSets;
  if (!reps && isNum(repsValue) && plannedSets !== null) reps = Array.from({ length: plannedSets }, () => repsValue);
  if (reps && plannedSets === null) plannedSets = reps.length;

  let targetReps = readNumber(pick(o, ['targetReps', 'target', 'cible']));
  if (targetReps === null && reps && reps.length > 0) {
    targetReps = Math.max(...reps);
    if (reps.some((r) => r !== targetReps)) issues.push('target_inferred');
  }

  // Ressenti : valeur stockée et/ou symbole ; une contradiction est soumise à confirmation.
  let feeling: Feeling = 'inconnu';
  let feelingSymbol: string | null = null;
  const rawFeeling = o.feeling;
  const symbolValue = pick(o, ['feelingSymbol', 'symbol', 'symbole', 'ressenti']) ?? (isStr(rawFeeling) && !isFeeling(rawFeeling) ? rawFeeling : undefined);
  const stored = isFeeling(rawFeeling) ? rawFeeling : null;
  const symbol = isStr(symbolValue) ? readFeelingSymbol(symbolValue) : { kind: 'absent' as const };
  if (symbol.kind !== 'absent') feelingSymbol = symbol.symbol;
  if (stored && symbol.kind === 'known' && symbol.feeling !== stored) {
    feeling = stored;
    issues.push('feeling_conflict');
  } else if (stored) feeling = stored;
  else if (symbol.kind === 'known') feeling = symbol.feeling;
  else if (symbol.kind === 'unknown') issues.push('unknown_symbol');

  return {
    sourceName: isStr(nameValue) ? nameValue.trim() : '',
    sourceLine: isStr(variant) && variant.trim() ? `Variante indiquée : ${variant.trim()}` : null,
    plannedSets,
    targetReps,
    reps,
    weightKg: readNumber(pick(o, ['weightKg', 'weight', 'poids', 'kg', 'charge'])),
    feeling,
    feelingSymbol,
    issues,
    hint: isStr(hintValue) ? hintValue.replace(/\s*\/\s*/g, ' ') : null,
    primaryGroup: readGroup(pick(o, ['muscleGroup', 'groupe', 'primaryGroup'])),
    // Remarque laissée dans le fichier : soumise à confirmation, jamais ignorée.
    notes: [pick(o, ['toConfirm', 'aConfirmer', 'note', 'remarque'])].filter((n): n is string => isStr(n) && n.trim() !== '').map((n) => n.trim()),
    assistedHint: pick(o, ['weightIsAssistance', 'assisted', 'assiste']) === true,
  };
}

// ——— Validation du format natif ——————————————————————————————————————

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
      for (const k of ['sets', 'minReps', 'maxReps']) {
        if (v.config[k] !== undefined && !(isInt(v.config[k]) && (v.config[k] as number) > 0)) errors.push(`${path}.config.${k} invalide.`);
      }
      if (v.config.assisted !== undefined && typeof v.config.assisted !== 'boolean') errors.push(`${path}.config.assisted invalide.`);
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
  if (!isNum(p.weightKg) || p.weightKg <= 0) errors.push(`${path}.weightKg invalide.`);
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
  if (errors.length > 0) return errors;

  // Cohérence : identifiants uniques, séances rattachées à des variantes existantes.
  const ids = new Set<string>();
  const variantIds = new Set<string>();
  for (const e of exercises as Exercise[]) {
    if (ids.has(e.id)) errors.push(`Exercice en double : ${e.id}.`);
    ids.add(e.id);
    for (const v of e.variants) {
      if (variantIds.has(v.id)) errors.push(`Variante en double : ${v.id}.`);
      variantIds.add(v.id);
    }
  }
  const sessionIds = new Set<string>();
  let active = 0;
  for (const s of sessions as Session[]) {
    if (sessionIds.has(s.id)) errors.push(`Séance en double : ${s.id}.`);
    sessionIds.add(s.id);
    if (s.state === 'active') active++;
    for (const p of s.performances) {
      if (!variantIds.has(p.variantId)) errors.push(`Séance ${s.id} : exercice inconnu ${p.variantId}.`);
    }
  }
  if (active > 1) errors.push('Plusieurs séances en cours.');
  return errors;
}

// ——— Plan d'import ——————————————————————————————————————————————

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
    const merged = isPristine(existing) ? takeImported : keepLocal;
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
