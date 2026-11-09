import { describe, expect, it } from 'vitest';
import type { CardioBlock, Session } from '../../domain/types';
import { DEFAULT_CARDIO_MACHINES } from '../model';
import { cardioRangeBounds, cardioSummary, formatKm, inclinePercents } from '../summary';

let n = 0;
/** Séance terminée (ou en cours) avec ses blocs de cardio, à la date et à l'heure données. */
function session(date: string, hour: number, cardio: Omit<CardioBlock, 'id'>[], extra: Partial<Session> = {}): Session {
  const start = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).getTime();
  return {
    id: `s${++n}`, name: 'Séance', date, startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start, origin: 'app', state: 'done',
    performances: [], cardio: cardio.map((b, i) => ({ id: `c${n}-${i}`, ...b })), ...extra,
  };
}
const tapis = (minutes: number, incline: 'neutre' | 'moyenne' | 'haute', distanceKm?: number) =>
  ({ machineId: 'tapis', machine: 'Tapis de marche', incline, minutes, ...(distanceKm !== undefined ? { distanceKm } : {}) });
const rameur = (minutes: number, distanceKm?: number) => ({ machineId: 'rameur', machine: 'Rameur', minutes, ...(distanceKm !== undefined ? { distanceKm } : {}) });

// Vendredi 6 novembre 2026, 20 h : semaine du 2 au 8 novembre, mois de novembre.
const NOW = new Date('2026-11-06T20:00:00').getTime();

describe('Récapitulatif du cardio par machine (version 1.43.0)', () => {
  it('305. Périodes : semaine du lundi 0 h 00 au dimanche, mois calendaire, depuis le début ; séances terminées seulement, salle et maison', () => {
    expect(cardioRangeBounds('week', NOW)).toEqual({ start: new Date(2026, 10, 2), next: new Date(2026, 10, 9) });
    expect(cardioRangeBounds('month', NOW)).toEqual({ start: new Date(2026, 10, 1), next: new Date(2026, 11, 1) });
    expect(cardioRangeBounds('all', NOW)).toBeNull();
    const sessions = [
      session('2026-10-20', 18, [tapis(20, 'haute')]),
      // Dimanche 1er novembre 23 h : dans le mois, pas dans la semaine.
      session('2026-11-01', 23, [rameur(10)]),
      // Lundi 2 novembre 0 h : dans la semaine.
      session('2026-11-02', 0, [tapis(15, 'neutre')]),
      session('2026-11-04', 8, [rameur(5, 1)], { location: 'maison' }),
      // Séance en cours : jamais comptée.
      session('2026-11-06', 18, [tapis(30, 'moyenne')], { state: 'active', endedAt: undefined }),
    ];
    const week = cardioSummary(sessions, DEFAULT_CARDIO_MACHINES, 'week', NOW);
    expect([week.minutes, week.count, week.firstDay]).toEqual([20, 2, '2026-11-02']);
    expect(week.machines.map((m) => [m.name, m.minutes, m.count])).toEqual([['Tapis de marche', 15, 1], ['Rameur', 5, 1]]);
    const month = cardioSummary(sessions, DEFAULT_CARDIO_MACHINES, 'month', NOW);
    expect([month.minutes, month.count]).toEqual([30, 3]);
    // Rameur compris, trié par temps décroissant.
    expect(month.machines.map((m) => [m.name, m.minutes])).toEqual([['Rameur', 15], ['Tapis de marche', 15]]);
    const all = cardioSummary(sessions, DEFAULT_CARDIO_MACHINES, 'all', NOW);
    expect([all.minutes, all.count, all.firstDay, all.start]).toEqual([50, 4, '2026-10-20', undefined]);
    expect(cardioSummary([], DEFAULT_CARDIO_MACHINES, 'all', NOW)).toEqual({ minutes: 0, count: 0, machines: [] });
  });

  it('305. Par machine : temps, nombre de fois ; distance seulement sur les fois où elle est saisie ; inclinaison du tapis en minutes', () => {
    const sessions = [
      session('2026-11-02', 18, [tapis(10, 'neutre', 0.8), rameur(5, 1.2)]),
      session('2026-11-03', 18, [tapis(20, 'haute'), rameur(5)]),
      session('2026-11-05', 18, [tapis(15, 'moyenne', 1.15)]),
    ];
    const [t, r] = cardioSummary(sessions, DEFAULT_CARDIO_MACHINES, 'week', NOW).machines;
    expect(t).toEqual({ machineId: 'tapis', name: 'Tapis de marche', minutes: 45, count: 3, distance: { km: 1.95, count: 2 }, inclines: { neutre: 10, moyenne: 15, haute: 20 } });
    // Pas d'inclinaison pour une machine sans inclinaison.
    expect(r).toEqual({ machineId: 'rameur', name: 'Rameur', minutes: 10, count: 2, distance: { km: 1.2, count: 1 } });
    const noDistance = cardioSummary([session('2026-11-02', 18, [rameur(5)])], DEFAULT_CARDIO_MACHINES, 'week', NOW).machines[0]!;
    expect(noDistance.distance).toBeUndefined();
  });

  it('305. Machine renommée : nom actuel ; machine retirée des réglages : listée quand même, sous le nom de son dernier bloc', () => {
    const sessions = [
      session('2026-10-05', 18, [{ machineId: 'cardio-stepper', machine: 'Step', minutes: 12 }]),
      session('2026-10-12', 18, [{ machineId: 'cardio-stepper', machine: 'Stepper', minutes: 8 }, { machineId: 'elliptique', machine: 'Elliptique', minutes: 30 }]),
    ];
    const machines = cardioSummary(sessions, DEFAULT_CARDIO_MACHINES, 'all', NOW).machines;
    expect(machines.map((m) => [m.machineId, m.name, m.minutes, m.count])).toEqual([
      ['elliptique', 'Vélo elliptique', 30, 1],
      ['cardio-stepper', 'Stepper', 20, 2],
    ]);
  });

  it('305. Répartition par inclinaison en pourcentages entiers, somme 100 ; formats', () => {
    expect(inclinePercents({ neutre: 10, moyenne: 10, haute: 10 }).map((i) => i.percent)).toEqual([34, 33, 33]);
    expect(inclinePercents({ neutre: 10, moyenne: 33, haute: 16 }).map((i) => i.percent)).toEqual([17, 56, 27]);
    expect(inclinePercents({ neutre: 6, moyenne: 10, haute: 0 })).toEqual([
      { incline: 'neutre', percent: 38 },
      { incline: 'moyenne', percent: 62 },
      { incline: 'haute', percent: 0 },
    ]);
    expect(inclinePercents({ neutre: 0, moyenne: 0, haute: 0 }).map((i) => i.percent)).toEqual([0, 0, 0]);
    expect([formatKm(12.5), formatKm(0.6), formatKm(4.15)]).toEqual(['12,5 km', '0,6 km', '4,15 km']);
  });

  it('305. Calcul pur : séances et liste des machines inchangées', () => {
    const sessions = [session('2026-11-02', 18, [tapis(10, 'neutre', 0.8)])];
    const copy = structuredClone(sessions);
    cardioSummary(sessions, DEFAULT_CARDIO_MACHINES, 'all', NOW);
    expect(sessions).toEqual(copy);
  });
});
