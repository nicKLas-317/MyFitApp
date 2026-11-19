import { describe, expect, it } from 'vitest';
import { DEFAULT_HABITS, type ActivityRecord } from '../../activities/model';
import { DEFAULT_CARDIO_MACHINES } from '../../cardio/model';
import type { CardioMachine, Exercise, MuscleGroup, Session } from '../../domain/types';
import { rebuildProfile } from '../../engine';
import { buildEngineSettings, displayName, indexVariants } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { buildCoachExport, type CoachInput } from '../coach';
import {
  activityJoints, EXERCISE_JOINTS, exerciseJoints, ignoreJointAlerts, isFootingMachine, isJointRise, jointAlertCandidates, jointAlerts, jointBanner,
  jointFigures, jointFigureText, jointReportText, jointSets, sanitizeIgnoredJointAlerts, type JointInput,
} from '../jointAlerts';
import { buildReport, reportText } from '../report';
import { parsePeriodKey } from '../reportPeriod';
import { DEFAULT_RECAP_SETTINGS } from '../weekly';
import { ELBOW_EXTRA, iso, JOINT_NOW, jointHistory, jointSession, perf } from './articulations-simulation';

/** Alerte « articulation trop sollicitée » (§19.14, version 1.53.0) ; données : `articulations-simulation.ts`. */
const LIB: Exercise[] = [...SEED_EXERCISES];
const SETTINGS = buildEngineSettings(LIB);
const VARIANTS = indexVariants(LIB);
const name = (id: string) => displayName(VARIANTS.get(id));
const at = (m: number, d: number, h = 12, min = 0) => new Date(2026, m - 1, d, h, min).getTime();
const NOW = JOINT_NOW;
const history = jointHistory;
const session = jointSession;
/** Sources de l'application, hors tests. */
const APP_SOURCES = import.meta.glob<string>(['../../**/*.{ts,tsx}', '!../../**/__tests__/**'], { query: '?raw', import: 'default', eager: true });

const input = (sessions: Session[], extra: Partial<JointInput> = {}): JointInput => ({
  sessions, exercises: LIB, activities: [], machines: DEFAULT_CARDIO_MACHINES, now: NOW, ...extra,
});
const figuresOf = (sessions: Session[], extra: Partial<JointInput> = {}) =>
  jointFigures(input(sessions, extra))?.map((f) => [f.joint, f.sets, f.average, f.alert]);
function activity(name: string, date: string, groups: MuscleGroup[]): ActivityRecord {
  return { id: `act-${name}-${date}`, habitId: name, date, name, start: '10:00', end: '11:00', groups, status: 'done', answeredAt: 0 };
}

describe('Alerte « articulation trop sollicitée » (§19.14, version 1.53.0)', () => {
  it('320. Règle : la dernière semaine terminée contre la moyenne des 4 précédentes, +50 %, +5 séries, 10 au moins ; muette avant 4 semaines ; croix jusqu’au lundi suivant ; textes', () => {
    // Semaine ordinaire : rien. Semaine du 9 nov. avec quatre exercices pour le coude : 18 séries contre 6.
    expect(figuresOf(history({ extra: {} }))).toEqual([['epaule', 6, 6, false], ['coude', 6, 6, false], ['genou', 6, 6, false]]);
    expect(figuresOf(history())).toEqual([['epaule', 6, 6, false], ['coude', 18, 6, true], ['genou', 6, 6, false]]);
    expect(jointAlertCandidates(input(history()))).toEqual([{ joint: 'coude', week: '2026-11-09', sets: 18, average: 6, alert: true }]);

    // Seuils, chacun à sa borne.
    expect(isJointRise(15, 10)).toBe(true); // +50 % et +5 tout juste
    expect(isJointRise(14.5, 10)).toBe(false); // +45 %
    expect(isJointRise(12, 8)).toBe(false); // +50 %, mais +4 séries
    expect(isJointRise(10, 5)).toBe(true); // le plancher tout juste
    expect(isJointRise(9.5, 4)).toBe(false); // +137 %, +5,5 séries, mais sous 10
    expect(isJointRise(10, 0)).toBe(true); // articulation jamais sollicitée avant
    // Deux exercices pour le coude seulement (12 contre 6) : +6, +100 % → alerte ; un seul (9) : +3 → rien.
    expect(figuresOf(history({ extra: { '2026-11-09': ELBOW_EXTRA.slice(0, 2) } }))?.[1]).toEqual(['coude', 12, 6, true]);
    expect(figuresOf(history({ extra: { '2026-11-09': ELBOW_EXTRA.slice(0, 1) } }))?.[1]).toEqual(['coude', 9, 6, false]);
    // Genou : deux exercices de plus (12 contre 6) → alerte ; un seul (9) → sous le plancher. Les semaines vides comptent
    // dans la moyenne (vacances le 26 oct. : 4,5 au lieu de 6) : 9 contre 4,5 reste à +4,5 séries.
    const knee = { '2026-11-09': ['squat-kettlebell', 'leg-curl'] };
    expect(figuresOf(history({ extra: knee }))?.[2]).toEqual(['genou', 12, 6, true]);
    expect(figuresOf(history({ extra: { '2026-11-09': ['squat-kettlebell'] } }))?.[2]).toEqual(['genou', 9, 6, false]);
    expect(figuresOf(history({ vacations: ['2026-10-26'], extra: { '2026-11-09': ['squat-kettlebell'] } }))?.[2]).toEqual(['genou', 9, 4.5, false]);
    expect(figuresOf(history({ vacations: ['2026-10-26'], extra: { '2026-11-09': ['squat-kettlebell', 'leg-curl'] } }))?.[2]).toEqual(['genou', 12, 4.5, true]);

    // Muette tant qu'il n'y a pas 4 semaines terminées avant : première séance le lundi 19 oct. (3 semaines avant le 9
    // nov.) ; le dimanche 18 oct. (semaine du 12) suffit.
    expect(jointFigures(input(history({ from: '2026-10-19' })))).toBeNull();
    const sunday = [session(new Date(2026, 9, 18), ['pec-deck']), ...history({ from: '2026-10-19' })];
    expect(jointAlertCandidates(input(sunday)).map((a) => a.joint)).toEqual(['coude']);
    expect(jointFigures(input([]))).toBeNull();
    // Semaine terminée seulement : le dimanche 15 nov. au soir, la semaine du 9 n'est pas finie ; le lundi 0 h 00, l'alerte.
    expect(jointAlertCandidates(input(history(), { now: at(11, 15, 23, 59) }))).toEqual([]);
    expect(jointAlertCandidates(input(history(), { now: at(11, 16, 0, 0) })).map((a) => a.joint)).toEqual(['coude']);
    // Une séance en cours ne compte pas.
    const ongoing = history().map((s) => (s.date === '2026-11-12' ? { ...s, state: 'active' as const, endedAt: null } : s));
    expect(jointAlertCandidates(input(ongoing))).toEqual([]);

    // Plusieurs articulations : toutes, de la plus forte hausse (en séries) à la plus faible.
    const both = history({ extra: { '2026-11-09': [...ELBOW_EXTRA.slice(0, 2), 'squat-kettlebell', 'leg-curl', 'hack-squat'] } });
    expect(jointAlertCandidates(input(both)).map((a) => [a.joint, a.sets - a.average])).toEqual([['genou', 9], ['coude', 6]]);

    // La croix : masquée jusqu'au lundi suivant, toutes les articulations citées.
    const cited = jointAlerts(input(both));
    const ignored = ignoreJointAlerts({}, cited);
    expect(ignored).toEqual({ genou: '2026-11-09', coude: '2026-11-09' });
    expect(jointAlerts(input(both), ignored)).toEqual([]);
    expect(jointAlerts(input(both, { now: at(11, 22, 23, 59) }), ignored)).toEqual([]);
    expect(jointAlerts(input(both), ignoreJointAlerts({}, [cited[0]!])).map((a) => a.joint)).toEqual(['coude']);
    // Lundi 23 nov. : la semaine du 16 encore en hausse (coude 18 contre 9) → de retour ; revenue à la normale → rien.
    const twice = history({ until: '2026-11-23', extra: { '2026-11-09': ELBOW_EXTRA, '2026-11-16': ELBOW_EXTRA } });
    expect(jointAlerts(input(twice, { now: at(11, 23, 9) }), ignoreJointAlerts({}, jointAlerts(input(twice))))).toMatchObject([
      { joint: 'coude', week: '2026-11-16', sets: 18, average: 9 },
    ]);
    expect(jointAlerts(input(history({ until: '2026-11-23' }), { now: at(11, 23, 9) }), { coude: '2026-11-09' })).toEqual([]);
    // Mémoire de l'appareil contrôlée.
    expect(sanitizeIgnoredJointAlerts({ coude: '2026-11-09', genou: 'lundi', poignet: '2026-11-09', epaule: 3 })).toEqual({ coude: '2026-11-09' });
    expect(sanitizeIgnoredJointAlerts([])).toEqual({});
    expect(sanitizeIgnoredJointAlerts(null)).toEqual({});

    // Textes : la moyenne arrondie à l'entier ; le bandeau court (les chiffres d'une articulation, « forte hausse » pour
    // plusieurs), sans conseil ; le bilan, la phrase complète avec le conseil.
    expect(jointFigureText({ sets: 28, average: 18.625 })).toBe('28\u00a0séries contre 19 d’habitude');
    expect(jointFigureText({ sets: 22.5, average: 13.5 })).toBe('22,5\u00a0séries contre 14 d’habitude');
    const coude = jointAlerts(input(history()));
    expect(jointBanner(coude)).toEqual({ names: 'Coude', rest: '18\u00a0séries contre 6 d’habitude' });
    expect(jointBanner(cited)).toEqual({ names: 'Genou, Coude', rest: 'forte hausse' });
    expect(jointReportText(coude)).toBe('Coude : forte hausse cette semaine (18 séries contre 6 d’habitude). Échauffe-toi bien et surveille les douleurs.');
    expect(jointReportText(cited)).toBe('Genou, Coude : forte hausse cette semaine (Genou 15 contre 6, Coude 12 contre 6). Échauffe-toi bien et surveille les douleurs.');

    // Données simulées jamais chargées par l'application.
    expect(Object.keys(APP_SOURCES).length).toBeGreaterThan(50);
    expect(Object.entries(APP_SOURCES).filter(([, source]) => source.includes('articulations-simulation')).map(([file]) => file)).toEqual([]);
  });

  it('321. Correspondance exercice → articulations (validée), exercices personnalisés et activités déduits de leurs groupes, maison, footing', () => {
    // Chaque exercice de la bibliothèque a sa correspondance, et rien d'autre.
    expect(Object.keys(EXERCISE_JOINTS).sort()).toEqual(SEED_EXERCISES.map((e) => e.id).sort());
    const of = (id: string) => exerciseJoints(LIB.find((e) => e.id === id)!);
    expect(of('chest-press')).toEqual({ epaule: 1, coude: 0.5 });
    expect(of('developpe-epaules-machine')).toEqual({ epaule: 1, coude: 0.5 });
    expect(of('dips-assistes')).toEqual({ epaule: 1, coude: 1 });
    expect(of('tractions-assistees')).toEqual({ epaule: 1, coude: 1 });
    expect(of('pec-deck')).toEqual({ epaule: 1 });
    expect(of('tirage-vertical')).toEqual({ epaule: 1, coude: 0.5 });
    expect(of('tirage-horizontal')).toEqual({ epaule: 0.5, coude: 0.5 });
    expect(of('curl-biceps-banc-incline')).toEqual({ coude: 1, epaule: 0.5 });
    expect(of('extension-triceps-haltere-assis')).toEqual({ coude: 1, epaule: 0.5 });
    expect(of('curl-pupitre')).toEqual({ coude: 1 });
    expect(of('leg-extension')).toEqual({ genou: 1 });
    expect(of('chaise')).toEqual({ genou: 1 });
    for (const id of ['mollets-machine', 'abducteurs-machine', 'adducteurs-machine', 'planche', 'crunch-sol', 'shrugs', 'lombaires-banc']) expect(of(id), id).toEqual({});
    // La correspondance est celle de l'exercice, même si ses groupes ont été personnalisés.
    expect(exerciseJoints({ id: 'pec-deck', primaryGroup: 'pectoraux', secondaryGroups: ['triceps'] })).toEqual({ epaule: 1 });

    // Exercice personnalisé : déduit de ses groupes (principal 1, secondaires ½).
    const custom = (primaryGroup: MuscleGroup, secondaryGroups: MuscleGroup[] = []) => exerciseJoints({ id: 'perso-x', primaryGroup, secondaryGroups });
    expect(custom('abdominaux')).toEqual({}); // roue abdominale
    expect(custom('dos', ['epaules', 'biceps'])).toEqual({ epaule: 0.5, coude: 0.5 }); // tirage vertical à la machine
    expect(custom('biceps')).toEqual({ coude: 1 }); // curl prise inversée
    expect(custom('pectoraux', ['triceps', 'epaules'])).toEqual({ epaule: 1, coude: 0.5 });
    expect(custom('quadriceps')).toEqual({ genou: 1 });
    expect(custom('mollets')).toEqual({});

    // Activités : déduites de leurs groupes, 3 séries par articulation (une fois, même pour deux groupes).
    expect(activityJoints(['epaules', 'jambes'])).toEqual(['epaule', 'genou']); // badminton
    expect(activityJoints(['jambes'])).toEqual(['genou']); // futsal
    expect(activityJoints(['dos'])).toEqual([]); // escalade cochée « dos » seulement
    expect(activityJoints(['pectoraux', 'epaules', 'biceps'])).toEqual(['epaule', 'coude']);
    const week = (t: number) => t >= at(11, 9, 0) && t < at(11, 16, 0);
    const monday = new Date(2026, 10, 9);
    const sets = (sessions: Session[], activities: ActivityRecord[] = [], machines: readonly CardioMachine[] = DEFAULT_CARDIO_MACHINES) =>
      jointSets(sessions, LIB, week, activities, machines);
    expect(sets([], [activity('Badminton', '2026-11-09', ['jambes', 'epaules']), activity('Escalade', '2026-11-10', ['dos', 'epaules', 'pectoraux'])])).toEqual({ epaule: 6, coude: 0, genou: 3 });

    // Salle et maison en entier ; une performance partielle ne compte pas ; une prise compte comme son exercice.
    const home = session(monday, ['chest-press'], { location: 'maison' });
    expect(sets([home])).toEqual({ epaule: 3, coude: 1.5, genou: 0 });
    const partial = session(monday, [{ ...perf('curl-pupitre'), reps: [], partial: true }, perf('tirage-vertical--prise-serree', 2)]);
    expect(sets([partial])).toEqual({ epaule: 2, coude: 1, genou: 0 });

    // Footing : 3 séries pour le genou à partir de 15 min cumulées dans la semaine, une fois ; les autres cardios jamais.
    expect(isFootingMachine('Tapis - footing')).toBe(true);
    expect(isFootingMachine('Course à pied')).toBe(true);
    expect(isFootingMachine('Jogging')).toBe(true);
    expect(isFootingMachine('Tapis de marche')).toBe(false);
    expect(isFootingMachine('Vélo elliptique')).toBe(false);
    expect(isFootingMachine('Rameur')).toBe(false);
    const machines: CardioMachine[] = [...DEFAULT_CARDIO_MACHINES, { id: 'cardio-tapis-footing', name: 'Tapis - footing', incline: false }];
    const run = (date: Date, minutes: number, machineId = 'cardio-tapis-footing', machine = 'Tapis - footing') =>
      session(date, [], { id: `run-${iso(date)}-${minutes}`, cardio: [{ id: `c-${minutes}`, machineId, machine, minutes }] });
    expect(sets([run(monday, 10), run(new Date(2026, 10, 12), 5)], [], machines).genou).toBe(3);
    expect(sets([run(monday, 10), run(new Date(2026, 10, 12), 4)], [], machines).genou).toBe(0);
    expect(sets([run(monday, 40), run(new Date(2026, 10, 12), 40)], [], machines).genou).toBe(3);
    expect(sets([run(monday, 60, 'tapis', 'Tapis de marche'), run(new Date(2026, 10, 12), 60, 'velo', 'Vélo')], [], machines).genou).toBe(0);
    // Machine renommée : son nom actuel compte ; retirée des réglages : le nom de son bloc.
    expect(sets([run(monday, 20, 'cardio-x', 'Footing')], [], [{ id: 'cardio-x', name: 'Course', incline: false }]).genou).toBe(3);
    expect(sets([run(monday, 20, 'cardio-x', 'Footing')], [], []).genou).toBe(3);
  });

  it('322. Bilan de la semaine terminée (écran et mail, même ignorée), jamais pour le mois ni la semaine en cours ; signaux et règle de l’export coach', () => {
    const sessions = history();
    const profile = rebuildProfile(sessions, SETTINGS);
    const report = (key: string, kind: 'week' | 'month' = 'week', now = NOW) =>
      buildReport(parsePeriodKey(kind, key)!, {
        sessions, exercises: LIB, evaluations: profile.evaluations, settings: SETTINGS, groups: DEFAULT_RECAP_SETTINGS.groups, weighIns: [],
        activities: [], machines: DEFAULT_CARDIO_MACHINES, now,
      });
    const week = report('2026-11-09');
    expect(week.jointAlerts.map((a) => [a.joint, a.sets, a.average])).toEqual([['coude', 18, 6]]);
    const text = reportText(week, name);
    const lines = text.split('\n');
    const at9 = lines.indexOf('- Coude : forte hausse cette semaine (18 séries contre 6 d’habitude). Échauffe-toi bien et surveille les douleurs.');
    expect(at9).toBeGreaterThan(lines.indexOf('GROUPES TRAVAILLÉS'));
    expect(lines.indexOf('PROGRESSIONS')).toBeGreaterThan(at9);
    // Semaine précédente : rien ; mois de novembre et semaine en cours : jamais.
    expect(report('2026-11-02').jointAlerts).toEqual([]);
    expect(report('2026-11', 'month', at(12, 2)).jointAlerts).toEqual([]);
    expect(reportText(report('2026-11', 'month', at(12, 2)), name)).not.toMatch(/forte hausse/);
    expect(report('2026-11-09', 'week', at(11, 14)).jointAlerts).toEqual([]);

    // Export coach (semaine du 9 au 15 nov.) : les trois articulations, la hausse du coude affichée, ou ignorée.
    const coachInput = (extra: Partial<CoachInput> = {}): CoachInput => ({
      sessions, exercises: LIB, settings: SETTINGS, recap: DEFAULT_RECAP_SETTINGS, activities: [], habits: DEFAULT_HABITS, machines: DEFAULT_CARDIO_MACHINES,
      weighIns: [], heightCm: null, ignoredAlerts: {}, appVersion: 'test', now: NOW, ...extra,
    });
    const coach = buildCoachExport(coachInput());
    expect(coach.signaux.articulations_trop_sollicitees).toEqual([
      { articulation: 'Épaule', series: 6, moyenne_4_semaines_avant: 6 },
      { articulation: 'Coude', series: 18, moyenne_4_semaines_avant: 6, forte_hausse: true, texte: 'Coude : forte hausse cette semaine (18 séries contre 6 d’habitude). Échauffe-toi bien et surveille les douleurs.', affichee_dans_l_appli: true },
      { articulation: 'Genou', series: 6, moyenne_4_semaines_avant: 6 },
    ]);
    expect(coach.recapitulatif.texte_du_bilan).toContain('- Coude : forte hausse cette semaine (18 séries contre 6 d’habitude). Échauffe-toi bien et surveille les douleurs.');
    expect(coach.regles.some((r) => r.startsWith('Alerte « articulation trop sollicitée »') && r.includes('moyenne des 4 semaines précédentes'))).toBe(true);
    const ignored = buildCoachExport(coachInput({ ignoredJointAlerts: { coude: '2026-11-09' } }));
    expect(ignored.signaux.articulations_trop_sollicitees).toContainEqual({
      articulation: 'Coude', series: 18, moyenne_4_semaines_avant: 6, forte_hausse: true, texte: 'Coude : forte hausse cette semaine (18 séries contre 6 d’habitude). Échauffe-toi bien et surveille les douleurs.', ignoree_sur_l_appareil: true,
    });
    // La séance du lundi 16, après la semaine exportée, ne change rien ; moins de 4 semaines avant : muette.
    expect(buildCoachExport(coachInput({ sessions: history({ until: '2026-11-15' }) })).signaux.articulations_trop_sollicitees).toEqual(coach.signaux.articulations_trop_sollicitees);
    expect(buildCoachExport(coachInput({ sessions: history({ from: '2026-10-19' }) })).signaux.articulations_trop_sollicitees).toBe(
      'alerte muette : moins de 4 semaines terminées avant la semaine exportée',
    );
  });
});
