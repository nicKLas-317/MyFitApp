/**
 * Récapitulatif du cardio par machine (écran « Cardio », version 1.43.0) : temps, nombre de fois, distance et
 * inclinaison, pour la semaine, le mois ou depuis le début. Simple consultation : aucun objectif, aucun effet sur le
 * moteur, le récapitulatif de l'accueil, les bilans ni le mail. Fonctions pures.
 */
import { localDate, sessionStartTime, weekBounds } from '../domain/calendar';
import type { CardioMachine, Incline, Session } from '../domain/types';
import { cardioOf, INCLINES } from './model';

export type CardioRange = 'week' | 'month' | 'all';

export const CARDIO_RANGES: readonly { id: CardioRange; label: string }[] = [
  { id: 'week', label: 'Cette semaine' },
  { id: 'month', label: 'Ce mois' },
  { id: 'all', label: 'Depuis le début' },
];

export interface MachineSummary {
  /** Identifiant de la machine (le même après un renommage). */
  machineId: string;
  /** Nom actuel dans les réglages, sinon celui du dernier bloc enregistré (machine retirée depuis). */
  name: string;
  minutes: number;
  /** Nombre de fois (blocs). */
  count: number;
  /** Distance : seulement les fois où elle est saisie (absente si aucune). */
  distance?: { km: number; count: number };
  /** Minutes par inclinaison, sur les fois où elle est enregistrée (machine à inclinaison ; absente sinon). */
  inclines?: Record<Incline, number>;
}

export interface CardioSummary {
  /** Début de la période (absent pour « depuis le début »). */
  start?: Date;
  /** Jour du premier bloc compté (« AAAA-MM-JJ »), absent sans cardio. */
  firstDay?: string;
  minutes: number;
  count: number;
  /** Machines utilisées dans la période, du plus long temps au plus court. */
  machines: MachineSummary[];
}

/** Bornes de la période contenant `now` : semaine du lundi 0 h 00, mois calendaire, ou tout. */
export function cardioRangeBounds(range: CardioRange, now: number): { start: Date; next: Date } | null {
  if (range === 'all') return null;
  if (range === 'week') return weekBounds(now);
  const d = new Date(now);
  return { start: new Date(d.getFullYear(), d.getMonth(), 1), next: new Date(d.getFullYear(), d.getMonth() + 1, 1) };
}

/**
 * Cardio des séances terminées (salle et maison, rameur compris) dont le début est dans la période. Une machine
 * retirée des réglages reste listée sous le nom de son dernier bloc. Une séance en cours ne compte pas.
 */
export function cardioSummary(sessions: readonly Session[], machines: readonly CardioMachine[], range: CardioRange, now: number): CardioSummary {
  const bounds = cardioRangeBounds(range, now);
  const done = sessions
    .filter((s) => s.state === 'done' && cardioOf(s).length > 0)
    .map((s) => ({ s, t: sessionStartTime(s) }))
    .filter(({ t }) => !bounds || (t >= bounds.start.getTime() && t < bounds.next.getTime()))
    .sort((a, b) => a.t - b.t);
  const current = new Map(machines.map((m) => [m.id, m.name]));
  const byMachine = new Map<string, MachineSummary>();
  for (const { s } of done) {
    for (const b of cardioOf(s)) {
      let m = byMachine.get(b.machineId);
      if (!m) {
        m = { machineId: b.machineId, name: b.machine, minutes: 0, count: 0 };
        byMachine.set(b.machineId, m);
      }
      m.name = current.get(b.machineId) ?? b.machine;
      m.minutes += b.minutes;
      m.count += 1;
      if (b.distanceKm !== undefined) {
        m.distance ??= { km: 0, count: 0 };
        m.distance.km = Math.round((m.distance.km + b.distanceKm) * 100) / 100;
        m.distance.count += 1;
      }
      if (b.incline) {
        m.inclines ??= { neutre: 0, moyenne: 0, haute: 0 };
        m.inclines[b.incline] += b.minutes;
      }
    }
  }
  const list = [...byMachine.values()].sort((a, b) => b.minutes - a.minutes || b.count - a.count || a.name.localeCompare(b.name, 'fr'));
  return {
    ...(bounds ? { start: bounds.start } : {}),
    ...(done.length > 0 ? { firstDay: localDate(done[0]!.t) } : {}),
    minutes: list.reduce((n, m) => n + m.minutes, 0),
    count: list.reduce((n, m) => n + m.count, 0),
    machines: list,
  };
}

/**
 * Répartition du temps par inclinaison, en pourcentages entiers dont la somme fait 100 (plus forts restes),
 * dans l'ordre neutre, moyenne, haute.
 */
export function inclinePercents(inclines: Record<Incline, number>): { incline: Incline; percent: number }[] {
  const total = INCLINES.reduce((n, i) => n + inclines[i], 0);
  if (total <= 0) return INCLINES.map((incline) => ({ incline, percent: 0 }));
  const raw = INCLINES.map((incline) => ({ incline, exact: (inclines[incline] * 100) / total }));
  const out = raw.map((r) => ({ incline: r.incline, percent: Math.floor(r.exact) }));
  let missing = 100 - out.reduce((n, r) => n + r.percent, 0);
  const order = raw.map((r, i) => ({ i, rest: r.exact - Math.floor(r.exact) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (missing <= 0) break;
    out[i]!.percent += 1;
    missing -= 1;
  }
  return out;
}

/** « 12,5 km », « 2,35 km ». */
export function formatKm(km: number): string {
  return `${km.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km`;
}
