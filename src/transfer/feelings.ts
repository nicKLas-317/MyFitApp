import type { Feeling, Performance, Session } from '../domain/types';

/** Correspondance des symboles de ressenti (§7.3). Tout autre symbole est signalé, jamais deviné. */
export const SYMBOL_TO_FEELING: Readonly<Record<string, Feeling>> = {
  '++': 'tres_bien',
  '+': 'bien',
  // Entre « bien passé » et « moyen » : stocké comme Moyen (orange), symbole d'origine conservé.
  '+=': 'moyen',
  '=': 'moyen',
  '-=': 'mal',
  '--': 'tres_mal',
};

/** Symbole de référence de chaque ressenti (export en notes). */
export const FEELING_TO_SYMBOL: Readonly<Partial<Record<Feeling, string>>> = {
  tres_bien: '++',
  bien: '+',
  moyen: '=',
  mal: '-=',
  tres_mal: '--',
};

export type SymbolReading =
  | { kind: 'absent' }
  | { kind: 'known'; symbol: string; feeling: Feeling }
  | { kind: 'unknown'; symbol: string };

/** Lit le symbole qui suit une notation. Les espaces internes sont ignorés (« - = » = « -= »). */
export function readFeelingSymbol(raw: string): SymbolReading {
  const symbol = raw.trim();
  if (!symbol) return { kind: 'absent' };
  const compact = symbol.replace(/\s+/g, '').replace(/[−–—]/g, '-');
  const feeling = SYMBOL_TO_FEELING[compact];
  return feeling ? { kind: 'known', symbol: compact, feeling } : { kind: 'unknown', symbol };
}

const FEELING_VALUES: readonly Feeling[] = ['tres_mal', 'mal', 'moyen', 'bien', 'tres_bien', 'inconnu'];

/** Le symbole d'origine reste attaché au ressenti tant qu'il ne le contredit pas (symbole inconnu ou concordant). */
export function symbolMatches(symbol: string, feeling: Feeling): boolean {
  const reading = readFeelingSymbol(symbol);
  return reading.kind !== 'known' || reading.feeling === feeling;
}

export function isFeeling(value: unknown): value is Feeling {
  return typeof value === 'string' && (FEELING_VALUES as readonly string[]).includes(value);
}

/**
 * Un symbole connu impose son ressenti : « += » est toujours Moyen, jamais Bien (§7.3).
 * « += » a d'abord été un symbole inconnu, et l'aperçu d'import gardait le symbole à côté du ressenti
 * choisi à la main (souvent « Bien »). Corrige ces performances ; aucun autre ressenti n'est touché.
 * Renvoie seulement les séances modifiées.
 */
export function fixPlusEqualFeelings(sessions: readonly Session[]): Session[] {
  const fixed: Session[] = [];
  for (const s of sessions) {
    if (!s.performances.some(wrongPlusEqual)) continue;
    fixed.push({ ...s, performances: s.performances.map((p) => (wrongPlusEqual(p) ? { ...p, feeling: 'moyen' } : p)) });
  }
  return fixed;
}

function wrongPlusEqual(p: Performance): boolean {
  if (p.feelingSymbol === undefined || p.feeling === 'moyen') return false;
  const symbol = readFeelingSymbol(p.feelingSymbol);
  return symbol.kind === 'known' && symbol.symbol === '+=';
}
