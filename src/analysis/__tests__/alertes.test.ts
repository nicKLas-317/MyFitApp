import { describe, expect, it } from 'vitest';
import type { Exercise, MuscleGroup, Session } from '../../domain/types';
import { SEED_EXERCISES } from '../../library/seed';
import { groupWeeklySets } from '../groups';
import { ALERT_MAX, alertFigures, groupAlert, groupAlerts, ignoreAlert, sanitizeIgnoredAlerts } from '../groupAlerts';
import { DEFAULT_RECAP_SETTINGS } from '../weekly';
import { ALERT_NOW, alertHistory } from './alertes-simulation';

const LIB: Exercise[] = [...SEED_EXERCISES];
const GROUPS = DEFAULT_RECAP_SETTINGS.groups;
const ALL: MuscleGroup[] = ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux'];
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const alertsOf = (sessions: Session[], now = ALERT_NOW, groups: readonly MuscleGroup[] = GROUPS) => groupAlerts(sessions, LIB, groups, now).map((a) => a.group);

/** Sources de l'application, hors tests. */
const APP_SOURCES = import.meta.glob<string>(['../../**/*.{ts,tsx}', '!../../**/__tests__/**'], { query: '?raw', import: 'default', eager: true });

describe('Alerte « groupe moins travaillé », version 1.38.0', () => {
  it('289. Deux semaines terminées sous la moyenne des semaines d’avant (4 au moins), 6 semaines terminées au total ; vacances comptées, une seule semaine en baisse ou historique trop court : rien', () => {
    const sessions = alertHistory();
    // Dos en baisse 2 semaines : 3 et 3 séries, sous la moyenne des 8 semaines d'avant, vacances comprises (6 × 7 ÷ 8).
    expect(groupAlert(sessions, LIB, 'dos', ALERT_NOW)).toEqual({ group: 'dos', week: '2026-11-02', recent: [3, 3], average: 5.25, referenceWeeks: 8 });
    // Mêmes séries que le graphique « Séries par semaine » (semaine en cours exclue).
    const graph = groupWeeklySets(sessions, LIB, 'dos', ALERT_NOW).weeks;
    expect(graph.slice(-3, -1).map((w) => w.total)).toEqual([3, 3]);
    expect(graph.at(-1)).toMatchObject({ start: '2026-11-09', total: 0 });
    // Pectoraux en baisse une seule semaine (6 puis 3) : pas d'alerte. Les autres groupes, réguliers : rien.
    expect(groupWeeklySets(sessions, LIB, 'pectoraux', ALERT_NOW).weeks.slice(-3, -1).map((w) => w.total)).toEqual([6, 3]);
    expect(groupAlert(sessions, LIB, 'pectoraux', ALERT_NOW)).toBeNull();
    expect(alertsOf(sessions, ALERT_NOW, ALL)).toEqual(['dos']);

    // Vacances : la semaine vide compte dans la moyenne (comme la moyenne du graphique) ; sans elle, 6.
    expect(groupAlert(alertHistory({ vacations: [] }), LIB, 'dos', ALERT_NOW)).toMatchObject({ average: 6, referenceWeeks: 8 });
    // Vacances les 2 dernières semaines : tous les groupes sous leur moyenne ; 3 lignes au plus, à égalité dans l'ordre des groupes.
    const away = alertHistory({ vacations: ['2026-10-26', '2026-11-02'], dosDown: [], pecDown: [] });
    expect(GROUPS.map((g) => groupAlert(away, LIB, g, ALERT_NOW)?.recent)).toEqual(GROUPS.map(() => [0, 0]));
    expect(alertsOf(away)).toEqual(['pectoraux', 'dos', 'epaules']);
    expect(ALERT_MAX).toBe(3);

    // Strictement sous la moyenne : une semaine égale à la moyenne n'alerte pas (sans vacances, moyenne du dos 6).
    expect(groupAlert(alertHistory({ vacations: [], dosDown: ['2026-11-02'] }), LIB, 'dos', ALERT_NOW)).toBeNull();

    // Historique trop court : 5 semaines terminées (du 5 oct. au 2 nov.), le dos en baisse 2 semaines : rien.
    expect(alertsOf(alertHistory({ from: '2026-10-05' }), ALERT_NOW, ALL)).toEqual([]);
    // 6 semaines terminées (du 28 sept.), 4 de référence : l'alerte apparaît.
    expect(groupAlert(alertHistory({ from: '2026-09-28' }), LIB, 'dos', ALERT_NOW)).toMatchObject({ average: 6, referenceWeeks: 4 });
    // Groupe commencé tard : moins de 4 semaines de référence (jambes depuis le 12 oct. : 2), rien, même en baisse.
    const lateLegs = alertHistory().map((s) =>
      s.date < '2026-10-12' || s.date >= '2026-10-26' ? { ...s, performances: s.performances.filter((p) => p.variantId !== 'presse-a-cuisses') } : s,
    );
    expect(groupWeeklySets(lateLegs, LIB, 'jambes', ALERT_NOW).weeks.slice(-3, -1).map((w) => w.total)).toEqual([0, 0]);
    expect(groupAlert(lateLegs, LIB, 'jambes', ALERT_NOW)).toBeNull();

    // Semaines terminées seulement : le dimanche 8 nov. au soir, la semaine du 2 nov. n'est pas finie (19 oct. et
    // 26 oct. comparés : 6 puis 3) ; le lundi 9 nov. à 0 h 00, l'alerte apparaît.
    expect(groupAlert(sessions, LIB, 'dos', at(2026, 11, 8, 23, 59))).toBeNull();
    expect(groupAlert(sessions, LIB, 'dos', at(2026, 11, 9, 0, 0))).toMatchObject({ week: '2026-11-02' });
    // Une séance en cours ne compte pas : la séance du jeudi 5 nov. encore ouverte ne change rien (le dos reste à 3).
    const ongoing = sessions.map((s) => (s.date === '2026-11-05' ? { ...s, state: 'active' as const, endedAt: null } : s));
    expect(groupAlert(ongoing, LIB, 'dos', ALERT_NOW)).toMatchObject({ recent: [3, 0] });

    // Aujourd'hui (3 nov. 2026) avec une première séance en octobre : moins de 6 semaines terminées, aucune alerte.
    expect(alertsOf(alertHistory({ from: '2026-10-05', until: '2026-11-02' }), at(2026, 11, 3), ALL)).toEqual([]);

    // Données simulées jamais chargées par l'application.
    expect(Object.keys(APP_SOURCES).length).toBeGreaterThan(50);
    expect(Object.entries(APP_SOURCES).filter(([, source]) => source.includes('alertes-simulation')).map(([file]) => file)).toEqual([]);
  });

  it('290. « Ignorer » : masquée jusqu’à une nouvelle semaine encore sous la moyenne ; groupes du récapitulatif ; le plus en retrait d’abord ; mémoire de l’appareil contrôlée', () => {
    const sessions = alertHistory();
    const dos = groupAlerts(sessions, LIB, GROUPS, ALERT_NOW)[0]!;
    const ignored = ignoreAlert({}, dos);
    expect(ignored).toEqual({ dos: '2026-11-02' });
    expect(groupAlerts(sessions, LIB, GROUPS, ALERT_NOW, ignored)).toEqual([]);
    // Toujours ignorée pendant la semaine du 9 nov., même le dimanche soir.
    expect(groupAlerts(sessions, LIB, GROUPS, at(2026, 11, 15, 23, 59), ignored)).toEqual([]);
    // Une semaine de plus sous la moyenne (9 nov. : 3 séries) : l'alerte revient, pour la semaine du 9 nov.
    const longer = alertHistory({ until: '2026-11-16', dosDown: ['2026-10-26', '2026-11-02', '2026-11-09'] });
    expect(groupAlerts(longer, LIB, GROUPS, at(2026, 11, 18), ignored).map((a) => [a.group, a.week])).toEqual([['dos', '2026-11-09']]);
    // Le dos se reprend (6 séries le 9 nov.) : plus d'alerte, ignorée ou non.
    expect(groupAlerts(alertHistory({ until: '2026-11-16' }), LIB, GROUPS, at(2026, 11, 18))).toEqual([]);

    // Seulement les groupes du récapitulatif : sans le dos, rien ; abdominaux seulement s'ils y sont.
    expect(alertsOf(sessions, ALERT_NOW, ['pectoraux', 'biceps'])).toEqual([]);
    const abs = sessions.map((s) => (s.date < '2026-10-26' ? { ...s, performances: [...s.performances, { ...s.performances[0]!, variantId: 'crunch-sol', weightKg: 0 }] } : s));
    expect(alertsOf(abs, ALERT_NOW, GROUPS)).toEqual(['dos']);
    expect(alertsOf(abs, ALERT_NOW, [...GROUPS, 'abdominaux'])).toEqual(['abdominaux', 'dos']);

    // Le plus en retrait d'abord (rapport des 2 semaines à la moyenne), puis l'ordre des groupes.
    const both = alertHistory({ dosDown: ['2026-10-26', '2026-11-02'], pecDown: ['2026-10-26', '2026-11-02'], vacations: [] });
    // Pectoraux 3 et 3 sur 6 (½), dos 3 et 3 sur 6 (½) : ordre des groupes ; puis le dos à 0.
    expect(alertsOf(both)).toEqual(['pectoraux', 'dos']);
    const deeper = both.map((s) => (s.date >= '2026-10-26' ? { ...s, performances: s.performances.filter((p) => p.variantId !== 'tirage-vertical') } : s));
    expect(alertsOf(deeper)).toEqual(['dos', 'pectoraux', 'biceps']);

    // Chiffres de l'alerte (version 1.38.1) : séries des 2 semaines (en moyenne) et moyenne de l'alerte, une décimale.
    expect(alertFigures(dos)).toBe('3\u00a0séries par semaine depuis 2\u00a0semaines (ta\u00a0moyenne\u00a0:\u00a05,3)');
    const figures = (recent: number[], average: number) => alertFigures({ group: 'dos', week: '2026-11-02', recent, average, referenceWeeks: 4 });
    expect(figures([4, 2], 6)).toBe('3\u00a0séries par semaine depuis 2\u00a0semaines (ta\u00a0moyenne\u00a0:\u00a06)');
    expect(figures([4.5, 4], 4.75)).toBe('4,3\u00a0séries par semaine depuis 2\u00a0semaines (ta\u00a0moyenne\u00a0:\u00a04,8)');
    expect(figures([1.5, 0], 1.98)).toBe('0,8\u00a0série par semaine depuis 2\u00a0semaines (ta\u00a0moyenne\u00a0:\u00a02)');
    expect(figures([0, 0], 1)).toBe('0\u00a0série par semaine depuis 2\u00a0semaines (ta\u00a0moyenne\u00a0:\u00a01)');
    expect(figures([1.5, 2.5], 3)).toBe('2\u00a0séries par semaine depuis 2\u00a0semaines (ta\u00a0moyenne\u00a0:\u00a03)');

    // Mémoire de l'appareil contrôlée : groupes du sélecteur et lundis seulement.
    expect(sanitizeIgnoredAlerts({ dos: '2026-11-02', quadriceps: '2026-11-02', biceps: 'hier', triceps: 3 })).toEqual({ dos: '2026-11-02' });
    expect(sanitizeIgnoredAlerts(null)).toEqual({});
    expect(sanitizeIgnoredAlerts(['dos'])).toEqual({});
  });
});
