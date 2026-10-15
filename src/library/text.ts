/** Outils de normalisation du texte libre (notes, noms d'exercices). */

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

/** Précision qui distingue une variante : angle chiffré ou prise. */
export function variantPrecisionOf(s: string): string | null {
  return angleOf(s) ?? gripOf(s);
}

/** Mots significatifs (racines), hors mots vides et nombres. */
export function nameTokens(s: string): string[] {
  return normalizeName(s)
    .split(' ')
    .filter((t) => t && !STOP_WORDS.has(t) && !/^\d+$/.test(t))
    .map(stem);
}
