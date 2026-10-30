import { describe, expect, it } from 'vitest';
import type { Exercise, Session } from '../../domain/types';
import { SEED_EXERCISES } from '../../library/seed';
import { groupWeeklySets, SETS_WEEKS } from '../groups';

const LIB: Exercise[] = [...SEED_EXERCISES];
/** Le `d` du mois `m` (0 = janvier) 2026, à `h` heures. */
const at = (m: number, d: number, h = 18) => new Date(2026, m, d, h).getTime();

/** Séance terminée ; chaque exercice : [variante, nombre de séries]. */
function session(m: number, d: number, perfs: [string, number][], extra: Partial<Session> = {}): Session {
  return {
    id: `s${m}-${d}`, name: 'Séance', date: `2026-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, startedAt: at(m, d), endedAt: at(m, d) + 3_600_000,
    createdAt: at(m, d), updatedAt: at(m, d), origin: 'app', state: 'done',
    performances: perfs.map(([variantId, sets]) => ({ variantId, weightKg: 40, reps: Array<number>(sets).fill(8), targetReps: 8, plannedSets: sets, feeling: 'bien' })),
    ...extra,
  };
}

describe('Séries par semaine, version 1.34.0', () => {
  // Première séance : mardi 6 octobre, à la maison, abdos seuls. Pectoraux : semaine du 12 (chest press 3 séries, dips
  // assistés 3 séries indirectes : 4,5), semaine du 19 vide (vacances), semaine du 26 (6), semaine du 2 nov. (2, en cours).
  const sessions = [
    session(9, 6, [['crunch-sol', 3]], { location: 'maison' }),
    session(9, 13, [['chest-press', 3], ['dips-assistes', 3]]),
    session(9, 27, [['chest-press', 3], ['pec-deck', 3]]),
    session(10, 3, [['chest-press', 2]]),
  ];

  it('282. Depuis la semaine de la première séance (12 au plus, semaines vides après elle gardées) ; moyenne de la première semaine du groupe à la dernière terminée, semaines vides comprises', () => {
    // Début : la semaine de la première séance, toutes séances confondues (maison, autre groupe), plus 12 semaines en arrière.
    const pecs = groupWeeklySets(sessions, LIB, 'pectoraux', at(10, 4, 12));
    expect(pecs.weeks.map((w) => [w.start, w.total])).toEqual([
      ['2026-10-05', 0], ['2026-10-12', 4.5], ['2026-10-19', 0], ['2026-10-26', 6], ['2026-11-02', 2],
    ]);
    // Moyenne : du 12 oct. (première semaine du groupe) au 26 oct. (dernière terminée), vacances comprises ; ni la semaine
    // du 5 oct. (avant les pectoraux), ni la semaine en cours.
    expect(pecs).toMatchObject({ activeWeeks: 3, enough: true, average: (4.5 + 0 + 6) / 3 });
    // La semaine du 2 nov. entre dans la moyenne une fois terminée (lundi 9 nov.).
    const next = groupWeeklySets(sessions, LIB, 'pectoraux', at(10, 9, 8));
    expect(next.weeks.map((w) => w.start)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']);
    expect(next.average).toBe((4.5 + 0 + 6 + 2) / 4);
    // Dimanche soir, la semaine n'est pas terminée : toujours exclue.
    expect(groupWeeklySets(sessions, LIB, 'pectoraux', at(10, 8, 23)).average).toBe(pecs.average);

    // Une séance en cours ne fait pas reculer le début ; une séance importée sans heure, si.
    const started = { ...session(8, 28, [['chest-press', 3]]), state: 'active' as const, endedAt: null };
    expect(groupWeeklySets([...sessions, started], LIB, 'pectoraux', at(10, 4, 12)).weeks[0]!.start).toBe('2026-10-05');
    const imported = session(8, 30, [['leg-curl', 3]], { origin: 'import', startedAt: null, endedAt: null });
    expect(groupWeeklySets([...sessions, imported], LIB, 'pectoraux', at(10, 4, 12)).weeks[0]!.start).toBe('2026-09-28');

    // Plus de 12 semaines de données : les plus anciennes sortent, comme avant ; la moyenne porte sur les semaines affichées.
    const old = [session(5, 1, [['chest-press', 3]]), ...sessions];
    const long = groupWeeklySets(old, LIB, 'pectoraux', at(10, 4, 12));
    expect(long.weeks).toHaveLength(SETS_WEEKS);
    expect(long.weeks[0]!.start).toBe('2026-08-17');
    expect(long.average).toBeCloseTo((4.5 + 0 + 6) / 3, 9);

    // Sous le seuil (3 semaines avec des séries) : pas de moyenne ; sans séance, la semaine en cours seule.
    expect(groupWeeklySets(sessions, LIB, 'abdominaux', at(10, 4, 12))).toMatchObject({ activeWeeks: 1, enough: false, average: null });
    expect(groupWeeklySets(sessions.slice(0, 3), LIB, 'pectoraux', at(10, 4, 12))).toMatchObject({ enough: false, average: null });
    expect(groupWeeklySets([], LIB, 'pectoraux', at(10, 4, 12))).toEqual({
      weeks: [{ start: '2026-11-02', direct: 0, indirect: 0, total: 0 }], activeWeeks: 0, enough: false, average: null,
    });
  });
});
