/**
 * Rapprochement d'un nom importé avec la bibliothèque (§11.7).
 * Le résultat est une proposition : une association n'est retenue d'office que si elle a été
 * apprise lors d'un import précédent ou si un candidat se détache nettement des autres.
 */
import type { Exercise } from '../domain/types';
import { MUSCLE_GROUP_LABELS } from '../library/seed';
import { nameTokens, normalizeName } from '../library/text';

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
  if (variant.id === exercise.id) return [exercise.name, ...exercise.synonyms, ...variant.synonyms];
  return [`${exercise.name} ${variant.name}`, ...variant.synonyms];
}

export function matchExercise(sourceName: string, exercises: readonly Exercise[]): MatchResult {
  const normalized = normalizeName(sourceName);
  const tokens = nameTokens(sourceName);
  const active = exercises.filter((e) => !e.archived);

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
        };
      }
    }
  }

  const candidates: MatchCandidate[] = [];
  for (const exercise of active) {
    for (const variant of exercise.variants) {
      if (variant.archived) continue;
      const best = Math.max(0, ...variantNames(exercise, variant.id).map((n) => score(tokens, n)));
      if (best >= CANDIDATE) candidates.push({ variantId: variant.id, exerciseId: exercise.id, score: best });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.variantId.localeCompare(b.variantId));

  const [first, second] = candidates;
  let confidence: MatchConfidence = 'none';
  if (first) {
    const clear = !second || first.score - second.score >= MATCH_MARGIN;
    if (first.score >= PROBABLE && clear) confidence = first.score >= CERTAIN ? 'certain' : 'probable';
    else if (first.score >= CANDIDATE) confidence = 'ambiguous';
  }
  const suggestion = confidence === 'certain' || confidence === 'probable' ? first!.variantId : null;
  const chosen = suggestion ? active.find((e) => e.id === first!.exerciseId) : undefined;
  return {
    confidence,
    suggestion,
    candidates: candidates.slice(0, 6),
    qualifier: chosen ? qualifierOf(sourceName, chosen) : null,
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
