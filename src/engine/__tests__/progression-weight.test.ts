import { describe, expect, it } from 'vitest';
import { DEFAULT_VARIANT_CONFIG } from '../config';
import { expectedTarget } from '../progression';
import { finalState, green, incomplete, orange, red, replay } from './helpers';

const cfg = DEFAULT_VARIANT_CONFIG;
const TWO_GREEN_12 = [green(45, 12), green(45, 12)];

describe('§15 Progression et réduction du poids', () => {
  it('14. Une seule séance verte à 3×12 ne permet pas d’augmenter le poids', () => {
    const s = finalState([green(45, 11), green(45, 11), green(45, 12)]);
    expect(s.greenStreak).toBe(1);
    expect(s.recommendation).toEqual({ kind: 'keep', targetReps: 12, plannedSets: 3 });
  });

  it('15. Deux séances vertes consécutives à 3×12 recommandent « poids supérieur », sans valeur', () => {
    const s = finalState(TWO_GREEN_12);
    expect(s.recommendation).toEqual({ kind: 'weight_up', targetReps: 8, plannedSets: 3 });
    expect(Object.keys(s.recommendation).sort()).toEqual(['kind', 'plannedSets', 'targetReps']);
    expect(s.palier.weightKg).toBe(45); // aucun poids cible inventé
  });

  it('16. Une séance orange ou rouge à 3×12 ne compte pas', () => {
    expect(finalState([green(45, 12), orange(45, 12)]).recommendation.kind).toBe('keep');
    expect(finalState([green(45, 12), red(45, 12)]).recommendation.kind).toBe('keep');
    expect(finalState([green(45, 12), orange(45, 12), green(45, 12)]).recommendation.kind).toBe('keep');
    const r = replay([orange(45, 12), red(45, 12)]);
    expect(r.evaluations.some((e) => e.validation)).toBe(false);
  });

  it('17. L’historique de l’ancienne charge reste conservé', () => {
    const result = replay([...TWO_GREEN_12, green(50, 8)]);
    expect(result.evaluations.map((e) => e.palier.weightKg)).toEqual([45, 45, 50]);
    expect(result.evaluations[0]?.status).toBe('vert');
    expect(result.profile.variants['tirage-vertical']?.palier).toEqual({ weightKg: 50, targetReps: 8 });
  });

  it('18. Une charge supérieure donne une cible 3×8 et des compteurs à zéro', () => {
    const before = finalState([red(45, 12), red(45, 12), green(45, 12), green(45, 12)]);
    expect(expectedTarget(before, 50, cfg)).toBe(8);
    // Une charge supérieure non recommandée donne aussi 3×8.
    expect(expectedTarget(finalState([green(45, 11)]), 50, cfg)).toBe(8);

    const afterOrange = finalState([red(45, 12), red(45, 12), ...TWO_GREEN_12, orange(50, 8)]);
    expect(afterOrange.palier).toEqual({ weightKg: 50, targetReps: 8 });
    expect(afterOrange.greenStreak).toBe(0);
    expect(afterOrange.redStreak).toBe(0);

    // Au nouveau palier, la première séance verte compte 1 (et non 3).
    const afterGreen = finalState([...TWO_GREEN_12, green(50, 8)]);
    expect(afterGreen.greenStreak).toBe(1);
    expect(afterGreen.recommendation.kind).toBe('keep');
  });

  it('19. Charge identique malgré la recommandation : palier inchangé, recommandation active', () => {
    const result = replay([...TWO_GREEN_12, green(45, 12)]);
    const last = result.evaluations.at(-1);
    expect(last?.decision).toBe('refusal');
    expect(last?.validation).toBe(false);
    expect(last?.palier).toEqual({ weightKg: 45, targetReps: 12 });
    expect(last?.recommendation.kind).toBe('weight_up');
  });

  it('20. Trois séances rouges consécutives : aucune baisse, charge et cible conservées', () => {
    const s = finalState([red(45, 10), red(45, 10), red(45, 10)]);
    expect(s.redStreak).toBe(3);
    expect(s.palier).toEqual({ weightKg: 45, targetReps: 10 });
    expect(s.recommendation).toEqual({ kind: 'keep', targetReps: 10, plannedSets: 3 });
  });

  it('21. Quatre rouges recommandent « poids inférieur » ; une charge inférieure conserve la cible', () => {
    const reds = [red(45, 10), red(45, 10), red(45, 10), red(45, 10)];
    const s = finalState(reds);
    expect(s.recommendation).toEqual({ kind: 'weight_down', targetReps: 10, plannedSets: 3 });
    expect(expectedTarget(s, 40, cfg)).toBe(10);

    const result = replay([...reds, green(40, 10)]);
    const last = result.evaluations.at(-1);
    expect(last?.decision).toBe('follow');
    expect(last?.standard).toBe(true);
    expect(last?.palier).toEqual({ weightKg: 40, targetReps: 10 });
    expect(last?.redStreak).toBe(0);
    expect(last?.greenStreak).toBe(1);
  });

  it('22. Rouge, rouge, rouge, orange, rouge : pas de baisse', () => {
    const s = finalState([red(45, 10), red(45, 10), red(45, 10), orange(45, 10), red(45, 10)]);
    expect(s.redStreak).toBe(1);
    expect(s.recommendation.kind).toBe('keep');
  });

  it('23. Une séance incomplète entre deux rouges ne remet pas à zéro et n’incrémente pas', () => {
    const s = finalState([red(45, 10), red(45, 10), incomplete(45, 10), red(45, 10)]);
    expect(s.redStreak).toBe(3);
    expect(s.recommendation.kind).toBe('keep');
    const s2 = finalState([red(45, 10), red(45, 10), incomplete(45, 10), red(45, 10), red(45, 10)]);
    expect(s2.redStreak).toBe(4);
    expect(s2.recommendation.kind).toBe('weight_down');
  });
});
