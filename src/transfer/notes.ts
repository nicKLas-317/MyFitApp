/**
 * Lecture de notes de séance en texte brut (§11.2 à §11.5). Un bloc collé = une séance.
 * Rien n'est inventé : une information absente reste absente et est signalée.
 */
import type { Feeling } from '../domain/types';
import { readFeelingSymbol } from './feelings';
import { normalizeNotation, stripAccents } from '../library/text';

export type ParseIssue =
  /** Aucune ligne de performance sous ce nom. */
  | 'no_notation'
  /** Ligne chiffrée non reconnue. */
  | 'ambiguous_format'
  | 'missing_weight'
  /** Poids seul : historique partiel (§11.8). */
  | 'weight_only'
  /** Symbole de ressenti non reconnu, à confirmer (§7.3). */
  | 'unknown_symbol'
  /** Répétitions détaillées : cible déduite de la meilleure série, à vérifier. */
  | 'target_inferred'
  /** Le nombre de répétitions détaillées ne correspond pas au nombre de séries. */
  | 'sets_mismatch';

export interface ParsedEntry {
  sourceName: string;
  sourceLine: string | null;
  plannedSets: number | null;
  targetReps: number | null;
  reps: number[] | null;
  weightKg: number | null;
  feeling: Feeling;
  /** Symbole lu tel quel, connu ou non. */
  feelingSymbol: string | null;
  issues: ParseIssue[];
}

export interface ParsedNotes {
  /** Date trouvée dans le texte (YYYY-MM-DD), à confirmer. */
  date: string | null;
  /** La date trouvée n'indiquait pas l'année : elle a été complétée et doit être vérifiée. */
  dateYearAssumed: boolean;
  title: string | null;
  entries: ParsedEntry[];
}

const W = String.raw`(\d+(?:\.\d+)?)\s*(?:kgs?|kilos?)?`;
const REPS_LIST = String.raw`(\d+(?:\s*[-/]\s*\d+)+)`;

interface NotationMatch {
  index: number;
  end: number;
  plannedSets: number | null;
  targetReps: number | null;
  reps: number[] | null;
  weightKg: number | null;
  issues: ParseIssue[];
}

const PATTERNS: { re: RegExp; read(m: RegExpExecArray): Omit<NotationMatch, 'index' | 'end'> }[] = [
  // 3x8-8-7x52kg
  {
    re: new RegExp(String.raw`(\d+)\s*x\s*${REPS_LIST}\s*(?:reps?\s*)?(?:x|à|a|@)\s*${W}`),
    read: (m) => detailed(Number(m[1]), m[2]!, m[3]!),
  },
  // 3x8x52kg, 3 x 8 x 52 kgs
  {
    re: new RegExp(String.raw`(\d+)\s*x\s*(\d+)\s*(?:reps?\s*)?x\s*${W}`),
    read: (m) => uniform(Number(m[1]), Number(m[2]), Number(m[3])),
  },
  // 3 séries de 8 à 52 kg
  {
    re: new RegExp(String.raw`(\d+)\s*s[ée]ries?\s*(?:de\s*)?(\d+)\s*(?:r[ée]p[ée]titions?|reps?)?\s*(?:à|a|@|avec)\s*${W}`),
    read: (m) => uniform(Number(m[1]), Number(m[2]), Number(m[3])),
  },
  // 8-8-7 x 52kg
  {
    re: new RegExp(String.raw`${REPS_LIST}\s*(?:reps?\s*)?(?:x|à|a|@)\s*${W}`),
    read: (m) => detailed(null, m[1]!, m[2]!),
  },
  // 3x8 ou 3 séries de 8, sans poids
  {
    re: /(\d+)\s*(?:x|s[ée]ries?\s*(?:de)?)\s*(\d+)(?!\s*(?:x|\d|\.|[-/]))/,
    read: (m) => ({ ...uniform(Number(m[1]), Number(m[2]), null), issues: ['missing_weight'] }),
  },
  // 52kg seul : historique partiel
  {
    re: /(?:^|\s)(\d+(?:\.\d+)?)\s*(?:kgs?|kilos?)(?![a-z])/,
    read: (m) => ({ plannedSets: null, targetReps: null, reps: null, weightKg: Number(m[1]), issues: ['weight_only'] }),
  },
];

function uniform(sets: number, reps: number, weight: number | null): Omit<NotationMatch, 'index' | 'end'> {
  return {
    plannedSets: sets,
    targetReps: reps,
    reps: Array.from({ length: sets }, () => reps),
    weightKg: weight,
    issues: [],
  };
}

function detailed(sets: number | null, list: string, weight: string): Omit<NotationMatch, 'index' | 'end'> {
  const reps = list.split(/\s*[-/]\s*/).map(Number);
  const issues: ParseIssue[] = ['target_inferred'];
  if (sets !== null && sets !== reps.length) issues.push('sets_mismatch');
  return {
    plannedSets: sets ?? reps.length,
    targetReps: Math.max(...reps),
    reps,
    weightKg: Number(weight),
    issues,
  };
}

/** Prépare une ligne : notation normalisée, virgule décimale → point (même longueur que l'original). */
function prepare(line: string): string {
  return normalizeNotation(line).replace(/(\d),(\d)/g, '$1.$2');
}

export function findNotation(line: string): NotationMatch | null {
  const text = prepare(line);
  for (const { re, read } of PATTERNS) {
    const m = re.exec(text);
    if (m) return { index: m.index, end: m.index + m[0].length, ...read(m) };
  }
  return null;
}

/** Ligne chiffrée qui ressemble à une notation sans en être une (à signaler). */
function looksLikeNotation(line: string): boolean {
  const text = prepare(line);
  return /\d/.test(text) && /(\dx|x\d|\d\s+x\s|kg|s[ée]rie|reps?\b|r[ée]p)/.test(text);
}

const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

function isoDate(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Complète une année absente : l'année courante, ou la précédente si la date serait dans le futur. */
function withYear(m: number, d: number, today: string): string | null {
  const year = Number(today.slice(0, 4));
  const candidate = isoDate(year, m, d);
  if (candidate && candidate <= today) return candidate;
  return isoDate(year - 1, m, d);
}

/** Cherche une date dans une ligne : 2026-10-12, 12/10/2026, 12.10.26, 12 octobre 2026, 12 oct. */
export function detectDate(line: string, today: string): { date: string; yearAssumed: boolean } | null {
  const text = stripAccents(line.toLowerCase());
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (m) {
    const date = isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
    return date ? { date, yearAssumed: false } : null;
  }
  m = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/.exec(text);
  if (m) {
    const [d, mo] = [Number(m[1]), Number(m[2])];
    if (m[3]) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      const date = isoDate(y, mo, d);
      return date ? { date, yearAssumed: false } : null;
    }
    const date = withYear(mo, d, today);
    return date ? { date, yearAssumed: true } : null;
  }
  m = new RegExp(String.raw`\b(\d{1,2})(?:er)?\s+(${MONTHS.map((x) => x.slice(0, 3)).join('|')})[a-z]*\.?(?:\s+(\d{4}))?`).exec(text);
  if (m) {
    const mo = MONTHS.findIndex((x) => x.startsWith(m![2]!)) + 1;
    const d = Number(m[1]);
    if (m[3]) {
      const date = isoDate(Number(m[3]), mo, d);
      return date ? { date, yearAssumed: false } : null;
    }
    const date = withYear(mo, d, today);
    return date ? { date, yearAssumed: true } : null;
  }
  return null;
}

function cleanName(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/^[\s:–—-]+|[\s:–—-]+$/g, '').trim();
}

/** Lit un bloc de notes correspondant à une séance. `today` (YYYY-MM-DD) sert à compléter une année absente. */
export function parseNotes(text: string, today: string): ParsedNotes {
  const result: ParsedNotes = { date: null, dateYearAssumed: false, title: null, entries: [] };
  let pending: string[] = [];
  let lastName: string | null = null;

  /** Un nom isolé par une ligne vide puis suivi de sa notation ne forme qu'une seule entrée. */
  const takeOrphan = (name: string) => {
    const last = result.entries.at(-1);
    if (last && last.sourceName === name && last.issues.length === 1 && last.issues[0] === 'no_notation') result.entries.pop();
  };

  const flushPending = () => {
    if (pending.length === 0) return;
    const name = cleanName(pending.join(' '));
    pending = [];
    if (!name) return;
    if (result.entries.length === 0 && result.title === null) {
      result.title = name;
      return;
    }
    result.entries.push(emptyEntry(name, null, ['no_notation']));
    lastName = name;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flushPending();
      continue;
    }
    const notation = findNotation(line);
    if (!notation) {
      if (result.date === null) {
        const found = detectDate(line, today);
        if (found && !looksLikeNotation(line)) {
          result.date = found.date;
          result.dateYearAssumed = found.yearAssumed;
          continue;
        }
      }
      if (looksLikeNotation(line)) {
        const name: string | null = pending.length ? cleanName(pending.join(' ')) : lastName;
        if (!pending.length && name) takeOrphan(name);
        pending = [];
        result.entries.push(emptyEntry(name ?? '', line, ['ambiguous_format']));
        if (name) lastName = name;
        continue;
      }
      pending.push(line);
      continue;
    }

    const inline = cleanName(line.slice(0, notation.index));
    // « Haut du corps / Seated row / 3x8x52kg » sans ligne vide : la première ligne est le titre.
    if (!inline && pending.length > 1 && result.entries.length === 0 && result.title === null) {
      result.title = cleanName(pending.slice(0, -1).join(' '));
      pending = pending.slice(-1);
    }
    let name = inline ? cleanName([...pending, inline].join(' ')) : pending.length ? cleanName(pending.join(' ')) : lastName ?? '';
    // Le premier bloc, pris pour un titre, était en fait le nom du premier exercice.
    if (!name && result.entries.length === 0 && result.title) {
      name = result.title;
      result.title = null;
    }
    if (!inline && !pending.length && name) takeOrphan(name);
    pending = [];
    lastName = name || lastName;

    const symbol = readFeelingSymbol(line.slice(notation.end));
    const issues = [...notation.issues];
    if (symbol.kind === 'unknown') issues.push('unknown_symbol');
    result.entries.push({
      sourceName: name,
      sourceLine: line,
      plannedSets: notation.plannedSets,
      targetReps: notation.targetReps,
      reps: notation.reps,
      weightKg: notation.weightKg,
      feeling: symbol.kind === 'known' ? symbol.feeling : 'inconnu',
      feelingSymbol: symbol.kind === 'absent' ? null : symbol.symbol,
      issues,
    });
  }
  flushPending();
  return result;
}

function emptyEntry(sourceName: string, sourceLine: string | null, issues: ParseIssue[]): ParsedEntry {
  return {
    sourceName,
    sourceLine,
    plannedSets: null,
    targetReps: null,
    reps: null,
    weightKg: null,
    feeling: 'inconnu',
    feelingSymbol: null,
    issues,
  };
}
