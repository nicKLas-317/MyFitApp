/**
 * Lecture d'un JSON simple (format version 1) ou d'une structure inconnue, adaptée en brouillons à vérifier (§11.9)
 * (version 1.55.1 : découpé de backup.ts, sans changement de comportement).
 */
import type { CardioMachine, Exercise, Feeling, Incline, MuscleGroup } from '../domain/types';
import { INCLINES } from '../cardio/model';
import { MUSCLE_GROUP_LABELS } from '../library/seed';
import { importedSessionName, isIsoDate } from '../session/format';
import { draftCardio, draftExercise, type DraftExerciseInput, type DraftIssue, type DraftSession } from './draft';
import { isFeeling, readFeelingSymbol } from './feelings';
import { detectDate } from './notes';
import { newId } from '../session/ops';
import { normalizeName } from '../library/text';
import { MUSCLE_GROUPS } from '../domain/muscleGroups';
import { isNum, isObj, isStr, type Obj } from './jsonGuards';

function pick(o: Obj, keys: readonly string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}

const SESSION_LIST_KEYS = ['sessions', 'seances', 'séances', 'workouts', 'history', 'historique'];
const EXERCISE_LIST_KEYS = ['exercises', 'exercices', 'performances', 'items', 'entries'];
const CARDIO_LIST_KEYS = ['cardio'];

export function findSessions(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (!isObj(data)) return null;
  const list = pick(data, SESSION_LIST_KEYS);
  if (Array.isArray(list)) return list;
  // Une séance seule.
  if (Array.isArray(pick(data, EXERCISE_LIST_KEYS)) || Array.isArray(pick(data, CARDIO_LIST_KEYS))) return [data];
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

export function readSession(
  raw: unknown,
  index: number,
  exercises: readonly Exercise[],
  today: string,
  machines: readonly CardioMachine[],
): DraftSession | string {
  const label = `Séance ${index + 1}`;
  if (!isObj(raw)) return `${label} ignorée : ce n’est pas un objet.`;
  const found = pick(raw, EXERCISE_LIST_KEYS);
  const cardio = pick(raw, CARDIO_LIST_KEYS);
  if (!Array.isArray(found) && !Array.isArray(cardio)) return `${label} ignorée : liste d’exercices introuvable.`;
  const list = Array.isArray(found) ? found : [];

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
    cardio: (Array.isArray(cardio) ? cardio : []).map((c, i) => draftCardio(readCardio(c), machines, `c${i + 1}`)),
    allowDuplicate: false,
  };
}

/** Bloc de cardio d'un JSON simple : `{ "machine": "Tapis", "inclinaison": "haute", "minutes": 20 }`. */
function readCardio(raw: unknown) {
  const o = isObj(raw) ? raw : {};
  const name = pick(o, ['machine', 'name', 'nom', 'sourceName']);
  const minutes = readNumber(pick(o, ['minutes', 'durationMinutes', 'duree', 'durée', 'duration']));
  const distance = readNumber(pick(o, ['distanceKm', 'distance', 'km']));
  const inclineValue = pick(o, ['incline', 'inclinaison']);
  // Une inclinaison fournie mais inconnue reste à choisir ; absente, elle est lue dans le nom de la machine.
  const incline: Incline | null | undefined = isStr(inclineValue)
    ? (INCLINES.find((x) => x === normalizeName(inclineValue)) ?? null)
    : undefined;
  return {
    sourceName: isStr(name) ? name.trim() : '',
    sourceLine: null,
    minutes,
    distanceKm: distance,
    ...(incline !== undefined ? { incline } : {}),
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
