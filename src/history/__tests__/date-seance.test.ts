import { describe, expect, it } from 'vitest';
import type { Session } from '../../domain/types';
import { SEED_EXERCISES } from '../../library/seed';
import { buildEngineSettings } from '../../library/catalog';
import { rebuildProfile } from '../../engine';
import { weeklyRecap, DEFAULT_RECAP_SETTINGS } from '../../analysis/weekly';
import { buildReport, periodContaining } from '../../analysis/report';
import { groupWeeklySets } from '../../analysis/groups';
import { localDate } from '../../domain/calendar';
import { defaultSessionName, formatHour } from '../../session/format';
import { setSessionDate } from '../ops';

const LIB = SEED_EXERCISES;
const SETTINGS = buildEngineSettings(LIB);
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();

function session(id: string, start: number | null, date: string, weightKg: number): Session {
  return {
    id, name: start === null ? 'Séance du 25 octobre 2026' : defaultSessionName(start), date, startedAt: start, endedAt: start === null ? null : start + 3_600_000,
    createdAt: start ?? at(25, 12), updatedAt: start ?? at(25, 12), origin: start === null ? 'import' : 'app', state: 'done',
    performances: [{ variantId: 'pec-deck', weightKg, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' }],
  };
}

describe('Changer la date d’une séance passée (version 1.41.4)', () => {
  // Dimanche 25 octobre 2026 (passage à l'heure d'hiver), 18 h – 19 h, déplacée au lundi 26 ; une séance le lundi à 8 h.
  const sunday = session('dimanche', at(25, 18), '2026-10-25', 40);
  const monday = session('lundi-matin', at(26, 8), '2026-10-26', 35);
  const NOW = at(28, 12);

  it('301. Début et fin passent au nouveau jour, à la même heure ; récapitulatif, bilans, séries par semaine et moteur la rangent tous dans la nouvelle semaine', () => {
    const moved = setSessionDate(sunday, '2026-10-26', 99);
    expect(moved).toMatchObject({ date: '2026-10-26', updatedAt: 99 });
    expect([localDate(moved.startedAt!), formatHour(moved.startedAt!), formatHour(moved.endedAt!)]).toEqual(['2026-10-26', '18 h 00', '19 h 00']);
    expect(moved.endedAt! - moved.startedAt!).toBe(3_600_000);
    // Nom par défaut réenregistré à la nouvelle date (séance non renommée).
    expect(moved.name).toBe('Séance du 26 octobre 2026 — 18 h 00');
    const sessions = [moved, monday];

    // Récapitulatif : deux séances la semaine du 26, aucune la semaine du 19.
    const recap = weeklyRecap(sessions, LIB, NOW, DEFAULT_RECAP_SETTINGS);
    expect(recap.sessionCount).toBe(2);
    expect(recap.cells.find((c) => c.group === 'pectoraux')?.count).toBe(2);
    expect(weeklyRecap(sessions, LIB, at(25, 21), DEFAULT_RECAP_SETTINGS).sessionCount).toBe(0);

    // Bilans de la semaine : la semaine du 26 a les deux séances, celle du 19 aucune.
    const replay = rebuildProfile(sessions, SETTINGS);
    const input = { sessions, exercises: LIB, evaluations: replay.evaluations, settings: SETTINGS, groups: DEFAULT_RECAP_SETTINGS.groups, weighIns: [], now: NOW };
    expect(buildReport(periodContaining('week', at(26, 12)), input).totals.sessionCount).toBe(2);
    expect(buildReport(periodContaining('week', at(22, 12)), input).totals.sessionCount).toBe(0);

    // Séries par semaine : 6 séries de pectoraux la semaine du 26, aucune la semaine du 19.
    const weeks = groupWeeklySets(sessions, LIB, 'pectoraux', NOW).weeks;
    expect(weeks.find((w) => w.start === '2026-10-26')?.direct).toBe(6);
    expect(weeks.find((w) => w.start === '2026-10-19')?.direct ?? 0).toBe(0);

    // Moteur : la séance déplacée vient après celle du lundi matin (18 h après 8 h) ; son palier est le dernier.
    expect(replay.evaluations.map((e) => e.sessionId)).toEqual(['lundi-matin', 'dimanche']);
    expect(replay.profile.variants['pec-deck']?.palier.weightKg).toBe(40);
  });

  it('301. Une séance sans heure reste sans heure ; un nom donné à la main est gardé ; même date : rien ne change', () => {
    const imported = session('import', null, '2026-10-25', 40);
    const moved = setSessionDate(imported, '2026-10-26', 99);
    expect(moved).toMatchObject({ date: '2026-10-26', startedAt: null, endedAt: null, name: 'Séance du 26 octobre 2026' });
    const named = setSessionDate({ ...sunday, name: 'Haut du corps' }, '2026-10-27', 99);
    expect(named.name).toBe('Haut du corps');
    expect(localDate(named.startedAt!)).toBe('2026-10-27');
    expect(setSessionDate(sunday, '2026-10-25', 99)).toBe(sunday);
  });
});
