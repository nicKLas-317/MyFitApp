/**
 * Données simulées pour les tests du bilan par groupe musculaire (§19.10) : jamais chargées par l'application.
 * Du lundi 1er juin au jeudi 22 octobre 2026 (près de 5 mois), deux séances par semaine :
 * - lundi : chest press et pec deck (pectoraux, en progression régulière, avec retour à 3×8 au poids supérieur),
 *   développé épaules machine et élévations latérales (épaules, en régression), dips assistés (triceps, exercice
 *   assisté : l'aide baisse) ;
 * - jeudi : tirage vertical et rowing haltère (dos, stagnation), curl haltères (biceps, lente progression),
 *   extension triceps poulie (triceps, stable), presse à cuisses (jambes, progression).
 * Semaines sans séance : 10, 17 et 24 août (vacances) et 21 septembre ; une seule séance la semaine du 5 octobre.
 */
import type { Performance, Session } from '../../domain/types';
import { defaultSessionName } from '../../session/format';

/** Lundis sans séance, et jeudis sans séance. */
const SKIPPED_WEEKS = ['2026-08-10', '2026-08-17', '2026-08-24', '2026-09-21'];
const SKIPPED_THURSDAYS = ['2026-10-08'];

type Plan = (k: number) => { weightKg: number; reps: number[] };

/** Progression type du moteur : +1 répétition toutes les deux séances de 8 à 12, puis poids supérieur et retour à 3×8. */
const progressive =
  (start: number, step: number): Plan =>
  (k) => {
    const level = Math.floor(k / 10);
    const target = 8 + Math.floor((k % 10) / 2);
    return { weightKg: start + level * step, reps: [target, target, target] };
  };

/** Stagnation : même charge, mêmes répétitions. */
const stagnant =
  (weightKg: number, reps: number): Plan =>
  () => ({ weightKg, reps: [reps, reps, reps] });

/** Régression : la dernière série faiblit, puis la charge baisse. */
const regressing =
  (start: number, drop: number): Plan =>
  (k) => {
    if (k < 12) return { weightKg: start, reps: [10, 10, 10 - Math.floor(k / 4)] };
    return { weightKg: start - drop, reps: [9, 8, 8 - Math.min(1, Math.floor((k - 12) / 4))] };
  };

/** Exercice assisté : l'aide baisse de 2,5 kg toutes les trois séances, jusqu'à 25 kg. */
const assisted: Plan = (k) => ({ weightKg: Math.max(25, 40 - 2.5 * Math.floor(k / 3)), reps: [10, 10, 10] });

const MONDAY: [string, Plan][] = [
  ['chest-press', progressive(40, 5)],
  ['pec-deck', progressive(30, 5)],
  ['developpe-epaules-machine', regressing(30, 2.5)],
  ['elevations-laterales', regressing(8, 1)],
  ['dips-assistes', assisted],
];
const THURSDAY: [string, Plan][] = [
  ['tirage-vertical', stagnant(45, 10)],
  ['rowing-haltere', stagnant(20, 10)],
  ['curl-biceps-halteres', progressive(10, 2)],
  ['extension-triceps-poulie', stagnant(20, 10)],
  ['presse-a-cuisses', progressive(100, 10)],
];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function session(date: Date, plans: [string, Plan][], counters: Map<string, number>): Session {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 18).getTime();
  const performances: Performance[] = plans.map(([variantId, plan]) => {
    const k = counters.get(variantId) ?? 0;
    counters.set(variantId, k + 1);
    const { weightKg, reps } = plan(k);
    return { variantId, weightKg, targetReps: Math.max(...reps), plannedSets: 3, reps, feeling: 'bien' };
  });
  return {
    id: `sim-${iso(date)}`, name: defaultSessionName(start), date: iso(date), startedAt: start, endedAt: start + 75 * 60_000,
    createdAt: start, updatedAt: start, origin: 'app', state: 'done', performances,
  };
}

/** Séances simulées, dans l'ordre chronologique, jusqu'au jeudi `until` inclus (22 octobre 2026 par défaut). */
export function simulatedHistory(until = '2026-10-22'): Session[] {
  const counters = new Map<string, number>();
  const sessions: Session[] = [];
  for (let monday = new Date(2026, 5, 1); iso(monday) <= until; monday.setDate(monday.getDate() + 7)) {
    if (SKIPPED_WEEKS.includes(iso(monday))) continue;
    sessions.push(session(monday, MONDAY, counters));
    const thursday = new Date(monday);
    thursday.setDate(thursday.getDate() + 3);
    if (iso(thursday) <= until && !SKIPPED_THURSDAYS.includes(iso(thursday))) sessions.push(session(thursday, THURSDAY, counters));
  }
  return sessions;
}
