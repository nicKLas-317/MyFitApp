import { describe, expect, it } from 'vitest';
import type { ActivityRecord } from '../../activities/model';
import type { Exercise, Session } from '../../domain/types';
import { rebuildProfile } from '../../engine';
import { buildEngineSettings, displayName, indexVariants } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { buildReport, comparedTo, lineText, reportSections, reportText, type ReportInput } from '../report';
import { periodContaining, type ReportPeriod } from '../reportPeriod';
import { buildReportScreen } from '../reportScreen';
import { DEFAULT_RECAP_SETTINGS } from '../weekly';

const LIB: Exercise[] = [...SEED_EXERCISES];
const SETTINGS = buildEngineSettings(LIB);
const VARIANTS = indexVariants(LIB);
const name = (id: string) => displayName(VARIANTS.get(id));
/** Le `d` du mois `m` (0 = janvier) 2026 à `h` heures (heure locale). */
const at = (m: number, d: number, h = 12, min = 0) => new Date(2026, m, d, h, min).getTime();
const day = (m: number, d: number) => `2026-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Séance terminée de `minutes` (sans heure : importée), un chest press de 3 séries. */
function session(m: number, d: number, minutes: number | null, extra: Partial<Session> = {}): Session {
  const start = at(m, d);
  return {
    id: `s-${day(m, d)}-${extra.location ?? 'salle'}`, name: 'Séance', date: day(m, d), origin: minutes === null ? 'import' : 'app', state: 'done',
    startedAt: minutes === null ? null : start, endedAt: minutes === null ? null : start + minutes * 60_000, createdAt: start, updatedAt: start,
    performances: [{ variantId: 'chest-press', weightKg: 40, reps: [10, 10, 10], targetReps: 10, plannedSets: 3, feeling: 'bien' }],
    ...extra,
  };
}
function activity(habit: string, label: string, m: number, d: number, start: string, end: string): ActivityRecord {
  return { id: `act-${habit}-${day(m, d)}`, habitId: habit, date: day(m, d), name: label, start, end, groups: ['jambes'], status: 'done', answeredAt: at(m, d, 23) };
}

// Le cas de l'utilisateur (sauvegarde du 17 novembre 2026, simplifiée) : en octobre, deux séances importées sans heure
// (12 et 15), une séance de 40 min (16, 11 min de vélo elliptique) et un futsal (21) ; en novembre, une séance de 45 min
// (3, 16 min de tapis), une à la maison (4) et le badminton (16).
const SESSIONS: Session[] = [
  session(9, 12, null),
  session(9, 15, null),
  session(9, 16, 40, { cardio: [{ id: 'c1', machineId: 'velo-elliptique', machine: 'Vélo elliptique', minutes: 11 }] }),
  session(10, 3, 45, { cardio: [{ id: 'c2', machineId: 'tapis', machine: 'Tapis de marche', incline: 'neutre', minutes: 16 }] }),
  session(10, 4, null, { location: 'maison', origin: 'app', startedAt: at(10, 4, 8), endedAt: at(10, 4, 8, 20) }),
];
const FUTSAL = activity('habitude-futsal', 'Futsal', 9, 21, '21:00', '22:00');
const BADMINTON = activity('badminton', 'Badminton', 10, 16, '21:00', '22:30');
const NOW = at(10, 17, 14, 42);

function build(period: ReportPeriod, activities: ActivityRecord[], sessions = SESSIONS, now = NOW) {
  const input: ReportInput = {
    sessions, exercises: LIB, evaluations: rebuildProfile(sessions, SETTINGS).evaluations, settings: SETTINGS,
    groups: DEFAULT_RECAP_SETTINGS.groups, weighIns: [], activities, now,
  };
  const report = buildReport(period, input);
  return { report, screen: buildReportScreen(report, input), lines: reportSections(report, name)[0]!.lines.map(lineText), text: reportText(report, name) };
}

describe('Bilans : comparaison avec la période précédente entière (§19.7, version 1.50.0)', () => {
  it('318. Période en cours comparée à la précédente entière (séances, durée, cardio, activités) ; « Par rapport au mois dernier » ; durée toujours comparée, une séance sans durée comptant pour 0', () => {
    const NOVEMBER = periodContaining('month', NOW);
    const nov = build(NOVEMBER, [FUTSAL, BADMINTON]);
    expect(nov.report.inProgress).toBe(true);
    expect(nov.report.first).toBe(false);
    // Tout octobre, pas le 1er–17 octobre.
    expect(nov.report.compared).toEqual({ start: new Date(2026, 9, 1), next: new Date(2026, 10, 1) });
    expect(comparedTo(nov.report)).toEqual({ with: 'au mois dernier', same: 'le mois dernier' });
    // Badminton ×1 en novembre contre futsal ×1 (21 oct.) sur tout octobre : « = » (et non plus « +1 ») ; cardio 16 contre 11.
    expect(nov.screen.activities).toEqual({ now: 1, before: 1 });
    expect(nov.screen.cardio).toEqual({ now: 16, before: 11 });
    // Durée : 45 min contre 40 min connues (les deux séances importées sans heure comptent pour 0) ; elles restent signalées
    // dans le bilan d'octobre, jamais affichées « 0 min ».
    expect(nov.lines).toEqual([
      '2 séances (dont 1 à la maison), −1 par rapport au mois dernier',
      'Durée en salle : 45 min, +5 min par rapport au mois dernier',
      'Cardio : 16 min (Tapis de marche 16 min)',
      'Activités : Badminton ×1, 1 h 30',
    ]);
    expect(nov.text).toContain('\n- 2 séances (dont 1 à la maison), −1 par rapport au mois dernier\n- Durée en salle : 45 min, +5 min par rapport au mois dernier\n');
    expect(nov.text).not.toMatch(/1er–\d+|du mois dernier|pas de comparaison/);
    const october = build(periodContaining('month', at(9, 1)), [FUTSAL, BADMINTON]);
    expect(october.lines.slice(0, 2)).toEqual(['3 séances, premier mois suivi', 'Durée en salle : 40 min (2 séances sans durée)']);

    // Une 2ᵉ activité en novembre : « +1 ».
    const twice = build(NOVEMBER, [FUTSAL, activity('badminton', 'Badminton', 10, 9, '21:00', '22:30'), BADMINTON]);
    expect(twice.screen.activities).toEqual({ now: 2, before: 1 });

    // Le 1er novembre au matin : écarts négatifs, rattrapés au fil du mois.
    const first = build(NOVEMBER, [FUTSAL], SESSIONS.slice(0, 3), at(10, 1, 9));
    expect(first.lines.slice(0, 2)).toEqual(['0 séance, −3 par rapport au mois dernier', 'Durée en salle : 0 min, −40 min par rapport au mois dernier']);
    expect(first.screen).toMatchObject({ cardio: { now: 0, before: 11 }, activities: { now: 0, before: 1 } });

    // Semaine en cours (mardi 17) : comparée à toute la semaine du 9 au 15, « Par rapport à la semaine dernière ».
    const weekSessions = [...SESSIONS, session(10, 10, 30), session(10, 12, 40), session(10, 17, null, { location: 'maison', origin: 'app', startedAt: at(10, 17, 8), endedAt: at(10, 17, 8, 15) })];
    const week = build(periodContaining('week', NOW), [FUTSAL, BADMINTON], weekSessions);
    expect(week.report.compared).toEqual({ start: new Date(2026, 10, 9), next: new Date(2026, 10, 16) });
    expect(comparedTo(week.report)).toEqual({ with: 'à la semaine dernière', same: 'la semaine dernière' });
    expect(week.lines.slice(0, 2)).toEqual(['1 séance (dont 1 à la maison), −1 par rapport à la semaine dernière', 'Durée en salle : 0 min, −1 h 10 par rapport à la semaine dernière']);
    expect(week.screen.activities).toEqual({ now: 1, before: 0 });

    // Une période terminée a le même libellé : semaine du 9 au 15 contre celle du 2 au 8.
    const done = build(periodContaining('week', at(10, 12)), [FUTSAL, BADMINTON], weekSessions);
    expect(done.lines[0]).toBe('2 séances, autant que la semaine dernière');
    expect(done.lines[1]).toBe('Durée en salle : 1 h 10, +25 min par rapport à la semaine dernière');
  });
});
