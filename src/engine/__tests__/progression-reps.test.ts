import { describe, expect, it } from 'vitest';
import { finalState, green, history, orange, perf, red, replay, deepFreeze } from './helpers';
import { rebuildProfile } from '../replay';
import { DEFAULT_ENGINE_SETTINGS } from '../config';

describe('§15 Progression des répétitions', () => {
  it('8. Une première séance verte à 3×8 ne déclenche pas de progression', () => {
    const s = finalState([green(45, 8)]);
    expect(s.greenStreak).toBe(1);
    expect(s.recommendation).toEqual({ kind: 'keep', targetReps: 8, plannedSets: 3 });
  });

  it('9. Une deuxième séance verte distincte et consécutive à 3×8 propose 3×9', () => {
    const result = replay([green(45, 8), perf(45, 8, [8, 8, 8], 'tres_bien')]);
    expect(result.evaluations.map((e) => [e.sessionId, e.validation])).toEqual([
      ['s1', true],
      ['s2', true],
    ]);
    const s = result.profile.variants['tirage-vertical'];
    expect(s?.palier).toEqual({ weightKg: 45, targetReps: 8 });
    expect(s?.recommendation).toEqual({ kind: 'reps_up', targetReps: 9, plannedSets: 3 });
  });

  it('10. Une seule séance verte à 3×9 ne déclenche pas 3×10', () => {
    const s = finalState([green(45, 8), green(45, 8), green(45, 9)]);
    expect(s.palier).toEqual({ weightKg: 45, targetReps: 9 });
    expect(s.greenStreak).toBe(1);
    expect(s.recommendation.kind).toBe('keep');
    expect(s.recommendation.targetReps).toBe(9);
  });

  it('11. Vert, orange, vert au même palier : pas de progression', () => {
    const s = finalState([green(45, 8), orange(45, 8), green(45, 8)]);
    expect(s.greenStreak).toBe(1);
    expect(s.recommendation).toEqual({ kind: 'keep', targetReps: 8, plannedSets: 3 });
  });

  it('12. Une mauvaise séance ne supprime pas l’historique', () => {
    const sessions = deepFreeze(history([green(45, 8), green(45, 8), red(45, 9)]));
    const snapshot = structuredClone(sessions);
    const result = rebuildProfile(sessions, DEFAULT_ENGINE_SETTINGS);
    expect(sessions).toEqual(snapshot);
    expect(result.evaluations).toHaveLength(3);
    expect(result.evaluations.map((e) => e.status)).toEqual(['vert', 'vert', 'rouge']);
    // Seul le compteur est remis à zéro ; le palier atteint est conservé.
    const s = result.profile.variants['tirage-vertical'];
    expect(s?.greenStreak).toBe(0);
    expect(s?.palier).toEqual({ weightKg: 45, targetReps: 9 });
  });

  it('13. Des répétitions insuffisantes ne valident pas, même avec « Très bien passé »', () => {
    const result = replay([perf(45, 8, [8, 8, 7], 'tres_bien'), perf(45, 8, [8, 8, 7], 'tres_bien')]);
    expect(result.evaluations.every((e) => !e.validation)).toBe(true);
    expect(result.profile.variants['tirage-vertical']?.recommendation.kind).toBe('keep');
  });

  it('Tableau d’exemple du §7.5 rejoué ligne à ligne', () => {
    const result = replay([
      perf(45, 8, [8, 8, 8], 'bien'),
      perf(45, 8, [8, 8, 8], 'tres_bien'),
      perf(45, 9, [9, 9, 9], 'bien'),
      perf(45, 9, [9, 9, 9], 'moyen'),
      perf(45, 9, [9, 9, 9], 'bien'),
      perf(45, 9, [9, 9, 9], 'bien'),
    ]);
    expect(
      result.evaluations.map((e) => [e.status, e.greenStreak, e.recommendation.kind, e.recommendation.targetReps]),
    ).toEqual([
      ['vert', 1, 'keep', 8],
      ['vert', 2, 'reps_up', 9],
      ['vert', 1, 'keep', 9],
      ['orange', 0, 'keep', 9],
      ['vert', 1, 'keep', 9],
      ['vert', 2, 'reps_up', 10],
    ]);
  });

  it('Cycle complet 3×8 → 3×12 → poids supérieur', () => {
    const steps = [8, 8, 9, 9, 10, 10, 11, 11, 12, 12].map((t) => green(45, t));
    const result = replay(steps);
    expect(result.evaluations.every((e) => e.validation)).toBe(true);
    expect(result.profile.variants['tirage-vertical']?.recommendation).toEqual({
      kind: 'weight_up',
      targetReps: 8,
      plannedSets: 3,
    });
  });
});
