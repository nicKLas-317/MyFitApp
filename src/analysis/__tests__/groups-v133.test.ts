import { describe, expect, it } from 'vitest';
import type { Exercise, Session } from '../../domain/types';
import { buildEngineSettings } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { GROUP_VIEW_GROUPS, groupIndex, groupWeeklySets, INDEX_MIN_SESSIONS, SETS_ONLY_GROUPS } from '../groups';

const LIB: Exercise[] = [...SEED_EXERCISES];
const SETTINGS = buildEngineSettings(LIB);
const at = (d: number, h = 18) => new Date(2026, 9, d, h).getTime();

/** Séance du `d` octobre ; chaque exercice : [variante, charge, répétitions, séries prévues]. */
function session(d: number, perfs: [string, number, number[], number?][], extra: Partial<Session> = {}): Session {
  return {
    id: `s${d}${extra.location ?? ''}`, name: 'Séance', date: `2026-10-${String(d).padStart(2, '0')}`, startedAt: at(d), endedAt: at(d) + 3_600_000,
    createdAt: at(d), updatedAt: at(d), origin: 'app', state: 'done',
    performances: perfs.map(([variantId, weightKg, reps, plannedSets = 3]) => ({ variantId, weightKg, reps, targetReps: 8, plannedSets, feeling: 'bien' })),
    ...extra,
  };
}

describe('Bilan par groupe musculaire, version 1.33.0', () => {
  it('280. Indice sans les séances incomplètes (calcul, base, seuil), leurs séries comptées ; base même sous la cible ; secondaires de la maison à ½ ; onglet Abdominaux sans indice', () => {
    // Extension poulie barre : 2 séries sur 3 le 12, puis 3 × 8 à 20 kg le 15, puis 3 × 8 à 22 kg le 19.
    const sessions = [
      session(12, [['extension-triceps-poulie--barre', 18, [8, 8]]]),
      session(15, [['extension-triceps-poulie--barre', 20, [8, 8, 8]]]),
      session(19, [['extension-triceps-poulie--barre', 22, [8, 8, 8]]]),
      session(21, [['extension-triceps-poulie--barre', 30, [8, 8], 3]]),
    ];
    const index = groupIndex(sessions, LIB, SETTINGS, 'triceps');
    // La séance incomplète n'est ni la base (le 15 à 20 kg l'est), ni un point, ni une séance du seuil.
    expect(index.points.map((p) => [p.date, Number(p.value.toFixed(2))])).toEqual([['2026-10-15', 100], ['2026-10-19', 110]]);
    expect(index.sessionCount).toBe(2);
    // Ses séries réelles restent comptées : 2 + 3 la semaine du 12, 3 + 2 la semaine du 19.
    const sets = groupWeeklySets(sessions, LIB, 'triceps', at(23)).weeks.slice(-2);
    expect(sets.map((w) => [w.start, w.direct])).toEqual([['2026-10-12', 5], ['2026-10-19', 5]]);

    // Seuil des 6 séances : 6 séances dont une incomplète ne suffisent pas.
    const six = [12, 13, 14, 19, 20, 26].map((d, i) => session(d, [['extension-triceps-haltere-assis', 12, i === 5 ? [8, 8] : [8, 8, 8]]]));
    expect(groupIndex(six, LIB, SETTINGS, 'triceps')).toMatchObject({ sessionCount: INDEX_MIN_SESSIONS - 1, enough: false });
    expect(groupIndex(six.map((s, i) => (i === 5 ? session(26, [['extension-triceps-haltere-assis', 12, [8, 8, 8]]]) : s)), LIB, SETTINGS, 'triceps').enough).toBe(true);

    // Règle gardée : la base est la première séance, même sous la cible (8-8-6 vaut 6) ; 3 × 8 ensuite : +5,56 %.
    const under = groupIndex([session(12, [['curl-pupitre', 41, [8, 8, 6]]]), session(19, [['curl-pupitre', 41, [8, 8, 8]]])], LIB, SETTINGS, 'biceps');
    expect(under.points.map((p) => Number(p.value.toFixed(2)))).toEqual([100, 105.56]);

    // Règle gardée : à la maison, les groupes secondaires comptent pour moitié dans les séries par semaine.
    const home = session(27, [['developpe-couche-halteres', 11.5, [10, 10, 10]]], { location: 'maison' });
    expect(groupWeeklySets([home], LIB, 'triceps', at(30)).weeks.at(-1)).toMatchObject({ direct: 0, indirect: 3, total: 1.5 });

    // Abdominaux : dans le sélecteur, sans indice ; leurs séries (planche 1 série sur 2 comprise) sont comptées.
    expect(GROUP_VIEW_GROUPS).toEqual(['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux']);
    expect(SETS_ONLY_GROUPS).toEqual(['abdominaux']);
    const abs = [session(27, [['planche', 0, [40], 2], ['crunch-sol', 0, [15], 1]], { location: 'maison' })];
    expect(groupIndex(abs, LIB, SETTINGS, 'abdominaux').points).toEqual([]);
    expect(groupWeeklySets(abs, LIB, 'abdominaux', at(30)).weeks.at(-1)).toMatchObject({ direct: 2, total: 2 });
  });
});
