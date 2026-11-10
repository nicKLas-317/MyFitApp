import { describe, expect, it } from 'vitest';
import type { Exercise, MuscleGroup, Performance, Session } from '../../domain/types';
import { buildReport, periodContaining, reportText } from '../report';
import { rebuildProfile } from '../../engine';
import { buildEngineSettings, displayName, indexVariants } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { recapCountLabel, weeklyRecap } from '../weekly';

const LIB: Exercise[] = [...SEED_EXERCISES];
const settings = buildEngineSettings(LIB);
const GROUPS: MuscleGroup[] = ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux'];
const RECAP = { groups: GROUPS, redSets: 10 };
const NOW = new Date(2026, 9, 30, 20).getTime(); // vendredi 30 octobre 2026

const p = (variantId: string, reps: number[], weightKg = 0): Performance => ({
  variantId, weightKg, targetReps: reps[0] ?? 10, plannedSets: Math.max(reps.length, 1), reps, feeling: 'bien',
});
/** Séance terminée le jour `d` d'octobre 2026, à `h` heures, d'une demi-heure ; `home` : à la maison. */
function session(id: string, d: number, performances: Performance[], home = false, h = 9): Session {
  const t = new Date(2026, 9, d, h).getTime();
  return {
    id, name: id, date: `2026-10-${String(d).padStart(2, '0')}`, startedAt: t, endedAt: t + 1_800_000, createdAt: t, updatedAt: t,
    origin: 'app', state: 'done', performances, ...(home ? { location: 'maison' as const } : {}),
  };
}
const cellOf = (sessions: Session[], group: MuscleGroup) => weeklyRecap(sessions, LIB, NOW, RECAP).cells.find((c) => c.group === group)!;
const pompes = (sets: number) => p('pompes', Array.from({ length: sets }, () => 10));

describe('Récapitulatif : la maison au nombre de séries (versions 1.28.0 et 1.45.0)', () => {
  it('264. La maison compte ses séries en entier (version 1.45.0 : plus de 1/12 par série ni de plafond de ½), groupes secondaires pour moitié ; un exercice sans série ne compte jamais', () => {
    // Avant la version 1.45.0 : 2 séries de pompes valaient 1/6 et la maison seule laissait toujours le groupe vert.
    expect(cellOf([session('m', 30, [pompes(2)], true)], 'pectoraux')).toMatchObject({ home: 2, score: 2, color: 'vert', recency: 'today' });
    expect(recapCountLabel(cellOf([session('m', 30, [pompes(2)], true)], 'pectoraux'))).toBe('2\u00a0séries');
    expect(recapCountLabel(cellOf([session('m', 30, [pompes(1)], true)], 'pectoraux'))).toBe('1\u00a0série');
    const incline = p('developpe-incline--halteres', [10, 10, 10], 10);
    expect(cellOf([session('m', 30, [incline], true)], 'pectoraux')).toMatchObject({ score: 3, color: 'orange' });
    // Les groupes secondaires de la maison comptent pour moitié, comme dans le graphique « Séries par semaine ».
    expect(cellOf([session('m', 30, [incline], true)], 'triceps')).toMatchObject({ count: 0, indirect: 0, score: 1.5, color: 'vert' });
    expect(cellOf([session('m', 30, [incline, pompes(2)], true)], 'pectoraux')).toMatchObject({ home: 5, score: 5, color: 'orange' });
    // Plus de plafond : 13 séries en une séance, ou trois séances de 6 séries, rendent le groupe rouge.
    expect(cellOf([session('m', 30, [p('pompes', Array(10).fill(10)), incline], true)], 'pectoraux')).toMatchObject({ home: 13, score: 13, color: 'rouge' });
    const three = [26, 27, 28].map((d) => session(`m${d}`, d, [p('developpe-incline--halteres', Array(6).fill(10), 10)], true));
    expect(cellOf(three, 'pectoraux')).toMatchObject({ home: 18, score: 18, color: 'rouge' });
    const tirage = session('t', 26, [p('tirage-vertical', [10, 10, 10], 40)]);
    const curlHome = session('c', 28, [p('curl-biceps-halteres', Array(6).fill(10), 8)], true);
    expect(cellOf([tirage, curlHome], 'biceps')).toMatchObject({ count: 0, indirect: 1, home: 6, score: 7.5, color: 'orange' });
    const curlGym = session('cg', 27, [p('curl-biceps-halteres', [10, 10, 10], 12)]);
    expect(cellOf([tirage, curlGym, curlHome], 'biceps')).toMatchObject({ count: 1, indirect: 1, home: 6, score: 10.5, color: 'rouge' });
    const chest = session('cp', 26, [p('chest-press', [10, 10, 10], 50)]);
    expect(cellOf([chest, session('m', 28, [pompes(2)], true)], 'pectoraux')).toMatchObject({ count: 1, home: 2, score: 5, color: 'orange' });

    const empty = (variantId: string): Performance => ({ ...p(variantId, []), plannedSets: 3 });
    const withEmpty = [
      session('g', 27, [p('chest-press', [10, 10, 10], 50), empty('crunch-machine'), empty('tirage-vertical')]),
      session('h', 28, [pompes(2), { ...empty('planche'), targetReps: 20 }], true),
    ];
    const recap = weeklyRecap(withEmpty, LIB, NOW, RECAP);
    expect(recap.cells.find((c) => c.group === 'abdominaux')).toEqual({ group: 'abdominaux', count: 0, indirect: 0, activities: [], score: 0, color: 'vert', recency: null });
    expect(recap.cells.find((c) => c.group === 'dos')).toMatchObject({ count: 0, score: 0 });
    expect(recap.cells.find((c) => c.group === 'biceps')).toMatchObject({ indirect: 0, score: 0 });
    const report = buildReport(periodContaining('week', NOW), {
      sessions: withEmpty, exercises: LIB, evaluations: rebuildProfile(withEmpty, settings).evaluations, settings, groups: GROUPS, weighIns: [], now: NOW,
    });
    expect(report.groups.filter((g) => g.count > 0 || g.indirect > 0 || g.home)).toEqual([
      { group: 'pectoraux', count: 1, indirect: 0, home: 2, sets: 5 },
      { group: 'epaules', count: 0, indirect: 1, sets: 2.5 },
      { group: 'triceps', count: 0, indirect: 1, sets: 2.5 },
    ]);
    const text = reportText(report, (id) => displayName(indexVariants(LIB).get(id)));
    expect(text).toContain('- Pectoraux : 5 séries (1 séance, +2 séries maison)');
    expect(text).toContain('- Épaules : 2,5 séries (+1 indirect)');
    expect(text).toContain('- Non travaillés : Dos, Biceps, Jambes, Abdominaux');
    const partial: Performance = { variantId: 'tirage-vertical', weightKg: 40, targetReps: null, plannedSets: null, reps: [], feeling: 'inconnu', partial: true };
    // Performance partielle importée (poids sans répétitions) : comptée comme séance (« hier » / « aujourd'hui »,
    // tableau des bilans), mais sans série (version 1.45.0) : score 0, comme le graphique « Séries par semaine ».
    expect(cellOf([session('i', 27, [partial])], 'dos')).toMatchObject({ count: 1, score: 0, color: 'vert' });
  });
});
