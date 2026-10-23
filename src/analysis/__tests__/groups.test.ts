import { describe, expect, it } from 'vitest';
import type { Exercise, Performance, Session } from '../../domain/types';
import { rebuildProfile } from '../../engine';
import { buildEngineSettings } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { epley, groupIndex, groupWeeklySets, nearestBodyWeight, notEnoughForIndex, notEnoughForSets, performanceIndex } from '../groups';
import { simulatedHistory } from './simulation';

/** Sources de l'application, hors tests : aucune ne doit charger les données simulées. */
const APP_SOURCES = import.meta.glob<string>(['../../**/*.{ts,tsx}', '!../../**/__tests__/**'], { query: '?raw', import: 'default', eager: true });
const LIB: Exercise[] = [...SEED_EXERCISES];
const SETTINGS = buildEngineSettings(LIB);
/** Heure locale, 2026 ; `m` : mois (1–12). */
const at = (m: number, d: number, h = 18, min = 0) => new Date(2026, m - 1, d, h, min).getTime();
const iso = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let n = 0;
function session(start: number, perfs: [string, number, number[]][], extra: Partial<Session> = {}): Session {
  return {
    id: `g${++n}`, name: 'Séance', date: iso(start), startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start,
    origin: 'app', state: 'done',
    performances: perfs.map(([variantId, weightKg, reps]) => ({ variantId, weightKg, reps, targetReps: Math.max(...reps), plannedSets: 3, feeling: 'bien' })),
    ...extra,
  };
}
const perf = (weightKg: number, reps: number[]): Performance => ({ variantId: 'x', weightKg, reps, targetReps: Math.max(...reps), plannedSets: 3, feeling: 'bien' });
const values = (sessions: Session[], group: Parameters<typeof groupIndex>[3]) => groupIndex(sessions, LIB, SETTINGS, group).points.map((p) => Number(p.value.toFixed(2)));

describe('Bilan par groupe musculaire', () => {
  it('209. Indice : Epley sur la moins bonne série, base 100 à la première séance de l’exercice', () => {
    expect(epley(40, 8)).toBeCloseTo(50.667, 3);
    const first = perf(40, [8, 8, 8]);
    expect(performanceIndex(first, first, false)).toBe(100);
    // La moins bonne série compte : 9-9-8 vaut 8.
    expect(performanceIndex(perf(40, [9, 9, 8]), first, false)).toBeCloseTo(100, 10);
    expect(performanceIndex(perf(40, [10, 10, 10]), first, false)).toBeCloseTo((100 * 40 * (1 + 10 / 30)) / (40 * (1 + 8 / 30)), 6);
    const sessions = [
      session(at(10, 5), [['chest-press', 40, [8, 8, 8]]]),
      session(at(10, 8), [['chest-press', 40, [9, 9, 9]]]),
      session(at(10, 12), [['chest-press', 40, [10, 10, 9]]]),
    ];
    expect(values(sessions, 'pectoraux')).toEqual([100, 102.63, 102.63]);
  });

  it('210. Indice du groupe : moyenne des indices de ses exercices, chacun avec sa dernière valeur connue ; un point par date', () => {
    const sessions = [
      session(at(10, 5), [['chest-press', 40, [8, 8, 8]]]),
      session(at(10, 8), [['pec-deck', 30, [8, 8, 8]]]), // pec deck : 100 ; chest press garde 100
      session(at(10, 12), [['chest-press', 40, [11, 11, 11]]]), // chest press 107,89 ; pec deck garde 100
      session(at(10, 12, 20), [['pec-deck', 30, [11, 11, 11]]]), // même jour : un seul point, après la seconde séance
    ];
    const index = groupIndex(sessions, LIB, SETTINGS, 'pectoraux');
    expect(index.points.map((p) => [p.date, Number(p.value.toFixed(2))])).toEqual([
      ['2026-10-05', 100],
      ['2026-10-08', 100],
      ['2026-10-12', 107.89],
    ]);
    expect(index.variantIds).toEqual(['chest-press', 'pec-deck']);
    // Les charges brutes ne sont jamais mélangées : 100 kg de presse et 40 kg de leg extension donnent 100 chacun.
    expect(values([session(at(10, 5), [['presse-a-cuisses', 100, [8, 8, 8]], ['leg-extension', 40, [8, 8, 8]]])], 'jambes')).toEqual([100]);
  });

  it('211. Exercice assisté sans pesée : l’indice monte quand l’aide baisse (aide inversée)', () => {
    const first = perf(30, [8, 8, 8]);
    expect(performanceIndex(perf(25, [8, 8, 8]), first, true)).toBeCloseTo(116.67, 2);
    expect(performanceIndex(perf(35, [8, 8, 8]), first, true)).toBeCloseTo(83.33, 2);
    expect(performanceIndex(perf(30, [10, 10, 10]), first, true)).toBeCloseTo(105.26, 2);
    expect(performanceIndex(perf(70, [8, 8, 8]), first, true)).toBe(0);
    // Dans un groupe : dips assistés (triceps), aide de 40 à 35 kg.
    expect(values([session(at(10, 5), [['dips-assistes', 40, [10, 10, 10]]]), session(at(10, 8), [['dips-assistes', 35, [10, 10, 10]]])], 'triceps')).toEqual([100, 112.5]);
  });

  it('218. Exercice assisté avec pesée : charge réelle = poids du corps − aide, puis Epley comme un exercice classique', () => {
    const first = perf(30, [8, 8, 8]);
    const body = { current: 80, first: 80 };
    expect(performanceIndex(perf(25, [8, 8, 8]), first, true, body)).toBeCloseTo(110, 10); // 55 kg contre 50 kg
    expect(performanceIndex(perf(35, [8, 8, 8]), first, true, body)).toBeCloseTo(90, 10);
    expect(performanceIndex(perf(30, [10, 10, 10]), first, true, body)).toBeCloseTo(105.26, 2);
    expect(performanceIndex(perf(90, [8, 8, 8]), first, true, body)).toBe(0); // aide au-delà du poids du corps : jamais sous 0
    // Le poids du corps compte : 2 kg perdus à aide égale, la charge réelle baisse.
    expect(performanceIndex(perf(30, [8, 8, 8]), first, true, { current: 78, first: 80 })).toBeCloseTo(96, 10);
    // Aide au moins égale au poids du corps à la première séance : retour à l'aide inversée.
    expect(performanceIndex(perf(70, [8, 8, 8]), perf(80, [8, 8, 8]), true, { current: 80, first: 80 })).toBeCloseTo(112.5, 10);
    // Un exercice classique ignore les pesées.
    expect(performanceIndex(perf(45, [8, 8, 8]), perf(40, [8, 8, 8]), false, body)).toBeCloseTo(112.5, 10);
  });

  it('219. Pesée la plus proche de chaque séance ; sans aucune pesée, méthode de l’aide inversée ; exercices classiques inchangés', () => {
    const weighIns = [
      { date: '2026-10-07', weightKg: 76 },
      { date: '2026-10-01', weightKg: 80 },
    ];
    expect(nearestBodyWeight(weighIns, '2026-10-05')).toBe(76); // 2 jours après contre 4 jours avant
    expect(nearestBodyWeight(weighIns, '2026-10-04')).toBe(80); // à égale distance : la plus ancienne
    expect(nearestBodyWeight(weighIns, '2026-09-01')).toBe(80);
    expect(nearestBodyWeight(weighIns, '2026-12-01')).toBe(76);
    expect(nearestBodyWeight([], '2026-10-04')).toBeNull();

    const dips = [session(at(10, 1), [['dips-assistes', 40, [10, 10, 10]]]), session(at(10, 8), [['dips-assistes', 35, [10, 10, 10]]])];
    const triceps = (w: { date: string; weightKg: number }[]) => groupIndex(dips, LIB, SETTINGS, 'triceps', w);
    // Une seule pesée (75 kg) : 35 kg puis 40 kg de charge réelle.
    expect(triceps([{ date: '2026-09-15', weightKg: 75 }]).points.map((p) => Number(p.value.toFixed(2)))).toEqual([100, 114.29]);
    // 80 kg le 1er, 74 kg le 8 : 40 kg puis 39 kg de charge réelle, l'indice baisse malgré l'aide en baisse.
    const twoWeighIns = triceps([{ date: '2026-10-01', weightKg: 80 }, { date: '2026-10-08', weightKg: 74 }]);
    expect(twoWeighIns.points.map((p) => Number(p.value.toFixed(2)))).toEqual([100, 97.5]);
    expect(twoWeighIns.assistedMethod).toBe('bodyWeight');
    // Sans pesée : aide inversée (40 → 35 kg = 112,5).
    expect(triceps([]).points.map((p) => Number(p.value.toFixed(2)))).toEqual([100, 112.5]);
    expect(triceps([]).assistedMethod).toBe('inverseAid');
    // Données simulées : dips de 40 à 27,5 kg d'aide, 78 kg (20 mai) puis 74 kg (15 oct.).
    const sim = simulatedHistory();
    const simWeighIns = [{ date: '2026-05-20', weightKg: 78 }, { date: '2026-10-15', weightKg: 74 }];
    expect(groupIndex(sim, LIB, SETTINGS, 'triceps', simWeighIns).points.at(-1)!.value).toBeCloseTo((100 * 46.5 / 38 + 100) / 2, 6);
    // Exercices classiques : pesées sans effet, et pas de méthode d'assistance.
    const pecs = groupIndex(sim, LIB, SETTINGS, 'pectoraux', simWeighIns);
    expect(pecs).toEqual(groupIndex(sim, LIB, SETTINGS, 'pectoraux'));
    expect(pecs.assistedMethod).toBeNull();
  });

  it('212. Changement de palier de charge : 3×12 puis poids supérieur à 3×8, l’indice continue de monter', () => {
    const sessions = [
      session(at(10, 1), [['chest-press', 40, [8, 8, 8]]]),
      session(at(10, 5), [['chest-press', 40, [12, 12, 12]]]),
      session(at(10, 8), [['chest-press', 45, [8, 8, 8]]]),
    ];
    expect(values(sessions, 'pectoraux')).toEqual([100, 110.53, 112.5]);
  });

  it('213. Indice : groupe principal seulement (le groupe secondaire est ignoré), sous-groupes des jambes, ni historique partiel, ni séance en cours, ni cardio', () => {
    const sessions = [
      // Dips assistés : triceps (principal), pectoraux (secondaire) ; chest press : pectoraux (principal), triceps (secondaire).
      session(at(10, 5), [['dips-assistes', 40, [10, 10, 10]], ['chest-press', 40, [8, 8, 8]]]),
      session(at(10, 8), [['leg-curl', 30, [8, 8, 8]]]),
      session(at(10, 9), [['chest-press', 50, []]]),
      session(at(10, 10), [['chest-press', 60, [8, 8, 8]]], { state: 'active', endedAt: null }),
      session(at(10, 11), [], { cardio: [{ id: 'c', machineId: 'rameur', machine: 'Rameur', minutes: 20 }] }),
    ];
    sessions[2]!.performances[0]!.partial = true;
    expect(groupIndex(sessions, LIB, SETTINGS, 'pectoraux')).toMatchObject({ variantIds: ['chest-press'], sessionCount: 1 });
    expect(groupIndex(sessions, LIB, SETTINGS, 'triceps')).toMatchObject({ variantIds: ['dips-assistes'], sessionCount: 1 });
    expect(groupIndex(sessions, LIB, SETTINGS, 'jambes')).toMatchObject({ variantIds: ['leg-curl'], sessionCount: 1 });
    expect(groupIndex(sessions, LIB, SETTINGS, 'dos').points).toEqual([]);
  });

  it('214. Séries par semaine : lundi–dimanche, 12 semaines, groupe principal en plein, séries indirectes pour moitié', () => {
    const now = at(10, 22, 12); // jeudi 22 octobre
    const sessions = [
      session(at(10, 18, 23, 30), [['chest-press', 40, [8, 8, 8]]]), // dimanche 23 h 30 : semaine du 12
      session(at(10, 19, 0, 0), [['chest-press', 40, [8, 8]], ['dips-assistes', 40, [10, 10, 10]]]), // lundi 0 h 00 : semaine du 19
      session(at(7, 27), [['chest-press', 40, [8, 8, 8]]]), // hors des 12 semaines
    ];
    const pecs = groupWeeklySets(sessions, LIB, 'pectoraux', now);
    expect(pecs.weeks).toHaveLength(12);
    expect(pecs.weeks[0]!.start).toBe('2026-08-03');
    expect(pecs.weeks.at(-1)).toEqual({ start: '2026-10-19', direct: 2, indirect: 3, total: 3.5 });
    expect(pecs.weeks.at(-2)).toEqual({ start: '2026-10-12', direct: 3, indirect: 0, total: 3 });
    expect(pecs.activeWeeks).toBe(2);
    // Triceps : dips en plein, séries indirectes du chest press pour moitié.
    expect(groupWeeklySets(sessions, LIB, 'triceps', now).weeks.at(-1)).toEqual({ start: '2026-10-19', direct: 3, indirect: 2, total: 4 });
  });

  it('215. Seuils d’affichage et message ; données simulées (progression, stagnation, régression, assisté) ; moteur inchangé ; jamais chargées par l’appli', () => {
    const weekly = (count: number, perWeek = 1) =>
      Array.from({ length: count }, (_, i) => session(at(10, 1 + (perWeek === 1 ? 7 * i : i)), [['chest-press', 40, [8, 8, 8]]]));
    const five = groupIndex(weekly(5), LIB, SETTINGS, 'pectoraux');
    expect(five.enough).toBe(false);
    expect(notEnoughForIndex(five)).toBe('Pas encore assez de données pour analyser ta progression : 5 séances sur 6 nécessaires.');
    expect(groupIndex(weekly(6), LIB, SETTINGS, 'pectoraux').enough).toBe(true);
    // Six séances sur deux semaines seulement (1er au 6 octobre : semaines du 28 sept. et du 5 oct.).
    const twoWeeks = groupIndex(weekly(6, 6), LIB, SETTINGS, 'pectoraux');
    expect(twoWeeks).toMatchObject({ sessionCount: 6, weekCount: 2, enough: false });
    expect(notEnoughForIndex(twoWeeks)).toBe('Pas encore assez de données pour analyser ta progression : 2 semaines sur 3 nécessaires.');
    expect(notEnoughForIndex(groupIndex(weekly(1), LIB, SETTINGS, 'pectoraux'))).toBe(
      'Pas encore assez de données pour analyser ta progression : 1 séance sur 6 et 1 semaine sur 3 nécessaires.',
    );
    const sets = groupWeeklySets(weekly(2), LIB, 'pectoraux', at(10, 22));
    expect(sets.enough).toBe(false);
    expect(notEnoughForSets(sets)).toBe('Pas encore assez de données pour analyser ta progression : 2 semaines sur 3 nécessaires.');
    expect(groupWeeklySets(weekly(3), LIB, 'pectoraux', at(10, 22)).enough).toBe(true);

    // Données simulées : près de 5 mois, semaines sans séance.
    const sim = simulatedHistory();
    expect(sim[0]!.date).toBe('2026-06-01');
    expect(sim.at(-1)!.date).toBe('2026-10-22');
    const last = (g: Parameters<typeof groupIndex>[3]) => groupIndex(sim, LIB, SETTINGS, g).points.at(-1)!.value;
    expect(last('pectoraux')).toBeGreaterThan(120); // progression régulière, retour à 3×8 au poids supérieur compris
    expect(last('dos')).toBe(100); // stagnation
    expect(last('epaules')).toBeLessThan(90); // régression
    expect(last('triceps')).toBeGreaterThan(110); // dips assistés : l'aide baisse
    const pecs = groupIndex(sim, LIB, SETTINGS, 'pectoraux').points.map((p) => p.value);
    expect(pecs.every((v, i) => i === 0 || v >= pecs[i - 1]!)).toBe(true);
    const bars = groupWeeklySets(sim, LIB, 'pectoraux', at(10, 22, 20));
    expect(bars.weeks.map((w) => w.direct)).toEqual([6, 0, 0, 0, 6, 6, 6, 0, 6, 6, 6, 6]);
    expect(bars.weeks.map((w) => w.indirect)).toEqual([3, 0, 0, 0, 3, 3, 3, 0, 3, 3, 3, 3]);
    // Calcul pur : séances et moteur inchangés.
    const copy = structuredClone(sim);
    groupIndex(sim, LIB, SETTINGS, 'pectoraux');
    expect(sim).toEqual(copy);
    expect(rebuildProfile(sim, SETTINGS)).toEqual(rebuildProfile(copy, SETTINGS));

    // Aucun fichier de l'application (hors tests) ne charge les données simulées.
    expect(Object.keys(APP_SOURCES).length).toBeGreaterThan(20);
    expect(Object.entries(APP_SOURCES).filter(([, source]) => source.includes('simulation')).map(([file]) => file)).toEqual([]);
  });
});
