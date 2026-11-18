import { describe, expect, it } from 'vitest';
import type { ActivityRecord } from '../../activities/model';
import { DEFAULT_CARDIO_MACHINES } from '../../cardio/model';
import type { Exercise, MuscleGroup, Session } from '../../domain/types';
import { SEED_EXERCISES } from '../../library/seed';
import { buildBackup, parseJsonImport } from '../../transfer/backup';
import { alertBanner, alertFigures, alertReportText, groupAlert, groupAlertCandidates, groupAlerts, ignoreAlert, ignoreAlerts, sanitizeIgnoredAlerts, type AlertInput } from '../groupAlerts';
import { groupWeeklySets } from '../groups';
import { ALERT_SETS_MAX, ALERT_SETS_MIN, DEFAULT_RECAP_SETTINGS, sanitizeRecapSettings, weeklyRecap } from '../weekly';
import { ALERT_NOW, alertHistory } from './alertes-simulation';

const LIB: Exercise[] = [...SEED_EXERCISES];
const GROUPS = DEFAULT_RECAP_SETTINGS.groups;
const ALL: MuscleGroup[] = ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux'];
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const input = (sessions: Session[], extra: Partial<AlertInput> = {}): AlertInput => ({
  sessions, exercises: LIB, activities: [], machines: DEFAULT_CARDIO_MACHINES, groups: GROUPS, threshold: 6, now: ALERT_NOW, ...extra,
});
const alertsOf = (sessions: Session[], extra: Partial<AlertInput> = {}) => groupAlertCandidates(input(sessions, extra)).map((a) => a.group);
/** Exercice de 3 séries ajouté à la séance du lundi des semaines données. */
const withExercise = (sessions: Session[], variantId: string, mondays: string[]) =>
  sessions.map((s) => (mondays.includes(s.date) ? { ...s, performances: [...s.performances, { ...s.performances[0]!, variantId }] } : s));
const withoutVariant = (sessions: Session[], variantId: string, from: string) =>
  sessions.map((s) => (s.date >= from ? { ...s, performances: s.performances.filter((p) => p.variantId !== variantId) } : s));
function activity(name: string, date: string, groups: MuscleGroup[]): ActivityRecord {
  return { id: `act-${name}-${date}`, habitId: name, date, name, start: '10:00', end: '11:00', groups, status: 'done', answeredAt: 0 };
}

/** Sources de l'application, hors tests. */
const APP_SOURCES = import.meta.glob<string>(['../../**/*.{ts,tsx}', '!../../**/__tests__/**'], { query: '?raw', import: 'default', eager: true });

describe('Alerte « groupe moins travaillé » (§19.11)', () => {
  it('289. Données simulées (version 1.51.0) : le dos sous 6 séries les 2 dernières semaines terminées, alerte ; les pectoraux une seule semaine, rien ; semaines terminées seulement ; séance en cours non comptée', () => {
    const sessions = alertHistory();
    // Dos en baisse 2 semaines : 3 et 3 séries (plus de lombaires), sous le seuil de 6.
    expect(groupAlert(input(sessions), 'dos')).toEqual({ group: 'dos', week: '2026-11-02', recent: [3, 3], threshold: 6 });
    // Pectoraux sous le seuil une seule semaine (6 puis 3) : pas d'alerte. Les autres groupes, à 6 ou plus : rien.
    expect(groupWeeklySets(sessions, LIB, 'pectoraux', ALERT_NOW).weeks.slice(-3, -1).map((w) => w.total)).toEqual([6, 3]);
    expect(groupAlert(input(sessions), 'pectoraux')).toBeNull();
    expect(alertsOf(sessions, { groups: ALL })).toEqual(['dos']);
    // Semaine ordinaire (12 oct.) : aucun groupe sous 6.
    expect(weeklyRecap(sessions, LIB, at(2026, 10, 18, 23), DEFAULT_RECAP_SETTINGS).cells.map((c) => [c.group, c.score])).toEqual([
      ['pectoraux', 6], ['dos', 6], ['triceps', 6], ['jambes', 6], ['epaules', 7.5], ['biceps', 7.5],
    ]);

    // Semaines terminées seulement : le dimanche 8 nov. au soir, la semaine du 2 nov. n'est pas finie (19 oct. et
    // 26 oct. : 6 puis 3) ; le lundi 9 nov. à 0 h 00, l'alerte apparaît.
    expect(groupAlert(input(sessions, { now: at(2026, 11, 8, 23, 59) }), 'dos')).toBeNull();
    expect(groupAlert(input(sessions, { now: at(2026, 11, 9, 0, 0) }), 'dos')).toMatchObject({ week: '2026-11-02' });
    // Une séance en cours ne compte pas : la séance du jeudi 5 nov. encore ouverte, le dos à 0 cette semaine-là.
    const ongoing = sessions.map((s) => (s.date === '2026-11-05' ? { ...s, state: 'active' as const, endedAt: null } : s));
    expect(groupAlert(input(ongoing), 'dos')).toMatchObject({ recent: [3, 0] });

    // Données simulées jamais chargées par l'application.
    expect(Object.keys(APP_SOURCES).length).toBeGreaterThan(50);
    expect(Object.entries(APP_SOURCES).filter(([, source]) => source.includes('alertes-simulation')).map(([file]) => file)).toEqual([]);
  });

  it('290. « Ignorer » : masquée jusqu’à une nouvelle semaine encore sous le seuil, le groupe suivant affiché à sa place ; groupes du récapitulatif ; chiffres ; mémoire de l’appareil contrôlée', () => {
    const sessions = alertHistory();
    const dos = groupAlerts(input(sessions))[0]!;
    const ignored = ignoreAlert({}, dos);
    expect(ignored).toEqual({ dos: '2026-11-02' });
    expect(groupAlerts(input(sessions), ignored)).toEqual([]);
    // Toujours ignorée pendant la semaine du 9 nov., même le dimanche soir.
    expect(groupAlerts(input(sessions, { now: at(2026, 11, 15, 23, 59) }), ignored)).toEqual([]);
    // Une semaine de plus sous le seuil (9 nov. : 3 séries) : l'alerte revient, pour la semaine du 9 nov.
    const longer = alertHistory({ until: '2026-11-16', dosDown: ['2026-10-26', '2026-11-02', '2026-11-09'] });
    expect(groupAlerts(input(longer, { now: at(2026, 11, 18) }), ignored).map((a) => [a.group, a.week])).toEqual([['dos', '2026-11-09']]);
    // Le dos se reprend (6 séries le 9 nov.) : plus d'alerte, ignorée ou non.
    expect(groupAlerts(input(alertHistory({ until: '2026-11-16' }), { now: at(2026, 11, 18) }))).toEqual([]);
    // Deux groupes sous le seuil (version 1.52.1) : tous deux cités, du plus bas au plus haut ; la croix les masque tous,
    // chacun pour sa semaine ; un groupe ignoré seul laisse l'autre cité.
    const both = alertHistory({ pecDown: ['2026-10-26', '2026-11-02'] });
    const deeper = withoutVariant(both, 'tirage-vertical', '2026-11-02');
    const cited = groupAlerts(input(deeper));
    expect(cited.map((a) => a.group)).toEqual(['dos', 'pectoraux']);
    expect(ignoreAlerts({}, cited)).toEqual({ dos: '2026-11-02', pectoraux: '2026-11-02' });
    expect(groupAlerts(input(deeper), ignoreAlerts({}, cited))).toEqual([]);
    expect(groupAlerts(input(deeper), ignoreAlert({}, cited[0]!)).map((a) => a.group)).toEqual(['pectoraux']);

    // Seulement les groupes du récapitulatif : sans le dos, rien.
    expect(alertsOf(sessions, { groups: ['pectoraux', 'biceps'] })).toEqual([]);

    // Chiffres de l'alerte (version 1.51.0) : les 2 semaines, la plus ancienne d'abord, et le seuil ; une décimale.
    expect(alertFigures(dos)).toBe('3 et 3 séries ces 2 semaines (sous 6)');
    const figures = (recent: number[], threshold = 6) => alertFigures({ group: 'dos', week: '2026-11-02', recent, threshold });
    expect(figures([4.5, 2])).toBe('4,5 et 2 séries ces 2 semaines (sous 6)');
    expect(figures([4, 1.5], 5)).toBe('4 et 1,5 séries ces 2 semaines (sous 5)');
    expect(figures([1.5, 0])).toBe('1,5 et 0 série ces 2 semaines (sous 6)');
    expect(figures([0, 0], 3)).toBe('0 et 0 série ces 2 semaines (sous 3)');

    // Mémoire de l'appareil contrôlée : groupes du sélecteur et lundis seulement.
    expect(sanitizeIgnoredAlerts({ dos: '2026-11-02', quadriceps: '2026-11-02', biceps: 'hier', triceps: 3 })).toEqual({ dos: '2026-11-02' });
    expect(sanitizeIgnoredAlerts(null)).toEqual({});
    expect(sanitizeIgnoredAlerts(['dos'])).toEqual({});
  });

  it('319. Version 1.51.0 : sous le seuil (6 séries, réglable de 3 à 9) sur chacune des 2 dernières semaines terminées, au score du récapitulatif (activités, cardio des jambes, maison) ; abdominaux jamais ; dès 2 semaines terminées ; version 1.52.1 : un seul bandeau qui cite tous les groupes, du plus bas au plus haut', () => {
    const sessions = alertHistory();

    // Seuil : strictement sous ; le dos à 3 et 3 n'est pas sous 3, il l'est sous 4. Bornes du réglage.
    expect(alertsOf(sessions, { threshold: 3 })).toEqual([]);
    expect(alertsOf(sessions, { threshold: 4 })).toEqual(['dos']);
    // Seuil de 9 : tous les groupes, le plus bas d'abord : dos 3 + 3, pectoraux 6 + 3, triceps et jambes 6 + 6, épaules
    // et biceps 7,5 + 7,5 ; à égalité, l'ordre des groupes.
    expect(alertsOf(sessions, { threshold: 9 })).toEqual(['dos', 'pectoraux', 'triceps', 'jambes', 'epaules', 'biceps']);
    expect([ALERT_SETS_MIN, ALERT_SETS_MAX, DEFAULT_RECAP_SETTINGS.alertSets]).toEqual([3, 9, 6]);
    expect(sanitizeRecapSettings({ groups: GROUPS, redSets: 10 }).alertSets).toBe(6);
    expect(sanitizeRecapSettings({ groups: GROUPS, redSets: 10, alertSets: 3 }).alertSets).toBe(3);
    expect(sanitizeRecapSettings({ groups: GROUPS, redSets: 10, alertSets: 9 }).alertSets).toBe(9);
    for (const bad of [2, 10, 4.5, '5', null]) expect(sanitizeRecapSettings({ groups: GROUPS, redSets: 10, alertSets: bad }).alertSets).toBe(6);
    // Sauvegarde : le réglage est gardé ; une sauvegarde antérieure, sans lui, prend 6.
    const backup = buildBackup({ sessions, exercises: LIB, settings: { weeklyRecap: { groups: GROUPS, redSets: 10, alertSets: 4 } } }, ALERT_NOW);
    const restored = parseJsonImport(JSON.stringify(backup), LIB, '2026-11-11');
    if (restored.kind !== 'backup') throw new Error('sauvegarde illisible');
    expect(sanitizeRecapSettings(restored.backup.settings.weeklyRecap)).toEqual({ groups: GROUPS, redSets: 10, alertSets: 4 });

    // Même score que le récapitulatif, semaine par semaine : séries directes, indirectes ½, maison, activités, cardio.
    for (const monday of ['2026-10-26', '2026-11-02']) {
      const [y, m, d] = monday.split('-').map(Number) as [number, number, number];
      const cells = weeklyRecap(sessions, LIB, new Date(y, m - 1, d + 6, 23).getTime(), DEFAULT_RECAP_SETTINGS, [], DEFAULT_CARDIO_MACHINES).cells;
      const i = monday === '2026-10-26' ? 0 : 1;
      expect(groupAlert(input(sessions), 'dos')!.recent[i]).toBe(cells.find((c) => c.group === 'dos')!.score);
    }
    // Activités : une escalade (dos) chaque semaine en baisse : 3 + 3 = 6, plus d'alerte.
    const climbing = [activity('Escalade', '2026-10-28', ['dos']), activity('Escalade', '2026-11-04', ['dos'])];
    expect(alertsOf(sessions, { activities: climbing })).toEqual([]);
    // Une seule escalade (semaine du 2 nov.) : 3 puis 6, plus d'alerte non plus (il faut les 2 semaines sous le seuil).
    expect(alertsOf(sessions, { activities: climbing.slice(1) })).toEqual([]);
    // Maison : 3 séries de tirage à la maison la semaine du 26 oct. et celle du 2 nov. : 6 et 6, plus d'alerte.
    const home = [at(2026, 10, 27, 8), at(2026, 11, 3, 8)].map((start, i): Session => ({
      ...sessions[0]!, id: `maison-${i}`, date: i === 0 ? '2026-10-27' : '2026-11-03', location: 'maison', startedAt: start, endedAt: start + 30 * 60_000,
      performances: [{ ...sessions[0]!.performances[0]!, variantId: 'rowing-haltere', weightKg: 8 }],
    }));
    expect(alertsOf([...sessions, ...home])).toEqual([]);
    // Indirect ½ : un face pull (dos en secondaire, 1,5) chaque semaine en baisse : 4,5 et 4,5, toujours sous 6.
    expect(groupAlert(input(withExercise(sessions, 'face-pull', ['2026-10-26', '2026-11-02'])), 'dos')).toMatchObject({ recent: [4.5, 4.5] });
    // Cardio des jambes : plus de leg extension les 2 dernières semaines (jambes 3 et 3) : alerte ; avec 50 min de tapis
    // chaque semaine, 3 séries de plus pour les jambes (6), plus d'alerte ; avec le rameur (exclu des jambes), toujours.
    const legsDown = withoutVariant(alertHistory({ dosDown: [] }), 'leg-extension', '2026-10-26');
    expect(alertsOf(legsDown)).toEqual(['jambes']);
    const withCardio = (machineId: string, machine: string) =>
      legsDown.map((s) => (s.date >= '2026-10-26' && new Date(s.startedAt!).getDay() === 1 ? { ...s, cardio: [{ id: `c-${s.date}`, machineId, machine, minutes: 50 }] } : s));
    expect(alertsOf(withCardio('tapis', 'Tapis de marche'))).toEqual([]);
    expect(alertsOf(withCardio('rameur', 'Rameur'))).toEqual(['jambes']);

    // Abdominaux jamais concernés, même au récapitulatif et à 0.
    expect(alertsOf(sessions, { groups: ALL, threshold: 9 })).not.toContain('abdominaux');
    expect(groupAlert(input(sessions, { groups: ALL }), 'abdominaux')).toBeNull();

    // Dès 2 semaines terminées (plus de 6 semaines ni de 4 semaines de référence) : première séance le 26 oct., le dos
    // à 3 et 3 : alerte le 11 nov. ; première séance le 2 nov. : une seule semaine terminée, rien.
    expect(alertsOf(alertHistory({ from: '2026-10-26' }))).toEqual(['dos']);
    expect(alertsOf(alertHistory({ from: '2026-11-02' }))).toEqual([]);
    // Un groupe toujours bas (jambes à 3 chaque semaine, donc à sa moyenne) est en alerte : la règle ne compare plus à
    // la moyenne (versions 1.38.0 à 1.50.1 : jamais d'alerte pour un groupe régulier).
    expect(alertsOf(withoutVariant(alertHistory({ dosDown: [] }), 'leg-extension', '2026-08-31'))).toEqual(['jambes']);

    // Version 1.52.1 : un seul bandeau cite tous les groupes en alerte, du plus bas au plus haut. Vacances les 2 dernières
    // semaines : tous à 0 et 0, à égalité l'ordre des groupes.
    const away = alertHistory({ vacations: ['2026-10-26', '2026-11-02'], dosDown: [], pecDown: [] });
    expect(alertsOf(away)).toEqual(['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes']);
    expect(groupAlerts(input(away)).map((a) => a.group)).toEqual(['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes']);
    // Pectoraux 3 et 3 (6), dos 3 et 3 (6) : à égalité, l'ordre des groupes ; le dos à 3 puis 0 (3) passe devant.
    const both = alertHistory({ pecDown: ['2026-10-26', '2026-11-02'] });
    expect(groupAlerts(input(both)).map((a) => a.group)).toEqual(['pectoraux', 'dos']);
    expect(groupAlerts(input(withoutVariant(both, 'tirage-vertical', '2026-11-02'))).map((a) => a.group)).toEqual(['dos', 'pectoraux']);
    // Même somme, la dernière semaine départage : dos 4,5 puis 1,5 (face pull les deux semaines, plus de tirage la
    // dernière) contre pectoraux 3 et 3 : le dos, plus bas la dernière semaine.
    const tie = withoutVariant(withExercise(both, 'face-pull', ['2026-10-26', '2026-11-02']), 'tirage-vertical', '2026-11-02');
    expect(groupAlert(input(tie), 'dos')).toMatchObject({ recent: [4.5, 1.5] });
    expect(groupAlert(input(tie), 'pectoraux')).toMatchObject({ recent: [3, 3] });
    expect(groupAlerts(input(tie)).map((a) => a.group)).toEqual(['dos', 'pectoraux']);

    // Texte du bandeau (version 1.52.1) : un groupe, le format de la version 1.51.0 ; plusieurs, « Dos, Pectoraux : sous
    // 6 séries ces 2 semaines ». Ligne du bilan : pour plusieurs groupes, les séries de chacun.
    const one = groupAlerts(input(sessions));
    expect(alertBanner(one)).toEqual({ names: 'Dos', rest: alertFigures(one[0]!) });
    expect(alertReportText(one)).toBe('Dos : 3 et 3 séries ces 2 semaines (sous 6)');
    const two = groupAlerts(input(tie));
    expect(alertBanner(two)).toEqual({ names: 'Dos, Pectoraux', rest: 'sous\u00a06\u00a0séries ces 2\u00a0semaines' });
    expect(alertReportText(two)).toBe('Dos, Pectoraux : sous 6 séries ces 2 semaines (Dos 4,5 et 1,5, Pectoraux 3 et 3)');
    const seven = groupAlerts(input(alertHistory({ dosDown: ['2026-11-02'] }), { threshold: 7 }));
    expect(alertReportText(seven)).toBe('Pectoraux, Dos, Triceps, Jambes : sous 7 séries ces 2 semaines (Pectoraux 6 et 3, Dos 6 et 3, Triceps 6 et 6, Jambes 6 et 6)');
  });
});
