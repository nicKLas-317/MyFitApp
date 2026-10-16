/** Outils de normalisation du texte libre (notes, noms d'exercices). */
import lexique from './lexique.json';

/** Minuscules, sans accents, `×`/`*` → `x`, tirets typographiques → `-`, espaces insécables → espace. */
export function normalizeNotation(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[   ]/g, ' ')
    .replace(/[×✕✖*]/g, 'x')
    .replace(/[−–—]/g, '-')
    .toLowerCase();
}

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').normalize('NFC');
}

const STOP_WORDS = new Set([
  'a', 'au', 'aux', 'avec', 'de', 'des', 'du', 'en', 'et', 'la', 'le', 'les', 'l', 'd', 'sur', 'sous', 'un', 'une', 'pour', 'par',
  'the', 'with', 'on', 'of', 'and',
]);

/** Racine simple, identique pour le singulier/pluriel et le masculin/féminin : « latérales » = « latéral ». */
export function stem(token: string): string {
  let t = token;
  if (t.length > 3 && t.endsWith('s')) t = t.slice(0, -1);
  if (t.length > 4 && t.endsWith('e')) t = t.slice(0, -1);
  return t;
}

/** Texte comparable : minuscules, sans accents ni ponctuation. */
export function normalizeName(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/[’'°]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Angle précisé dans un nom (« banc incliné 70° », « 45 degrés ») : « 70° ».
 * Seule une valeur chiffrée compte ; « horizontal » ou « plat » ne sont pas convertis.
 */
export function angleOf(s: string): string | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(?:°|º|degr[eé]s?\b)/i.exec(s);
  return m ? `${m[1]!.replace(',', '.')}°` : null;
}

const GRIPS_FR = String.raw`(?:tr[eè]s\s+)?(?:serr[ée]e|large|neutre|marteau|supination|pronation|invers[ée]e|supin[ée]e|pron[ée]e)`;
const GRIPS_EN: [RegExp, string][] = [
  [/\b(?:wide|large)[\s-]grip\b/i, 'prise large'],
  [/\b(?:close|narrow)[\s-]grip\b/i, 'prise serrée'],
  [/\bneutral[\s-]grip\b/i, 'prise neutre'],
];

/**
 * Prise précisée dans un nom (« tirage vertical prise très large », « wide grip ») : « prise très large ».
 * Comme un angle, elle désigne une variante distincte (§11.11 A).
 */
export function gripOf(s: string): string | null {
  const m = new RegExp(String.raw`\bprise\s+${GRIPS_FR}`, 'iu').exec(s);
  if (m) return m[0].toLowerCase().replace(/\s+/g, ' ');
  for (const [re, name] of GRIPS_EN) if (re.test(s)) return name;
  return null;
}

/** Le nom sans ses précisions de variante (angle chiffré, prise) : pour repérer les mots vraiment inconnus. */
export function withoutPrecision(s: string): string {
  let out = s.replace(/(\d+(?:[.,]\d+)?)\s*(?:°|º|degr[eé]s?\b)/giu, ' ').replace(new RegExp(String.raw`\bprise\s+${GRIPS_FR}`, 'giu'), ' ');
  for (const [re] of GRIPS_EN) out = out.replace(new RegExp(re.source, 'gi'), ' ');
  return out;
}

/** Précision qui distingue une variante : angle chiffré ou prise. */
export function variantPrecisionOf(s: string): string | null {
  return angleOf(s) ?? gripOf(s);
}

// ——— Lexique d'équivalences (§4.2.1) ———————————————————————————————————

/** Singulier simple pour consulter le lexique : « haltères » = « haltère », « pecs » = « pec ». */
function singular(word: string): string {
  return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word;
}

/** Mots d'une expression, normalisés comme la saisie : sans accents, majuscules, mots vides ni nombres. */
function plainWords(s: string): string[] {
  return normalizeName(s)
    .split(' ')
    .filter((t) => t && !STOP_WORDS.has(t) && !/^\d+$/.test(t));
}

interface Lexicon {
  /** Expression (mots au singulier, séparés par une espace) → mots de la forme de référence. */
  entries: Map<string, string[]>;
  longest: number;
}

function buildLexicon(data: { equivalences: Record<string, string[]>; expressionsProtegees: string[] }): Lexicon {
  const entries = new Map<string, string[]>();
  for (const [canonical, variants] of Object.entries(data.equivalences)) {
    const target = plainWords(canonical).map(singular);
    for (const v of [canonical, ...variants]) entries.set(plainWords(v).map(singular).join(' '), target);
  }
  // Une expression protégée garde ses propres mots ; étant plus longue, elle l'emporte sur ses mots isolés.
  for (const p of data.expressionsProtegees) {
    const words = plainWords(p).map(singular);
    entries.set(words.join(' '), words);
  }
  const longest = Math.max(1, ...[...entries.keys()].map((k) => k.split(' ').length));
  return { entries, longest };
}

const LEXICON = buildLexicon(lexique);

interface Span {
  /** Mots d'origine (normalisés) couverts. */
  words: string[];
  /** Mots de la forme de référence, ou le mot d'origine s'il n'est pas dans le lexique. */
  out: string[];
}

/** Découpe en expressions du lexique, la plus longue d'abord ; un mot hors lexique forme son propre segment. */
function lexiconSpans(words: readonly string[]): Span[] {
  const singulars = words.map(singular);
  const spans: Span[] = [];
  for (let i = 0; i < words.length; ) {
    let span: Span = { words: [words[i]!], out: [words[i]!] };
    for (let len = Math.min(LEXICON.longest, words.length - i); len > 0; len--) {
      const target = LEXICON.entries.get(singulars.slice(i, i + len).join(' '));
      if (target) {
        span = { words: words.slice(i, i + len), out: target };
        break;
      }
    }
    spans.push(span);
    i += span.words.length;
  }
  return spans;
}

function applyLexicon(words: readonly string[]): string[] {
  return lexiconSpans(words).flatMap((s) => s.out);
}

/**
 * Mots d'une saisie que ni le lexique ni la bibliothèque ne connaissent (`known` reçoit une racine).
 * Un mot qui fait partie d'une expression du lexique (« pull » dans « lat pull ») est connu.
 */
export function unknownWordsOf(s: string, known: (token: string) => boolean): string[] {
  return [
    ...new Set(
      lexiconSpans(plainWords(s))
        .filter((span) => span.words.length === 1 && !span.out.map(stem).every(known))
        .map((span) => span.words[0]!),
    ),
  ];
}

/**
 * Mots significatifs (racines) d'une saisie ou d'un nom de la bibliothèque : normalisation (accents, majuscules,
 * ponctuation, mots vides, nombres), lexique d'équivalences, puis racine (pluriel, féminin).
 * C'est la seule forme utilisée pour comparer : « latéral raise haltère » = « élévations latérales haltères ».
 */
export function nameTokens(s: string): string[] {
  return applyLexicon(plainWords(s)).map(stem);
}

/** Forme comparable d'un nom entier : ses mots significatifs, dans l'ordre. */
export function canonicalName(s: string): string {
  return nameTokens(s).join(' ');
}

/**
 * Clé d'identité d'un nom : ses mots significatifs, sans ordre ni doublon. Le français et l'anglais
 * ne rangent pas les mots pareil : « latéral raise haltère » a la clé d'« Élévations latérales haltères ».
 */
export function nameKey(s: string): string {
  return [...new Set(nameTokens(s))].sort().join(' ');
}
