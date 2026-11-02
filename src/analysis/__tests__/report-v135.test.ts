import { describe, expect, it } from 'vitest';
import type { ActivityRecord } from '../../activities/model';
import type { Exercise, Session } from '../../domain/types';
import { rebuildProfile } from '../../engine';
import { buildEngineSettings, displayName, indexVariants } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { buildReport, buildReportScreen, ladderSteps, parsePeriodKey, progressionMeta, reportText, type ReportInput, type ReportPeriod } from '../report';
import { DEFAULT_RECAP_SETTINGS } from '../weekly';

const LIB: Exercise[] = [...SEED_EXERCISES];
const SETTINGS = buildEngineSettings(LIB);
const VARIANTS = indexVariants(LIB);
const name = (id: string) => displayName(VARIANTS.get(id));
/** Le `d` octobre 2026 à `h` heures (heure locale). */
const oct = (d: number, h = 18) => new Date(2026, 9, d, h).getTime();

let n = 0;
/** Séance terminée ; chaque exercice : [variante, nombre de séries], toutes à la cible. */
function session(d: number, perfs: [string, number][], extra: Partial<Session> = {}, cardio = 0): Session {
  const start = oct(d);
  return {
    id: `v${++n}`, name: 'Séance', date: `2026-10-${String(d).padStart(2, '0')}`, startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start,
    origin: 'app', state: 'done',
    performances: perfs.map(([variantId, sets]) => ({ variantId, weightKg: variantId === 'pompes' ? 0 : 40, reps: Array<number>(sets).fill(10), targetReps: 10, plannedSets: sets, feeling: 'bien' })),
    ...(cardio ? { cardio: [{ id: `c${n}`, machineId: 'Tapis de marche', machine: 'Tapis de marche', minutes: cardio }] } : {}),
    ...extra,
  };
}

// Première séance le lundi 12 octobre. Semaine du 19 : la salle le 20 ; la maison le 21 (5 séries de pectoraux) et le 22
// (6 séries) : 11 séries, plafonnées à ½ pour la semaine ; futsal le 23. Semaine du 26 : 3 séries à la maison.
const SESSIONS: Session[] = [
  session(12, [['chest-press', 3]], {}, 10),
  session(20, [['chest-press', 3]], {}, 20),
  session(21, [['pompes', 2], ['pec-deck', 3]], { location: 'maison' }),
  session(22, [['chest-press', 3], ['pec-deck', 3]], { location: 'maison' }),
  session(27, [['pec-deck', 3]], { location: 'maison' }),
];
const FUTSAL: ActivityRecord = {
  id: 'act-ponctuelle-futsal-2026-10-23', habitId: 'ponctuelle-futsal', date: '2026-10-23', name: 'Futsal', start: '00:00', end: '01:00',
  groups: ['jambes'], status: 'done', answeredAt: oct(23), oneOff: true,
};

function screenOf(period: ReportPeriod, now = new Date(2026, 10, 2, 9).getTime()) {
  const input: ReportInput = {
    sessions: SESSIONS, exercises: LIB, evaluations: rebuildProfile(SESSIONS, SETTINGS).evaluations, settings: SETTINGS,
    groups: DEFAULT_RECAP_SETTINGS.groups, weighIns: [], activities: [FUTSAL], now,
  };
  const report = buildReport(period, input);
  return { report, screen: buildReportScreen(report, input) };
}
const week = (key: string) => parsePeriodKey('week', key)!;
const month = parsePeriodKey('month', '2026-10')!;
const bar = (s: ReturnType<typeof screenOf>['screen'], group: string) => s.bars.find((b) => b.group === group);

describe('Écran du bilan, version 1.35.0', () => {
  it('284. Première période suivie, cardio et activités comparés, barres avec la maison plafonnée à ½ par semaine, jours du mois, échelles de cycle ; texte du mail inchangé', () => {
    // Période précédente entièrement avant la première séance : pas d'écart (« Première semaine suivie », « Premier mois suivi »).
    expect(screenOf(week('2026-10-12')).screen.first).toBe(true);
    expect(screenOf(month).screen.first).toBe(true);
    // La semaine du 12 contient la première séance : la semaine du 19 est comparée.
    const w19 = screenOf(week('2026-10-19'));
    expect(w19.screen.first).toBe(false);
    expect(w19.screen).toMatchObject({ cardio: { now: 20, before: 10 }, activities: { now: 1, before: 0 } });
    // Semaine en cours (vendredi 23 au soir) : comparée à lun.–ven. de la semaine précédente (même portion).
    const inProgress = screenOf(week('2026-10-19'), oct(23, 22));
    expect(inProgress.report.compared.partial).toBe(true);
    expect(inProgress.screen).toMatchObject({ first: false, cardio: { now: 20, before: 10 }, activities: { now: 1, before: 0 } });

    // Pectoraux, semaine du 19 : 1 séance à la salle, 11 séries à la maison plafonnées à ½ ; jambes : ½ (futsal).
    expect(bar(w19.screen, 'pectoraux')).toEqual({ group: 'pectoraux', direct: 1, indirect: 0, home: 0.5 });
    expect(bar(w19.screen, 'jambes')).toEqual({ group: 'jambes', direct: 0, indirect: 0.5, home: 0 });
    expect(bar(w19.screen, 'dos')).toEqual({ group: 'dos', direct: 0, indirect: 0, home: 0 });
    // Octobre : le plafond s'applique semaine par semaine (½ + 3/12), pas au mois (14/12).
    const oc = screenOf(month);
    expect(bar(oc.screen, 'pectoraux')).toEqual({ group: 'pectoraux', direct: 2, indirect: 0, home: 0.75 });
    expect(oc.report.groups.find((g) => g.group === 'pectoraux')).toMatchObject({ count: 2, home: 14 });

    // Jours du mois : un par jour, séances à la salle, à la maison, activités.
    expect(oc.screen.days).toHaveLength(31);
    expect(oc.screen.days.filter((d) => d.gym + d.home + d.activities > 0)).toEqual([
      { date: '2026-10-12', gym: 1, home: 0, activities: 0 },
      { date: '2026-10-20', gym: 1, home: 0, activities: 0 },
      { date: '2026-10-21', gym: 0, home: 1, activities: 0 },
      { date: '2026-10-22', gym: 0, home: 1, activities: 0 },
      { date: '2026-10-23', gym: 0, home: 0, activities: 1 },
      { date: '2026-10-27', gym: 0, home: 1, activities: 0 },
    ]);
    // Une échelle par progression, dans le même ordre.
    expect(oc.screen.ladders).toHaveLength(oc.report.progressions.length);

    // Le texte du mail ne dépend pas de l'écran : identique, comparaison comprise (« +5 par rapport au mois précédent »).
    expect(reportText(oc.report, name)).toContain('- 5 séances (dont 3 à la maison), +5 par rapport au mois précédent\n');

    // Échelles : exercice à charge, toute la plage puis « +kg » (« −aide » s'il est assisté).
    const loaded = { minReps: 8, maxReps: 12, step: 1, bodyweight: false };
    const show = (steps: ReturnType<typeof ladderSteps>) => steps.map((s) => `${s.label}:${s.state}`).join(' ');
    const p = (from: number, to: number, kind: 'reps_up' | 'weight_up' = 'reps_up', assisted = false) => ({ kind, from: { weightKg: 40, targetReps: from }, toReps: to, assisted });
    expect(show(ladderSteps(p(8, 9), loaded))).toBe('8:before 9:now 10:next 11:next 12:next +kg:next');
    expect(show(ladderSteps(p(10, 11), loaded))).toBe('8:done 9:done 10:before 11:now 12:next +kg:next');
    expect(show(ladderSteps(p(12, 8, 'weight_up'), loaded))).toBe('8:done 9:done 10:done 11:done 12:before +kg:now');
    expect(show(ladderSteps(p(12, 8, 'weight_up', true), loaded))).toBe('8:done 9:done 10:done 11:done 12:before −aide:now');
    // Plage de la maison (8 à 15) : 5 crans autour de la cible, « +kg » seulement quand le haut de la plage est affiché.
    expect(show(ladderSteps(p(9, 10), { ...loaded, maxReps: 15 }))).toBe('8:done 9:before 10:now 11:next 12:next');
    expect(show(ladderSteps(p(14, 15), { ...loaded, maxReps: 15 }))).toBe('11:done 12:done 13:done 14:before 15:now +kg:next');
    // Poids du corps (10 à 40) et secondes (20 à 60 s, pas de 5) : 5 crans, jamais de « +kg ».
    const body = { minReps: 10, maxReps: 40, step: 1, bodyweight: true };
    expect(show(ladderSteps(p(24, 25), body))).toBe('23:done 24:before 25:now 26:next 27:next');
    expect(show(ladderSteps(p(10, 11), body))).toBe('10:before 11:now 12:next 13:next 14:next');
    expect(show(ladderSteps(p(39, 40), body))).toBe('36:done 37:done 38:done 39:before 40:now');
    expect(show(ladderSteps(p(25, 30), { minReps: 20, maxReps: 60, step: 5, bodyweight: true }))).toBe('20:done 25:before 30:now 35:next 40:next');
    // Cible sous la plage (choix manuel) : la plage s'élargit.
    expect(show(ladderSteps(p(6, 7), loaded))).toBe('6:before 7:now 8:next 9:next 10:next');

    // Ligne sous le nom.
    const prog = (over: object) => ({ variantId: 'x', date: '2026-10-29', kind: 'reps_up' as const, sets: 3, from: { weightKg: 52, targetReps: 8 }, toReps: 9, assisted: false, ...over });
    expect(progressionMeta(prog({}))).toBe('3 séries · à 52 kg · 29 oct.');
    expect(progressionMeta(prog({ from: { weightKg: 12, targetReps: 8 } }), true)).toBe('3 séries · à 12 kg / haltère · 29 oct.');
    expect(progressionMeta(prog({ assisted: true, from: { weightKg: 41, targetReps: 8 } }))).toBe('3 séries · avec 41 kg d’aide · 29 oct.');
    expect(progressionMeta(prog({ sets: 2, from: { weightKg: 0, targetReps: 10 } }))).toBe('2 séries · poids du corps · 29 oct.');
    expect(progressionMeta(prog({ seconds: true, from: { weightKg: 0, targetReps: 25 } }))).toBe('3 séries · en secondes · 29 oct.');
  });
});
