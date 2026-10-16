/**
 * Rapprochement d'un nom importé avec la bibliothèque (§11.7).
 * Le résultat est une proposition : une association n'est retenue d'office que si elle a été
 * apprise lors d'un import précédent ou si un candidat se détache nettement des autres.
 */
import type { Exercise } from '../domain/types';
import { MUSCLE_GROUP_LABELS } from '../library/seed';
import { EQUIPMENT_WORDS, GROUP_WORDS, GROUP_WORDS_BY_GROUP, libraryVocabulary } from '../library/search';
import { nameKey, nameTokens, normalizeName, unknownWordsOf, withoutPrecision } from '../library/text';

export type MatchConfidence =
  /** Nom déjà confirmé lors d'un import précédent (synonyme appris). */
  | 'learned'
  /** Correspondance quasi complète, sans concurrent proche. */
  | 'certain'
  /** Meilleur candidat nettement devant les autres, à vérifier. */
  | 'probable'
  /** Plusieurs candidats proches : choix obligatoire. */
  | 'ambiguous'
  | 'none';

export interface MatchCandidate {
  variantId: string;
  exerciseId: string;
  score: number;
}

export interface MatchResult {
  confidence: MatchConfidence;
  /** Variante proposée, null si ambigu ou inconnu. */
  suggestion: string | null;
  candidates: MatchCandidate[];
  /** Précision non reconnue dans le nom (ex. « 70° »), utile pour créer une variante. */
  qualifier: string | null;
  /** Mots du nom inconnus de la bibliothèque et du lexique : la proposition est alors à confirmer (§4.2.1). */
  unknownWords: string[];
}

const CERTAIN = 0.85;
const PROBABLE = 0.6;
const CANDIDATE = 0.3;
/** Écart minimal entre le premier candidat et le suivant pour proposer une correspondance. */
export const MATCH_MARGIN = 0.25;

function score(source: string[], name: string): number {
  const target = nameTokens(name);
  if (target.length === 0 || source.length === 0) return 0;
  const sourceSet = new Set(source);
  const overlap = new Set(target.filter((t) => sourceSet.has(t))).size;
  const coverage = overlap / new Set(target).size;
  const precision = overlap / sourceSet.size;
  return coverage * 0.7 + precision * 0.3;
}

/** Noms comparables d'une variante : exercice et synonymes pour la variante standard, nom composé sinon. */
function variantNames(exercise: Exercise, variantId: string): string[] {
  const variant = exercise.variants.find((v) => v.id === variantId);
  if (!variant) return [];
  if (variant.id === exercise.id) {
    const named = variant.name !== 'Standard' ? [`${exercise.name} ${variant.name}`] : [];
    return [exercise.name, ...exercise.synonyms, ...named, ...variant.synonyms];
  }
  return [`${exercise.name} ${variant.name}`, ...variant.synonyms];
}

/** L'exercice a ce matériel, par son champ matériel ou par son nom. */
function hasEquipment(exercise: Exercise, variantId: string, word: string): boolean {
  return nameTokens(exercise.equipment).includes(word) || variantNames(exercise, variantId).some((n) => nameTokens(n).includes(word));
}

/**
 * Rapproche un nom importé de la bibliothèque, sur la forme comparable des noms (lexique appliqué, §4.2.1) :
 * « latéral raise haltère » est le nom « Élévations latérales haltères ». Un mot de matériel départage les variantes ;
 * un nom de groupe seul (« pecs ») ne désigne aucun exercice ; un mot inconnu rend la proposition « à confirmer ».
 */
export function matchExercise(sourceName: string, exercises: readonly Exercise[]): MatchResult {
  const normalized = normalizeName(sourceName);
  const key = nameKey(sourceName);
  const tokens = nameTokens(sourceName);
  const active = exercises.filter((e) => !e.archived);
  const vocabulary = libraryVocabulary(exercises);
  const unknownWords = unknownWordsOf(withoutPrecision(sourceName), (t) => vocabulary.has(t));

  // Synonyme appris : correspondance exacte sur un nom déjà confirmé.
  for (const exercise of active) {
    for (const variant of exercise.variants) {
      if (variant.archived) continue;
      if (variant.synonyms.some((s) => normalizeName(s) === normalized)) {
        return {
          confidence: 'learned',
          suggestion: variant.id,
          candidates: [{ variantId: variant.id, exerciseId: exercise.id, score: 2 }],
          qualifier: null,
          unknownWords: [],
        };
      }
    }
  }

  // Nom identique, mot pour mot une fois le lexique appliqué (dans n'importe quel ordre), à un nom ou synonyme : reconnu
  // sans ambiguïté (« leg curl allongé » est un synonyme du curl ischios, même s'il contient les mots « leg curl » ;
  // « lateral raise dumbbell » est « Élévations latérales haltères »).
  const exact = active.flatMap((exercise) =>
    exercise.variants
      .filter((v) => !v.archived && variantNames(exercise, v.id).some((n) => nameKey(n) === key))
      .map((v) => ({ variantId: v.id, exerciseId: exercise.id, score: 1.5 })),
  );
  if (exact.length === 1) {
    const chosen = active.find((e) => e.id === exact[0]!.exerciseId)!;
    return { confidence: 'certain', suggestion: exact[0]!.variantId, candidates: exact, qualifier: qualifierOf(sourceName, chosen), unknownWords: [] };
  }

  // Un nom de groupe seul (« pec », « pecs », « pectoraux ») désigne un groupe, pas un exercice :
  // les exercices du groupe sont proposés et le choix est obligatoire.
  if (tokens.length > 0 && tokens.every((t) => GROUP_WORDS.has(t))) {
    const inGroup = (g: Exercise['primaryGroup']) => tokens.every((t) => GROUP_WORDS_BY_GROUP.get(g)?.has(t));
    // Groupe principal d'abord ; un sous-groupe (« ischios », « quadri ») est cherché dans les groupes secondaires.
    const primary = active.filter((e) => inGroup(e.primaryGroup));
    const group = primary.length > 0 ? primary : active.filter((e) => e.secondaryGroups.some(inGroup));
    const list = group.map((e) => ({ variantId: e.id, exerciseId: e.id, score: CANDIDATE }));
    return { confidence: list.length > 0 ? 'ambiguous' : 'none', suggestion: null, candidates: list, qualifier: null, unknownWords: [] };
  }

  let candidates: MatchCandidate[] = [];
  for (const exercise of active) {
    for (const variant of exercise.variants) {
      if (variant.archived) continue;
      const best = Math.max(0, ...variantNames(exercise, variant.id).map((n) => score(tokens, n)));
      if (best >= CANDIDATE) candidates.push({ variantId: variant.id, exerciseId: exercise.id, score: best });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.variantId.localeCompare(b.variantId));
  // Un mot de matériel départage : si des candidats ont ce matériel, les autres sont écartés.
  const exerciseOf = (c: MatchCandidate) => active.find((e) => e.id === c.exerciseId)!;
  for (const word of tokens.filter((t) => EQUIPMENT_WORDS.has(t))) {
    const fitting = candidates.filter((c) => hasEquipment(exerciseOf(c), c.variantId, word));
    if (fitting.length > 0) candidates = fitting;
  }

  const [first, second] = candidates;
  let confidence: MatchConfidence = 'none';
  if (first) {
    const clear = !second || first.score - second.score >= MATCH_MARGIN;
    if (first.score >= PROBABLE && clear) confidence = first.score >= CERTAIN ? 'certain' : 'probable';
    else if (first.score >= CANDIDATE) confidence = 'ambiguous';
  }
  // Un mot inconnu : l'exercice est proposé, jamais retenu d'office.
  if (confidence === 'certain' && unknownWords.length > 0) confidence = 'probable';
  const suggestion = confidence === 'certain' || confidence === 'probable' ? first!.variantId : null;
  const chosen = suggestion ? active.find((e) => e.id === first!.exerciseId) : undefined;
  return {
    confidence,
    suggestion,
    candidates: candidates.slice(0, 6),
    qualifier: chosen ? qualifierOf(sourceName, chosen) : null,
    unknownWords,
  };
}

/** Partie du nom importé que l'exercice proposé n'explique pas (angle, prise, matériel…). */
export function qualifierOf(sourceName: string, exercise: Exercise): string | null {
  const groups = [exercise.primaryGroup, ...exercise.secondaryGroups].map((g) => MUSCLE_GROUP_LABELS[g]);
  const known = new Set(
    [exercise.name, ...exercise.synonyms, ...groups, ...exercise.variants.flatMap((v) => [v.name, ...v.synonyms])].flatMap(nameTokens),
  );
  const words = sourceName
    .split(/\s+/)
    .filter((w) => {
      const tokens = nameTokens(w);
      if (/\d/.test(w) && /°/.test(w)) return true;
      return tokens.length > 0 && tokens.every((t) => !known.has(t));
    });
  return words.length ? words.join(' ') : null;
}
