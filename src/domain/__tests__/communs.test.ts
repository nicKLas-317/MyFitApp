import { describe, expect, it } from 'vitest';
import type { Exercise, Session } from '../types';
import { dayPart, localDate, parseIsoDay, sessionStartTime, shiftIsoDay, weekBounds, weekStart } from '../calendar';
import { LEG_SUBGROUPS, MAIN_GROUPS, MUSCLE_GROUPS, parentGroup, RECAP_GROUP_ORDER, recapGroupOf } from '../muscleGroups';
import { countsAsWork } from '../performance';
import { MUSCLE_GROUP_LABELS, SEED_EXERCISES } from '../../library/seed';
import { buildEngineSettings } from '../../library/catalog';
import { DEFAULT_RECAP_SETTINGS, groupScore, weeklyRecap } from '../../analysis/weekly';
import { groupWeeklySets } from '../../analysis/groups';
import { weekSuggestion } from '../../plan/suggest';
import { weekHistory, WEEK_NOW } from '../../plan/__tests__/completer-simulation';

describe('Calendrier, groupes et travail : une seule définition (version 1.41.3)', () => {
  it('300. Calendrier : lundi 0 h 00, semaine du lundi au lundi suivant, changements d’heure, date « AAAA-MM-JJ » en heure locale', () => {
    // Dimanche 25 oct. 2026 (passage à l'heure d'hiver) et lundi 26.
    expect(localDate(weekStart(new Date(2026, 9, 25, 23, 30)).getTime())).toBe('2026-10-19');
    expect(localDate(weekStart(new Date(2026, 9, 26, 0, 0)).getTime())).toBe('2026-10-26');
    const { start, next } = weekBounds(new Date(2026, 9, 25, 12).getTime());
    expect([localDate(start.getTime()), localDate(next.getTime())]).toEqual(['2026-10-19', '2026-10-26']);
    expect(next.getHours()).toBe(0);
    expect(parseIsoDay('2026-10-25').getTime()).toBe(new Date(2026, 9, 25).getTime());
    expect(parseIsoDay('2026-10-31', 1, 12).getTime()).toBe(new Date(2026, 10, 1, 12).getTime());
    expect(shiftIsoDay('2026-10-25', 1)).toBe('2026-10-26');
    expect(shiftIsoDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(sessionStartTime({ startedAt: null, date: '2026-10-20' })).toBe(new Date(2026, 9, 20).getTime());
    expect(sessionStartTime({ startedAt: 123, date: '2026-10-20' })).toBe(123);
    expect([0, 11 * 60 + 59, 12 * 60, 17 * 60 + 59, 18 * 60].map(dayPart)).toEqual(['matin', 'matin', 'après-midi', 'après-midi', 'soir']);
  });

  it('300. Groupes : ordre de la bibliothèque, ordre du récapitulatif, sept groupes principaux, sous-groupes des jambes', () => {
    expect(MUSCLE_GROUPS).toEqual(Object.keys(MUSCLE_GROUP_LABELS));
    expect([...RECAP_GROUP_ORDER].sort()).toEqual([...MUSCLE_GROUPS].sort());
    expect(MAIN_GROUPS).toEqual(['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux']);
    expect(LEG_SUBGROUPS.map(parentGroup)).toEqual(LEG_SUBGROUPS.map(() => 'jambes'));
    expect(parentGroup('dos')).toBe('dos');
    const shown = new Set(DEFAULT_RECAP_SETTINGS.groups);
    expect(recapGroupOf('mollets', shown)).toBe('jambes');
    expect(recapGroupOf('mollets', new Set([...shown, 'mollets' as const]))).toBe('mollets');
    expect(recapGroupOf('abdominaux', shown)).toBeNull();
    expect(recapGroupOf('mollets', new Set(['dos' as const]))).toBeNull();
    expect(recapGroupOf(undefined, shown)).toBeNull();
  });

  it('300. Score d’un groupe : le même calcul pour le récapitulatif et les bâtons des bilans (en séries, version 1.45.0)', () => {
    // Séries, plus 3 par activité confirmée et 3 par semaine à 45 min de cardio des jambes.
    expect(groupScore({ sets: 4.5, activities: 1, cardioWeeks: 1 })).toBe(10.5);
    expect(groupScore({ sets: 0, activities: 2, cardioWeeks: 0 })).toBe(6);
    const sessions = weekHistory();
    const cells = weeklyRecap(sessions, SEED_EXERCISES, WEEK_NOW).cells;
    for (const c of cells) {
      const sets = groupWeeklySets(sessions, SEED_EXERCISES, c.group, WEEK_NOW).weeks.at(-1)!.total;
      expect(c.score, c.group).toBe(groupScore({ sets, activities: c.activities.length, cardioWeeks: c.cardio ? 1 : 0 }));
    }
  });

  it('300. Une performance partielle importée compte comme du travail, partout : récapitulatif, et « la veille » de la séance pour compléter la semaine', () => {
    expect(countsAsWork({ reps: [8, 8, 8] })).toBe(true);
    expect(countsAsWork({ reps: [] })).toBe(false);
    expect(countsAsWork({ reps: [], partial: true })).toBe(true);
    // Données simulées : le dos, travaillé hier (mercredi) à la salle, est écarté le jeudi ; il l'est encore quand ses
    // performances de la veille sont partielles (importées, poids sans répétitions).
    const history = weekHistory();
    const eve = history.find((s) => s.date === '2026-11-11' && s.location !== 'maison')!;
    const lib: Exercise[] = [...SEED_EXERCISES];
    const isDos = (id: string) => lib.find((e) => e.variants.some((v) => v.id === id))?.primaryGroup === 'dos';
    const partialEve: Session = {
      ...eve,
      performances: eve.performances.map((p) => (isDos(p.variantId) ? { ...p, reps: [], targetReps: null, plannedSets: null, partial: true } : p)),
    };
    expect(eve.performances.some((p) => isDos(p.variantId))).toBe(true);
    const sessions = history.map((s) => (s.id === eve.id ? partialEve : s));
    const veille = (list: Session[]) =>
      weekSuggestion({ sessions: list, exercises: lib, settings: buildEngineSettings(lib), recap: DEFAULT_RECAP_SETTINGS, now: WEEK_NOW })
        ?.skipped.filter((x) => x.reason === 'veille')
        .map((x) => x.group);
    // Mêmes groupes écartés que sans performance partielle, le dos compris (version 1.45.0 : d'autres groupes, sous
    // l'objectif de 10 séries, peuvent l'être aussi).
    expect(veille(sessions)).toContain('dos');
    expect(veille(sessions)).toEqual(veille(history));
  });
});
