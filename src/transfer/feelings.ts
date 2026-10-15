import type { Feeling } from '../domain/types';

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

export function isFeeling(value: unknown): value is Feeling {
  return typeof value === 'string' && (FEELING_VALUES as readonly string[]).includes(value);
}
