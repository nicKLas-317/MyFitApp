/**
 * Données simulées pour la séance pour compléter la semaine (version 1.39.0, §5.15) : jamais chargées par
 * l'application (vérifié par le test 292).
 * - Trois semaines ordinaires (19 oct., 26 oct., 2 nov. 2026) : lundi 18 h à la salle (chest press, pec deck,
 *   extension triceps poulie, élévations latérales, puis tapis 10 min et rameur 5 min), jeudi 18 h à la salle (tirage
 *   vertical, tirage horizontal, curl haltères, presse, leg extension, puis rameur 5 min), samedi 10 h à la maison
 *   (crunch au sol, au poids du corps).
 * - Semaine en cours (9 nov.) : lundi comme d'habitude ; mardi presse, leg extension et curl ; mercredi tirage vertical
 *   et chest press. Jeudi 12 nov. à 9 h : pectoraux 2, dos 1 (travaillé hier), épaules, biceps et triceps 1,5,
 *   jambes 1.
 */
import type { CardioBlock, Performance, Session } from '../../domain/types';
import { defaultSessionName } from '../../session/format';

export interface DaySpec {
  /** « YYYY-MM-DD ». */
  date: string;
  hour?: number;
  variants: string[];
  /** Blocs de cardio, dans l'ordre d'ajout : [machine, minutes]. */
  cardio?: [CardioMachineId, number][];
  home?: boolean;
}

type CardioMachineId = 'tapis' | 'rameur';
const MACHINES: Record<CardioMachineId, Omit<CardioBlock, 'id' | 'minutes'>> = {
  tapis: { machineId: 'tapis', machine: 'Tapis de marche', incline: 'neutre' },
  rameur: { machineId: 'rameur', machine: 'Rameur' },
};

const MONDAY = ['chest-press', 'pec-deck', 'extension-triceps-poulie', 'elevations-laterales'];
const THURSDAY = ['tirage-vertical', 'tirage-horizontal', 'curl-biceps-halteres', 'presse-a-cuisses', 'leg-extension'];

/** Trois semaines ordinaires avant la semaine en cours. */
export const PAST_WEEKS: DaySpec[] = ['2026-10-19', '2026-10-26', '2026-11-02'].flatMap((monday): DaySpec[] => {
  const day = (delta: number) => {
    const [y, m, d] = monday.split('-').map(Number) as [number, number, number];
    const t = new Date(y, m - 1, d + delta);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  };
  return [
    { date: monday, variants: MONDAY, cardio: [['tapis', 10], ['rameur', 5]] },
    { date: day(3), variants: THURSDAY, cardio: [['rameur', 5]] },
    { date: day(5), hour: 10, variants: ['crunch-sol'], home: true },
  ];
});

/** Semaine du lundi 9 novembre 2026, jusqu'au mercredi. */
export const CURRENT_WEEK: DaySpec[] = [
  { date: '2026-11-09', variants: MONDAY, cardio: [['tapis', 10], ['rameur', 5]] },
  { date: '2026-11-10', variants: ['presse-a-cuisses', 'leg-extension', 'curl-biceps-halteres'] },
  { date: '2026-11-11', variants: ['tirage-vertical', 'chest-press'] },
];

/** Jeudi 12 novembre 2026, 9 h. */
export const WEEK_NOW = new Date(2026, 10, 12, 9).getTime();

const WEIGHTS: Record<string, number> = { 'elevations-laterales': 8, 'curl-biceps-halteres': 10, 'crunch-sol': 0 };

export function daySession(spec: DaySpec): Session {
  const [y, m, d] = spec.date.split('-').map(Number) as [number, number, number];
  const start = new Date(y, m - 1, d, spec.hour ?? 18).getTime();
  const performances: Performance[] = spec.variants.map((variantId) => ({
    variantId,
    weightKg: WEIGHTS[variantId] ?? 40,
    targetReps: variantId === 'crunch-sol' ? 12 : 10,
    plannedSets: 3,
    reps: variantId === 'crunch-sol' ? [12, 12, 12] : [10, 10, 10],
    feeling: 'bien',
  }));
  const cardio = (spec.cardio ?? []).map(([machine, minutes], i): CardioBlock => ({ id: `cardio-${spec.date}-${i}`, ...MACHINES[machine], minutes }));
  return {
    id: `semaine-${spec.date}${spec.home ? '-maison' : ''}`,
    name: defaultSessionName(start),
    date: spec.date,
    startedAt: start,
    endedAt: start + 60 * 60_000,
    createdAt: start,
    updatedAt: start,
    origin: 'app',
    state: 'done',
    performances,
    ...(cardio.length > 0 ? { cardio } : {}),
    ...(spec.home ? { location: 'maison' as const } : {}),
  };
}

/** Séances simulées : les semaines passées, puis celles de la semaine en cours. */
export function weekHistory(current: DaySpec[] = CURRENT_WEEK, past: DaySpec[] = PAST_WEEKS): Session[] {
  return [...past, ...current].map(daySession);
}
