/**
 * Brouillon d'import (§11.1, §11.8) : séance lue depuis des notes ou un JSON simple,
 * corrigeable dans l'aperçu avant confirmation. Rien n'est enregistré tant que l'import
 * n'est pas confirmé ; aucune donnée absente n'est inventée.
 */
import type { CardioBlock, CardioMachine, Exercise, Feeling, Incline, MuscleGroup, Performance, Session } from '../domain/types';
import { cardioErrors, cardioOf, DEFAULT_CARDIO_MACHINES, isValidDistance, isValidMinutes, makeCardioBlock, matchCardioMachine, readIncline } from '../cardio/model';
import { rebuildProfile, resolveConfig, validatePerformance, type Evaluation, type Profile } from '../engine';
import { buildEngineSettings } from '../library/catalog';
import { allIds, slug, uniqueId } from '../library/edit';
import { importedSessionName, isIsoDate } from '../session/format';
import { newId, WEIGHT_CONFIRM_RATIO } from '../session/ops';
import { MATCH_MARGIN, matchExercise, qualifierOf, type MatchResult } from './match';
import { parseNotes, type ParseIssue } from './notes';
import { normalizeName, variantPrecisionOf } from '../library/text';

export type ExerciseChoice =
  | { kind: 'variant'; variantId: string }
  | { kind: 'new_exercise'; name: string; primaryGroup: MuscleGroup | null }
  | { kind: 'new_variant'; exerciseId: string; name: string };

export type DraftIssue =
  | ParseIssue
  /** JSON : le ressenti et le symbole fournis se contredisent. */
  | 'feeling_conflict';

export interface DraftExercise {
  key: string;
  sourceName: string;
  sourceLine: string | null;
  match: MatchResult;
  /** null tant que l'exercice n'est pas choisi (correspondance ambiguë ou inconnue). */
  choice: ExerciseChoice | null;
  weightKg: number | null;
  targetReps: number | null;
  plannedSets: number | null;
  /** null : aucune répétition connue (historique partiel si le poids est connu). */
  reps: number[] | null;
  feeling: Feeling;
  feelingSymbol: string | null;
  /** false tant qu'un symbole inconnu ou contradictoire n'a pas été tranché (§7.3). */
  feelingConfirmed: boolean;
  /** Points relevés dans la source (unité inconnue, remarque du fichier) à confirmer avant l'import. */
  toConfirm: string[];
  checksConfirmed: boolean;
  /** La source indique que la charge est une aide (exercice assisté, §7.12). */
  assistedHint: boolean;
  issues: DraftIssue[];
  include: boolean;
}

export interface DraftSession {
  key: string;
  source: 'notes' | 'json';
  /** Identifiant fourni par le JSON, conservé s'il est libre. */
  sourceId: string | null;
  date: string;
  /** Une date de notes doit être confirmée explicitement (§11.2). */
  dateConfirmed: boolean;
  dateSource: 'text' | 'json' | 'today';
  dateYearAssumed: boolean;
  name: string;
  /** Le nom est celui généré à partir de la date : il suit les changements de date. */
  nameAuto: boolean;
  startedAt: number | null;
  endedAt: number | null;
  sourceText: string | null;
  exercises: DraftExercise[];
  /** Blocs de cardio lus (§ cardio) : simple enregistrement, sans effet sur la progression. */
  cardio: DraftCardio[];
  /** Doublon potentiel importé quand même, après confirmation explicite (§11.9). */
  allowDuplicate: boolean;
}

export interface DraftCardio {
  key: string;
  sourceName: string;
  sourceLine: string | null;
  /** null tant que la machine n'est pas reconnue ou choisie. */
  machine: CardioMachine | null;
  /** null : inclinaison mentionnée sans niveau, à choisir (Moyenne ou Haute). Ignorée hors tapis. */
  incline: Incline | null;
  minutes: number | null;
  distanceKm: number | null;
  include: boolean;
}

export interface DraftCardioInput {
  sourceName: string;
  sourceLine: string | null;
  minutes: number | null;
  distanceKm: number | null;
  /** Inclinaison fournie par la source (JSON) ; sinon lue dans le nom. */
  incline?: Incline | null;
}

/**
 * Bloc de cardio du brouillon. La machine est reconnue d'après la liste des réglages ; sans précision,
 * l'inclinaison est Neutre ; « incliné » sans niveau reste à choisir, jamais deviné.
 */
export function draftCardio(input: DraftCardioInput, machines: readonly CardioMachine[], key: string): DraftCardio {
  const reading = readIncline(input.sourceName);
  const incline = input.incline !== undefined ? input.incline : reading.kind === 'level' ? reading.incline : reading.kind === 'absent' ? 'neutre' : null;
  return {
    key,
    sourceName: input.sourceName,
    sourceLine: input.sourceLine,
    machine: matchCardioMachine(input.sourceName, machines),
    incline,
    minutes: input.minutes,
    distanceKm: input.distanceKm,
    include: true,
  };
}

/** Bloc enregistrable, ou null si le brouillon est incomplet. */
export function draftCardioBlock(c: DraftCardio, id: string): CardioBlock | null {
  if (!c.machine) return null;
  const input = { machine: c.machine, incline: c.incline, minutes: c.minutes, distanceKm: c.distanceKm };
  return cardioErrors(input).length === 0 ? makeCardioBlock(input, id) : null;
}

export function updateDraftCardio(draft: DraftSession, key: string, patch: Partial<DraftCardio>): DraftSession {
  return { ...draft, cardio: draft.cardio.map((c) => (c.key === key ? { ...c, ...patch } : c)) };
}

/** Données lues pour un exercice, avant rapprochement avec la bibliothèque. */
export interface DraftExerciseInput {
  sourceName: string;
  sourceLine: string | null;
  plannedSets: number | null;
  targetReps: number | null;
  reps: number[] | null;
  weightKg: number | null;
  feeling: Feeling;
  feelingSymbol: string | null;
  issues: DraftIssue[];
  /** Nom d'exercice suggéré par la source (JSON), essayé si le nom d'origine n'est pas reconnu avec certitude. */
  hint?: string | null;
  /** Groupe musculaire indiqué par la source, utilisé pour un nouvel exercice. */
  primaryGroup?: MuscleGroup | null;
  /** Poids tel qu'écrit quand son unité n'est pas reconnue (« 47gs »). */
  weightText?: string;
  /** Remarques de la source à confirmer (champ `toConfirm` d'un JSON). */
  notes?: string[];
  assistedHint?: boolean;
}

function resolveMatch(input: DraftExerciseInput, exercises: readonly Exercise[]): MatchResult {
  const direct = matchExercise(input.sourceName, exercises);
  if (direct.confidence === 'learned' || direct.confidence === 'certain' || !input.hint) return direct;
  const viaHint = matchExercise(input.hint, exercises);
  if (viaHint.confidence !== 'learned' && viaHint.confidence !== 'certain') return direct;
  const exercise = exercises.find((e) => e.variants.some((v) => v.id === viaHint.suggestion));
  return { ...viaHint, confidence: 'certain', qualifier: exercise ? qualifierOf(input.sourceName, exercise) : null };
}

/**
 * Variante retenue par défaut (précision validée §11.11 A) : un angle chiffré (« 70° ») ou une prise
 * (« prise très large ») dans le nom désigne la variante correspondante, créée si elle n'existe pas encore.
 * Une hésitation limitée aux variantes d'un même exercice, sans précision, désigne la variante standard.
 */
function chooseVariant(match: MatchResult, sourceName: string, exercises: readonly Exercise[]): { match: MatchResult; choice: ExerciseChoice | null } {
  const plain = { match, choice: match.suggestion ? ({ kind: 'variant', variantId: match.suggestion } as const) : null };
  if (match.confidence === 'learned') return plain;
  const top = match.candidates[0];
  let exercise = match.suggestion ? exercises.find((e) => e.variants.some((v) => v.id === match.suggestion)) : undefined;
  if (!exercise && match.confidence === 'ambiguous' && top) {
    const close = match.candidates.filter((c) => top.score - c.score < MATCH_MARGIN);
    if (close.every((c) => c.exerciseId === top.exerciseId)) exercise = exercises.find((e) => e.id === top.exerciseId);
  }
  if (!exercise) return plain;

  const precision = variantPrecisionOf(sourceName);
  if (precision) {
    const key = normalizeName(precision);
    const existing = exercise.variants.find((v) => !v.archived && normalizeName(variantPrecisionOf(v.name) ?? '') === key);
    if (existing) return { match: { ...match, suggestion: existing.id }, choice: { kind: 'variant', variantId: existing.id } };
    return { match, choice: { kind: 'new_variant', exerciseId: exercise.id, name: precision } };
  }
  if (match.suggestion) return plain;
  const standard = exercise.variants.find((v) => v.id === exercise.id && !v.archived);
  if (!standard) return plain;
  return { match: { ...match, confidence: 'probable', suggestion: standard.id }, choice: { kind: 'variant', variantId: standard.id } };
}

export function draftExercise(input: DraftExerciseInput, exercises: readonly Exercise[], key: string): DraftExercise {
  const chosen = chooseVariant(resolveMatch(input, exercises), input.sourceName, exercises);
  const match = chosen.match;
  let choice = chosen.choice;
  const toConfirm = [...(input.notes ?? [])];
  if (input.issues.includes('unknown_unit') && input.weightKg !== null) {
    const kg = input.weightKg.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    toConfirm.unshift(`Poids noté « ${input.weightText ?? kg} » : unité non reconnue, lu ${kg} kg.`);
  }
  // Mot inconnu de la bibliothèque et du lexique : l'exercice est proposé, l'import attend la confirmation (§4.2.1).
  if (choice && match.confidence !== 'learned' && match.unknownWords.length > 0) {
    const many = match.unknownWords.length > 1;
    toConfirm.push(`Mot${many ? 's' : ''} non reconnu${many ? 's' : ''} : « ${match.unknownWords.join(' ')} ». Vérifiez l’exercice proposé.`);
  }
  if (!choice && match.confidence === 'none' && input.primaryGroup) {
    choice = { kind: 'new_exercise', name: input.sourceName, primaryGroup: input.primaryGroup };
  }
  return {
    key,
    sourceName: input.sourceName,
    sourceLine: input.sourceLine,
    match,
    choice,
    weightKg: input.weightKg,
    targetReps: input.targetReps,
    plannedSets: input.plannedSets,
    reps: input.reps,
    feeling: input.feeling,
    feelingSymbol: input.feelingSymbol,
    feelingConfirmed: !input.issues.includes('unknown_symbol') && !input.issues.includes('feeling_conflict'),
    toConfirm,
    checksConfirmed: toConfirm.length === 0,
    assistedHint: input.assistedHint === true,
    issues: input.issues,
    include: true,
  };
}

/** Un bloc de notes collé = une séance (§11.2). `today` : date locale YYYY-MM-DD. */
export function draftFromNotes(
  text: string,
  exercises: readonly Exercise[],
  today: string,
  machines: readonly CardioMachine[] = DEFAULT_CARDIO_MACHINES,
): DraftSession {
  const parsed = parseNotes(text, today);
  const date = parsed.date ?? today;
  return {
    key: newId(),
    source: 'notes',
    sourceId: null,
    date,
    dateConfirmed: false,
    dateSource: parsed.date ? 'text' : 'today',
    dateYearAssumed: parsed.dateYearAssumed,
    name: parsed.title ?? importedSessionName(date),
    nameAuto: parsed.title === null,
    startedAt: null,
    endedAt: null,
    sourceText: text.trim() || null,
    exercises: parsed.entries.map((e, i) => draftExercise(e, exercises, `e${i + 1}`)),
    cardio: parsed.cardio.map((c, i) => draftCardio(c, machines, `c${i + 1}`)),
    allowDuplicate: false,
  };
}

/** Changer la date vaut confirmation explicite ; un nom généré suit la nouvelle date. */
export function setDraftDate(draft: DraftSession, date: string): DraftSession {
  return {
    ...draft,
    date,
    dateConfirmed: true,
    dateYearAssumed: false,
    name: draft.nameAuto ? importedSessionName(date) : draft.name,
  };
}

export function updateDraftExercise(draft: DraftSession, key: string, patch: Partial<DraftExercise>): DraftSession {
  return { ...draft, exercises: draft.exercises.map((e) => (e.key === key ? { ...e, ...patch } : e)) };
}

// ——— Finalisation ———————————————————————————————————————————————

/** Noms définis par la bibliothèque pour une variante (hors synonymes appris). */
function libraryNames(exercise: Exercise, variantId: string): string[] {
  const variant = exercise.variants.find((v) => v.id === variantId);
  if (!variant) return [];
  if (variant.id === exercise.id) return [exercise.name, ...exercise.synonyms];
  return [`${exercise.name} ${variant.name}`, variant.name];
}

/**
 * Mémorise le nom importé comme synonyme de la variante confirmée (§11.7).
 * Un nom déjà défini par la bibliothèque n'est pas appris ; un synonyme appris
 * auparavant pour une autre variante lui est retiré (correction mémorisée).
 */
function learnSynonym(work: Map<string, Exercise>, variantId: string, sourceName: string): void {
  const normalized = normalizeName(sourceName);
  if (!normalized) return;
  for (const exercise of work.values()) {
    for (const v of exercise.variants) {
      if (libraryNames(exercise, v.id).some((n) => normalizeName(n) === normalized)) return;
    }
  }
  for (const [id, exercise] of work) {
    let changed = false;
    const variants = exercise.variants.map((v) => {
      const has = v.synonyms.some((s) => normalizeName(s) === normalized);
      if (v.id === variantId && !has) {
        changed = true;
        return { ...v, synonyms: [...v.synonyms, sourceName.trim()] };
      }
      if (v.id !== variantId && has) {
        changed = true;
        return { ...v, synonyms: v.synonyms.filter((s) => normalizeName(s) !== normalized) };
      }
      return v;
    });
    if (changed) work.set(id, { ...exercise, variants });
  }
}

/** Symbole de ressenti d'origine, conservé dans l'historique (§7.3). */
const symbol = (e: DraftExercise) => (e.feelingSymbol ? { feelingSymbol: e.feelingSymbol } : {});

/** Performance d'un exercice du brouillon, ou null si ses données sont inexploitables. */
export function draftPerformance(e: DraftExercise, variantId: string): Performance | null {
  if (e.weightKg === null || !Number.isFinite(e.weightKg) || e.weightKg <= 0) return null;
  if (e.reps === null) {
    // Poids seul : historique partiel, ignoré par le moteur (§11.8, §7.11 H).
    return { variantId, weightKg: e.weightKg, targetReps: null, plannedSets: null, reps: [], feeling: e.feeling, ...symbol(e), partial: true };
  }
  if (e.targetReps === null || e.plannedSets === null || e.reps.length === 0) return null;
  const perf: Performance = {
    variantId,
    weightKg: e.weightKg,
    targetReps: e.targetReps,
    plannedSets: e.plannedSets,
    reps: [...e.reps],
    feeling: e.feeling,
    ...symbol(e),
  };
  return validatePerformance(perf).length === 0 ? perf : null;
}

export interface FinalizeResult {
  /** Séances prêtes à enregistrer, dans l'ordre des brouillons. */
  sessions: Session[];
  /** Exercices créés ou modifiés (nouvel exercice, nouvelle variante, synonyme appris). */
  exercises: Exercise[];
  /** Variante retenue pour chaque exercice importé : clé de brouillon → clé d'exercice → variante. */
  variantIds: Map<string, Map<string, string>>;
}

/**
 * Transforme des brouillons en séances terminées d'origine « import ».
 * Les exercices exclus ou encore inexploitables sont ignorés : l'appelant vérifie
 * auparavant qu'il ne reste aucun problème bloquant (`draftProblems`).
 */
export function finalizeDrafts(
  drafts: readonly DraftSession[],
  exercises: readonly Exercise[],
  existing: readonly Session[],
  now: number,
): FinalizeResult {
  const work = new Map(exercises.map((e) => [e.id, e]));
  const changed = new Set<string>();
  const takenIds = allIds(exercises);
  const takenSessionIds = new Set(existing.map((s) => s.id));
  const sessions: Session[] = [];
  const variantIds = new Map<string, Map<string, string>>();

  drafts.forEach((draft, index) => {
    const created = new Map<string, string>();
    const byKey = new Map<string, string>();
    const performances: Performance[] = [];

    for (const e of draft.exercises) {
      if (!e.include || !e.choice) continue;
      let variantId: string | null = null;
      const choice = e.choice;

      if (choice.kind === 'variant') {
        if (![...work.values()].some((x) => x.variants.some((v) => v.id === choice.variantId))) continue;
        variantId = choice.variantId;
      } else if (choice.kind === 'new_exercise') {
        const name = choice.name.trim();
        if (!name || !choice.primaryGroup) continue;
        const createdKey = `exercise:${normalizeName(name)}`;
        variantId = created.get(createdKey) ?? null;
        if (!variantId) {
          const id = uniqueId(`perso-${slug(name)}`, takenIds);
          work.set(id, {
            id,
            name,
            synonyms: [],
            primaryGroup: choice.primaryGroup,
            secondaryGroups: [],
            equipment: '',
            archived: false,
            variants: [{ id, name: 'Standard', synonyms: [], archived: false }],
          });
          created.set(createdKey, id);
          variantId = id;
        }
      } else {
        const name = choice.name.trim();
        const exercise = work.get(choice.exerciseId);
        if (!name || !exercise) continue;
        const createdKey = `variant:${exercise.id}:${normalizeName(name)}`;
        variantId = created.get(createdKey) ?? null;
        if (!variantId) {
          const id = uniqueId(`${exercise.id}--${slug(name)}`, takenIds);
          work.set(exercise.id, { ...exercise, variants: [...exercise.variants, { id, name, synonyms: [], archived: false }] });
          created.set(createdKey, id);
          variantId = id;
        }
      }

      const perf = draftPerformance(e, variantId);
      if (!perf || performances.some((p) => p.variantId === variantId)) continue;
      performances.push(perf);
      byKey.set(e.key, variantId);
      learnSynonym(work, variantId, e.sourceName);
    }

    for (const [id, exercise] of work) if (exercise !== exercises.find((x) => x.id === id)) changed.add(id);

    const id = draft.sourceId && !takenSessionIds.has(draft.sourceId) ? draft.sourceId : newId();
    takenSessionIds.add(id);
    const cardio = draft.cardio
      .filter((c) => c.include)
      .map((c, i) => draftCardioBlock(c, `${id}-cardio-${i + 1}`))
      .filter((b): b is CardioBlock => b !== null);
    const name = draft.name.trim() || importedSessionName(draft.date);
    sessions.push({
      id,
      name,
      date: draft.date,
      startedAt: draft.startedAt,
      endedAt: draft.endedAt,
      // Ordre d'enregistrement distinct pour chaque séance d'un même import (§7.9).
      createdAt: now + index,
      updatedAt: now + index,
      origin: 'import',
      state: 'done',
      ...(draft.sourceText ? { sourceText: draft.sourceText } : {}),
      performances,
      ...(cardio.length > 0 ? { cardio } : {}),
    });
    variantIds.set(draft.key, byKey);
  });

  return { sessions, exercises: [...changed].map((id) => work.get(id)!), variantIds };
}

// ——— Doublons et contrôles ————————————————————————————————————————

function signature(session: Pick<Session, 'performances' | 'cardio'>): string {
  return [
    ...session.performances.map((p) => `${p.variantId}|${Math.round(p.weightKg * 100)}|${p.reps.join('-')}`),
    ...cardioOf(session).map((b) => `cardio|${b.machineId}|${b.incline ?? ''}|${b.minutes}`),
  ]
    .sort()
    .join('§');
}

/**
 * Doublons potentiels (§11.9) : séance terminée de même identifiant, ou de même date
 * avec les mêmes exercices, poids et répétitions, et le même cardio.
 */
export function findDuplicates(candidate: Session, existing: readonly Session[], sourceId: string | null = candidate.id): Session[] {
  const sig = signature(candidate);
  return existing.filter(
    (s) => s.state === 'done' && ((sourceId !== null && s.id === sourceId) || (s.date === candidate.date && signature(s) === sig)),
  );
}

export interface DraftProblem {
  level: 'error' | 'warning';
  code: string;
  /** Exercice concerné ; absent pour un problème qui concerne la séance. */
  exerciseKey?: string;
  message: string;
}

export interface ProblemContext {
  exercises: readonly Exercise[];
  sessions: readonly Session[];
  profile: Profile;
}

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

function exerciseProblems(e: DraftExercise, ctx: ProblemContext): DraftProblem[] {
  const list: DraftProblem[] = [];
  const err = (code: string, message: string) => list.push({ level: 'error', code, exerciseKey: e.key, message });
  const warn = (code: string, message: string) => list.push({ level: 'warning', code, exerciseKey: e.key, message });

  const choice = e.choice;
  if (!choice) {
    if (e.match.confidence === 'ambiguous') err('choose_exercise', 'Plusieurs exercices possibles : choisissez le bon.');
    else err('choose_exercise', 'Exercice non reconnu : choisissez-en un ou créez-le.');
  } else if (choice.kind === 'variant') {
    if (!ctx.exercises.some((x) => x.variants.some((v) => v.id === choice.variantId))) err('unknown_variant', 'Exercice introuvable.');
    else if (e.match.confidence === 'probable' && choice.variantId === e.match.suggestion) {
      warn('probable_match', 'Correspondance probable : vérifiez l’exercice.');
    }
  } else if (choice.kind === 'new_exercise') {
    const name = normalizeName(choice.name);
    if (!name) err('new_exercise_name', 'Nom du nouvel exercice manquant.');
    else if (ctx.exercises.some((x) => normalizeName(x.name) === name)) {
      err('new_exercise_exists', 'Un exercice porte déjà ce nom : sélectionnez-le.');
    }
    if (!choice.primaryGroup) err('new_exercise_group', 'Choisissez le groupe musculaire du nouvel exercice.');
  } else {
    const exercise = ctx.exercises.find((x) => x.id === choice.exerciseId);
    const name = normalizeName(choice.name);
    if (!exercise) err('unknown_variant', 'Exercice introuvable.');
    else if (!name) err('new_variant_name', 'Nom de la nouvelle variante manquant.');
    else if (exercise.variants.some((v) => normalizeName(v.name) === name)) {
      err('new_variant_exists', 'Cette variante existe déjà : sélectionnez-la.');
    } else {
      warn('new_variant', `Nouvelle variante « ${choice.name.trim()} » de « ${exercise.name} », avec son propre historique.`);
    }
  }

  if (e.weightKg === null) {
    if (e.reps === null && e.targetReps === null) {
      err('no_data', e.issues.includes('ambiguous_format') ? 'Ligne non comprise : saisissez les valeurs ou excluez l’exercice.' : 'Aucune performance trouvée : complétez ou excluez l’exercice.');
    } else err('missing_weight', 'Poids manquant.');
  } else if (!Number.isFinite(e.weightKg) || e.weightKg <= 0) {
    err('invalid_weight', 'Poids invalide.');
  } else if (e.reps === null) {
    warn('partial', 'Poids seul : historique partiel, sans effet sur la progression.');
  } else if (e.targetReps === null || e.plannedSets === null) {
    err('missing_target', 'Nombre de séries ou cible manquant.');
  } else if (e.reps.length === 0) {
    err('no_sets', 'Aucune série.');
  } else {
    const errors = validatePerformance({ variantId: '', weightKg: e.weightKg, targetReps: e.targetReps, plannedSets: e.plannedSets, reps: e.reps, feeling: e.feeling });
    if (errors.includes('reps_above_target')) err('reps_above_target', 'Une série dépasse la cible.');
    if (errors.includes('too_many_sets')) err('too_many_sets', 'Plus de séries réalisées que de séries prévues.');
    if (errors.some((x) => x === 'invalid_target' || x === 'invalid_planned_sets' || x === 'invalid_reps')) {
      err('invalid_numbers', 'Séries ou répétitions invalides.');
    }
    if (errors.length === 0 && e.reps.length < e.plannedSets) {
      warn('incomplete', `Séance incomplète (${e.reps.length} série${e.reps.length > 1 ? 's' : ''} sur ${e.plannedSets}) : orange.`);
    }
    if (e.issues.includes('target_inferred')) warn('target_inferred', `Cible déduite de la meilleure série (${e.targetReps}) : à vérifier.`);
  }

  if (!e.checksConfirmed) for (const note of e.toConfirm) err('to_confirm', `À confirmer : ${note}`);

  // Exercice assisté (§7.12) : la charge saisie est une aide.
  const assisted = choice?.kind === 'variant' && resolveConfig(buildEngineSettings(ctx.exercises), choice.variantId).assisted;
  if (assisted) warn('assisted', 'Exercice assisté : la charge est une aide (moins d’aide = plus dur).');
  else if (e.assistedHint) warn('assisted_mismatch', 'La source indique une charge d’aide, mais cet exercice n’est pas réglé comme assisté : vérifiez.');

  if (!e.feelingConfirmed) {
    if (e.issues.includes('feeling_conflict')) err('feeling_conflict', 'Ressenti et symbole contradictoires : choisissez le ressenti.');
    else err('unknown_symbol', `Symbole « ${e.feelingSymbol ?? ''} » non reconnu : choisissez le ressenti.`);
  } else if (e.feeling === 'inconnu' && e.reps !== null) {
    warn('no_feeling', 'Ressenti absent : la performance sera orange et ne validera pas.');
  }

  if (choice?.kind === 'variant' && e.weightKg !== null && e.weightKg > 0) {
    const previous = ctx.profile.variants[choice.variantId]?.palier.weightKg;
    if (previous !== undefined && Math.abs(e.weightKg - previous) / previous > WEIGHT_CONFIRM_RATIO) {
      warn('weight_gap', `Poids très différent du dernier utilisé (${fmt(previous)} kg) : vérifiez.`);
    }
  }
  return list;
}

/** Problèmes d'un brouillon : les erreurs bloquent l'import, les avertissements informent. */
export function draftProblems(draft: DraftSession, ctx: ProblemContext): DraftProblem[] {
  const list: DraftProblem[] = [];
  if (!isIsoDate(draft.date)) list.push({ level: 'error', code: 'date_invalid', message: 'Date invalide.' });
  else if (!draft.dateConfirmed) list.push({ level: 'error', code: 'date_unconfirmed', message: 'Confirmez la date de la séance.' });
  if (draft.dateYearAssumed) list.push({ level: 'warning', code: 'date_year_assumed', message: 'Année absente des notes : vérifiez-la.' });

  const included = draft.exercises.filter((e) => e.include);
  const cardio = draft.cardio.filter((c) => c.include);
  if (included.length === 0 && cardio.length === 0) list.push({ level: 'error', code: 'no_exercise', message: 'Aucun exercice à importer.' });
  for (const c of cardio) list.push(...cardioProblems(c));

  const seen = new Set<string>();
  for (const e of included) {
    list.push(...exerciseProblems(e, ctx));
    const id = e.choice?.kind === 'variant' ? e.choice.variantId : e.choice?.kind === 'new_variant' ? `${e.choice.exerciseId}:${normalizeName(e.choice.name)}` : e.choice ? `new:${normalizeName(e.choice.name)}` : null;
    if (id !== null) {
      if (seen.has(id)) list.push({ level: 'error', code: 'duplicate_exercise', exerciseKey: e.key, message: 'Exercice déjà présent dans cette séance : excluez-en un.' });
      seen.add(id);
    }
  }

  if (!draft.allowDuplicate && isIsoDate(draft.date)) {
    const { sessions } = finalizeDrafts([draft], ctx.exercises, ctx.sessions, 0);
    const candidate = sessions[0];
    if (candidate && (candidate.performances.length > 0 || cardioOf(candidate).length > 0) && findDuplicates(candidate, ctx.sessions, draft.sourceId).length > 0) {
      list.push({ level: 'error', code: 'duplicate_session', message: 'Une séance identique existe déjà à cette date.' });
    }
  }
  return list;
}

function cardioProblems(c: DraftCardio): DraftProblem[] {
  const list: DraftProblem[] = [];
  const err = (code: string, message: string) => list.push({ level: 'error', code, exerciseKey: c.key, message });
  if (!c.machine) err('cardio_machine', 'Machine de cardio non reconnue : choisissez-la.');
  else if (c.machine.incline && c.incline === null) err('cardio_incline', 'Inclinaison non précisée : choisissez Moyenne ou Haute.');
  if (!isValidMinutes(c.minutes)) err('cardio_minutes', 'Durée manquante ou invalide (en minutes entières).');
  if (c.distanceKm !== null && !isValidDistance(c.distanceKm)) err('cardio_distance', 'Distance invalide.');
  return list;
}

export function hasBlockingProblems(problems: readonly DraftProblem[]): boolean {
  return problems.some((p) => p.level === 'error');
}

/**
 * Statut que chaque performance obtiendra une fois importée (§11.8), calculé par le moteur
 * en rejouant l'historique complété des brouillons. null : performance partielle ou inexploitable.
 */
export function previewEvaluations(
  drafts: readonly DraftSession[],
  exercises: readonly Exercise[],
  sessions: readonly Session[],
): Map<string, Map<string, Evaluation | null>> {
  const result = finalizeDrafts(drafts, exercises, sessions, Date.now());
  const all = [...exercises.filter((e) => !result.exercises.some((x) => x.id === e.id)), ...result.exercises];
  const replay = rebuildProfile([...sessions, ...result.sessions], buildEngineSettings(all));
  const out = new Map<string, Map<string, Evaluation | null>>();
  drafts.forEach((draft, i) => {
    const sessionId = result.sessions[i]!.id;
    const byKey = new Map<string, Evaluation | null>();
    for (const [key, variantId] of result.variantIds.get(draft.key) ?? []) {
      byKey.set(key, replay.evaluations.find((ev) => ev.sessionId === sessionId && ev.variantId === variantId) ?? null);
    }
    out.set(draft.key, byKey);
  });
  return out;
}
