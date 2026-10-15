/**
 * Recherche unique par exercice, machine ou groupe musculaire (§4.1, §4.2).
 * Elle repose sur les métadonnées structurées (noms, synonymes, variantes, groupes, matériel),
 * pas sur le seul nom affiché. Fonctions pures, sans dépendance à l'interface.
 */
import type { Exercise, MuscleGroup, Session, Variant } from '../domain/types';
import { MUSCLE_GROUP_LABELS } from './seed';
import { nameTokens, normalizeName } from './text';

/** Termes désignant chaque groupe musculaire, en français et en anglais. */
export const GROUP_ALIASES: Record<MuscleGroup, string[]> = {
  dos: ['dos', 'dorsaux', 'back', 'lats'],
  pectoraux: ['pectoraux', 'pecs', 'poitrine', 'chest'],
  epaules: ['épaules', 'deltoïdes', 'shoulders', 'delts'],
  biceps: ['biceps', 'bras', 'arms'],
  triceps: ['triceps', 'bras', 'arms'],
  jambes: ['jambes', 'cuisses', 'legs'],
  quadriceps: ['quadriceps', 'quadri', 'quads', 'cuisses'],
  'ischio-jambiers': ['ischio-jambiers', 'ischios', 'hamstrings'],
  abdominaux: ['abdominaux', 'abdos', 'abs', 'sangle abdominale'],
};

/** Termes désignant le matériel. La clé est la valeur normalisée du champ `equipment`. */
const EQUIPMENT_ALIASES: Record<string, string[]> = {
  machine: ['machine'],
  poulie: ['poulie', 'câble', 'cable', 'vis-à-vis'],
  haltere: ['haltère', 'haltères', 'dumbbell', 'dumbbells'],
  barre: ['barre', 'barbell'],
  'poids du corps': ['poids du corps', 'bodyweight', 'sans matériel'],
};

/** Clé de pictogramme et d'alias pour une valeur libre de matériel (« haltère » = « haltères »). */
export function equipmentKey(equipment: string): string {
  const n = nameTokens(equipment).join(' ');
  for (const key of Object.keys(EQUIPMENT_ALIASES)) {
    if (EQUIPMENT_ALIASES[key]!.some((a) => nameTokens(a).join(' ') === n)) return key;
  }
  return n || 'autre';
}

export interface SearchEntry {
  exercise: Exercise;
  variant: Variant;
  /** Racines des noms et synonymes (exercice et variante). */
  names: Set<string>;
  /** Noms et synonymes complets normalisés, pour les correspondances d'expression. */
  phrases: string[];
  primary: Set<string>;
  secondary: Set<string>;
  equipment: Set<string>;
}

const tokensOf = (list: readonly string[]) => new Set(list.flatMap(nameTokens));
const groupTokens = (g: MuscleGroup) => [MUSCLE_GROUP_LABELS[g], g, ...GROUP_ALIASES[g]];

/** Index des exercices-variantes visibles (non archivés, sauf demande contraire). */
export function buildSearchIndex(exercises: readonly Exercise[], options: { includeArchived?: boolean } = {}): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const exercise of exercises) {
    for (const variant of exercise.variants) {
      if (!options.includeArchived && (exercise.archived || variant.archived)) continue;
      const standard = variant.id === exercise.id;
      const names = [exercise.name, ...exercise.synonyms, ...variant.synonyms];
      if (!standard) names.push(variant.name, `${exercise.name} ${variant.name}`);
      entries.push({
        exercise,
        variant,
        names: tokensOf(names),
        phrases: names.map(normalizeName),
        primary: tokensOf(groupTokens(exercise.primaryGroup)),
        secondary: tokensOf(exercise.secondaryGroups.flatMap(groupTokens)),
        equipment: tokensOf([exercise.equipment, ...(EQUIPMENT_ALIASES[equipmentKey(exercise.equipment)] ?? [])]),
      });
    }
  }
  return entries;
}

/** Distance d'édition limitée à 1 (substitution, insertion, suppression ou inversion). */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i);
}

/** Qualité de correspondance d'un mot saisi avec un mot de l'index : 1 exact, 0,8 début de mot, 0,5 faute de frappe. */
function tokenQuality(query: string, token: string): number {
  if (query === token) return 1;
  if (token.startsWith(query)) return 0.8;
  if (query.length >= 5 && token.length >= 5 && withinOneEdit(query, token)) return 0.5;
  return 0;
}

function best(query: string, tokens: Set<string>): number {
  let q = 0;
  for (const t of tokens) q = Math.max(q, tokenQuality(query, t));
  return q;
}

/** Poids des champs : le nom l'emporte sur le groupe principal, lui-même devant le secondaire. */
const WEIGHT = { name: 3, primary: 2.5, equipment: 1.5, secondary: 1 } as const;

export type MatchField = keyof typeof WEIGHT;

export interface SearchResult {
  entry: SearchEntry;
  score: number;
  /** Champ ayant apporté la meilleure correspondance (le groupe secondaire est signalé à l'affichage). */
  via: MatchField;
}

/** Score d'une entrée, ou null si un mot saisi ne correspond à rien. */
function scoreEntry(entry: SearchEntry, words: string[], phrase: string): { score: number; via: MatchField } | null {
  // Expression saisie en début de mot (« dos » ne correspond pas à « abdos ») ; une expression
  // en plusieurs mots est aussi comparée sans espaces (« pull down » = « pulldown »).
  const compact = phrase.replace(/ /g, '');
  const phraseHit =
    phrase.length >= 3 &&
    entry.phrases.some((p) => ` ${p}`.includes(` ${phrase}`) || (phrase.includes(' ') && compact.length >= 6 && p.replace(/ /g, '').includes(compact)));
  let score = 0;
  let via: MatchField = 'name';
  let viaScore = -1;
  for (const w of words) {
    let wordBest = 0;
    let wordVia: MatchField = 'name';
    for (const field of ['name', 'primary', 'equipment', 'secondary'] as const) {
      const tokens = field === 'name' ? entry.names : entry[field];
      const s = best(w, tokens) * WEIGHT[field];
      if (s > wordBest) {
        wordBest = s;
        wordVia = field;
      }
    }
    if (wordBest === 0) {
      // « pull down » ou « pulldown » : l'expression complète suffit.
      if (!phraseHit) return null;
      wordBest = WEIGHT.name * 0.8;
      wordVia = 'name';
    }
    score += wordBest;
    if (wordBest > viaScore) {
      viaScore = wordBest;
      via = wordVia;
    }
  }
  if (phraseHit) score += entry.phrases.includes(phrase) ? 4 : 2;
  return { score, via };
}

/**
 * Recherche instantanée. Une requête vide renvoie une liste vide : l'appelant affiche alors
 * favoris, récents et la bibliothèque complète.
 */
export function searchExercises(index: readonly SearchEntry[], query: string): SearchResult[] {
  const phrase = normalizeName(query);
  const words = [...new Set(nameTokens(query))];
  if (words.length === 0 && !phrase) return [];
  if (words.length === 0) words.push(...phrase.split(' '));
  const results: SearchResult[] = [];
  for (const entry of index) {
    const scored = scoreEntry(entry, words, phrase);
    if (scored) results.push({ entry, ...scored });
  }
  return results.sort(
    (a, b) =>
      b.score - a.score ||
      Number(!!b.entry.variant.favorite) - Number(!!a.entry.variant.favorite) ||
      a.entry.exercise.name.localeCompare(b.entry.exercise.name, 'fr') ||
      a.entry.variant.name.localeCompare(b.entry.variant.name, 'fr'),
  );
}

/** Exercices-variantes récemment utilisés, du plus récent au plus ancien. */
export function recentVariantIds(sessions: readonly Session[], limit = 6): string[] {
  const ids: string[] = [];
  const done = sessions
    .filter((s) => s.state === 'done')
    .sort((a, b) => (b.date === a.date ? (b.startedAt ?? b.createdAt) - (a.startedAt ?? a.createdAt) : b.date < a.date ? -1 : 1));
  for (const s of done) for (const p of s.performances) if (!ids.includes(p.variantId)) ids.push(p.variantId);
  return ids.slice(0, limit);
}
