/**
 * Recherche unique par exercice, machine ou groupe musculaire (§4.1, §4.2).
 * Elle repose sur les métadonnées structurées (noms, synonymes, variantes, groupes, matériel),
 * pas sur le seul nom affiché. Fonctions pures, sans dépendance à l'interface.
 */
import type { Exercise, MuscleGroup, Session, Variant } from '../domain/types';
import { MUSCLE_GROUP_LABELS } from './seed';
import { canonicalName, nameTokens, normalizeName, unknownWordsOf } from './text';

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
  /** Noms et synonymes complets, sous leur forme comparable (lexique appliqué), pour les correspondances d'expression. */
  phrases: string[];
  /** Les mêmes, seulement normalisés (sans lexique) : une saisie en cours (« lat pull ») y est retrouvée. */
  rawPhrases: string[];
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
      // La variante standard est aussi trouvée par son nom quand elle en a un (« Prise moyenne »).
      if (!standard || variant.name !== 'Standard') names.push(variant.name, `${exercise.name} ${variant.name}`);
      entries.push({
        exercise,
        variant,
        names: tokensOf(names),
        phrases: names.map(canonicalName),
        rawPhrases: names.map(normalizeName),
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

/** Mots désignant le matériel (§4.2.1) : ils départagent les variantes au lieu d'exclure. */
export const EQUIPMENT_WORDS: ReadonlySet<string> = new Set(['haltère', 'machine', 'poulie', 'barre'].flatMap(nameTokens));

/** L'entrée correspond au matériel désigné : par son matériel ou par son nom. */
function hasEquipment(entry: SearchEntry, word: string): boolean {
  return entry.equipment.has(word) || entry.names.has(word);
}

/** Score d'une entrée, ou null si un mot saisi ne correspond à rien. */
function phraseIn(phrase: string, phrases: readonly string[]): boolean {
  // Expression saisie en début de mot (« dos » ne correspond pas à « abdos ») ; une expression
  // en plusieurs mots est aussi comparée sans espaces (« pull down » = « pulldown »).
  const compact = phrase.replace(/ /g, '');
  return (
    phrase.length >= 3 &&
    phrases.some((p) => ` ${p}`.includes(` ${phrase}`) || (phrase.includes(' ') && compact.length >= 6 && p.replace(/ /g, '').includes(compact)))
  );
}

function scoreEntry(entry: SearchEntry, words: string[], phrase: string, raw: string): { score: number; via: MatchField } | null {
  const phraseHit = phraseIn(phrase, entry.phrases) || (raw.includes(' ') && phraseIn(raw, entry.rawPhrases));
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

/** Tous les mots connus de l'index (noms, synonymes, groupes, matériel), pour repérer un mot inconnu. */
const vocabularies = new WeakMap<readonly SearchEntry[], Set<string>>();
function vocabulary(index: readonly SearchEntry[]): Set<string> {
  let v = vocabularies.get(index);
  if (!v) {
    v = new Set(index.flatMap((e) => [...e.names, ...e.primary, ...e.secondary, ...e.equipment]));
    vocabularies.set(index, v);
  }
  return v;
}

/** Mots connus de la bibliothèque (noms, synonymes, groupes, matériel), sous leur forme comparable. */
const libraryVocabularies = new WeakMap<readonly Exercise[], Set<string>>();
export function libraryVocabulary(exercises: readonly Exercise[]): Set<string> {
  let v = libraryVocabularies.get(exercises);
  if (!v) {
    v = vocabulary(buildSearchIndex(exercises));
    libraryVocabularies.set(exercises, v);
  }
  return v;
}

/** Mots désignant chaque groupe musculaire (« pec », « abdos », « legs »…), sous leur forme comparable. */
export const GROUP_WORDS_BY_GROUP: ReadonlyMap<MuscleGroup, ReadonlySet<string>> = new Map(
  (Object.keys(GROUP_ALIASES) as MuscleGroup[]).map((g) => [g, new Set(groupTokens(g).flatMap(nameTokens))]),
);
export const GROUP_WORDS: ReadonlySet<string> = new Set([...GROUP_WORDS_BY_GROUP.values()].flatMap((s) => [...s]));

export interface SearchOutcome {
  results: SearchResult[];
  /** Mots inconnus de la bibliothèque, ignorés parce que les autres suffisent (§4.2.1). */
  ignored: string[];
}

/**
 * Recherche instantanée, sur la forme comparable de la saisie (lexique appliqué, §4.2.1).
 * - Chaque mot doit correspondre, sauf un mot inconnu de toute la bibliothèque, ignoré si au moins deux autres
 *   mots sont reconnus et qu'ils sont plus nombreux (« élévation latérale xyz » trouve les élévations latérales ;
 *   « tirage nuque » ne trouve rien, « tirage » seul ne désignant pas un exercice).
 * - Un mot de matériel (haltères, machine, poulie, barre) départage : si des résultats ont ce matériel,
 *   les autres sont écartés (« latéral raise haltère » → haltères, jamais la machine).
 * Une requête vide renvoie une liste vide : l'appelant affiche alors favoris, récents et la bibliothèque complète.
 */
export function searchWithInfo(index: readonly SearchEntry[], query: string): SearchOutcome {
  const all = [...new Set(nameTokens(query))];
  const raw = normalizeName(query);
  if (all.length === 0 && !raw) return { results: [], ignored: [] };
  if (all.length === 0) all.push(...raw.split(' '));
  const vocab = vocabulary(index);
  const known = all.filter((w) => [...vocab].some((t) => tokenQuality(w, t) > 0));
  const unknown = all.filter((w) => !known.includes(w));
  // Une saisie en cours d'une expression connue (« lat pull ») n'a pas de mot inconnu.
  const typing = raw.includes(' ') && index.some((e) => phraseIn(raw, e.rawPhrases));
  const ignore = !typing && unknown.length > 0 && known.length >= 2 && known.length > unknown.length;
  const words = ignore ? known : all;
  const equipmentWords = words.filter((w) => EQUIPMENT_WORDS.has(w));
  const required = words.filter((w) => !EQUIPMENT_WORDS.has(w));
  // Requête faite seulement de matériel (« poulie », « dos haltère » sans autre mot) : le matériel est exigé.
  const scoredWords = required.length > 0 ? required : words;
  const phrase = words.join(' ');

  let results: SearchResult[] = [];
  for (const entry of index) {
    const scored = scoreEntry(entry, scoredWords, phrase, raw);
    if (!scored) continue;
    if (required.length > 0) for (const w of equipmentWords) if (hasEquipment(entry, w)) scored.score += WEIGHT.equipment;
    results.push({ entry, ...scored });
  }
  for (const w of equipmentWords) {
    if (results.some((r) => hasEquipment(r.entry, w))) results = results.filter((r) => hasEquipment(r.entry, w));
  }
  results.sort(
    (a, b) =>
      b.score - a.score ||
      Number(!!b.entry.variant.favorite) - Number(!!a.entry.variant.favorite) ||
      a.entry.exercise.name.localeCompare(b.entry.exercise.name, 'fr') ||
      a.entry.variant.name.localeCompare(b.entry.variant.name, 'fr'),
  );
  // Mots montrés tels qu'écrits (normalisés), pas sous leur racine.
  const shown = ignore ? unknownWordsOf(query, (t) => [...vocab].some((v) => tokenQuality(t, v) > 0)) : [];
  return { results, ignored: shown.length > 0 ? shown : ignore ? unknown : [] };
}

export function searchExercises(index: readonly SearchEntry[], query: string): SearchResult[] {
  return searchWithInfo(index, query).results;
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
