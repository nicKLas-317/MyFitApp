import { describe, expect, it } from 'vitest';
import { checkWeight } from '../../session/ops';
import { DEFAULT_VARIANT_CONFIG, type EngineSettings } from '../config';
import { expectedTarget } from '../progression';
import { finalState, green, red, replay, V } from './helpers';

/** Dips assistés : la charge saisie est une aide (§7.12). */
const ASSISTED: EngineSettings = { defaults: DEFAULT_VARIANT_CONFIG, overrides: { [V]: { assisted: true } } };
const cfg = { ...DEFAULT_VARIANT_CONFIG, assisted: true };

describe('§7.12 Exercices assistés : sens de la charge inversé', () => {
  it('81. Deux validations à 3×12 recommandent « moins d’aide » ; une aide plus basse suivie revient à 3×8 et valide', () => {
    const before = finalState([green(23, 12), green(23, 12)], V, ASSISTED);
    expect(before.recommendation).toEqual({ kind: 'weight_up', targetReps: 8, plannedSets: 3 });
    // Moins d'aide = charge plus basse : c'est la charge « plus difficile ».
    expect(expectedTarget(before, 18, cfg)).toBe(8);
    expect(expectedTarget(before, 30, cfg)).toBe(12);

    const r = replay([green(23, 12), green(23, 12), green(18, 8)], ASSISTED);
    expect(r.evaluations[2]).toMatchObject({ decision: 'follow', standard: true, validation: true, greenStreak: 1 });
    expect(r.profile.variants[V]?.palier).toEqual({ weightKg: 18, targetReps: 8 });
  });

  it('82. Une aide plus haute après « poids supérieur » recommandé n’est pas la charge recommandée (non standard)', () => {
    const r = replay([green(23, 12), green(23, 12), green(30, 8)], ASSISTED);
    expect(r.evaluations[2]).toMatchObject({ decision: 'manual_weight', standard: false, validation: false, greenStreak: 0 });
  });

  it('83. Quatre rouges recommandent « plus d’aide » ; une aide plus haute conserve la cible et compte normalement', () => {
    const reds = [red(23, 10), red(23, 10), red(23, 10), red(23, 10)];
    const before = finalState(reds, V, ASSISTED);
    expect(before.recommendation).toEqual({ kind: 'weight_down', targetReps: 10, plannedSets: 3 });
    expect(expectedTarget(before, 28, cfg)).toBe(10);
    const r = replay([...reds, green(28, 10)], ASSISTED);
    expect(r.evaluations[4]).toMatchObject({ decision: 'follow', standard: true, validation: true, redStreak: 0 });
    // Moins d'aide sans recommandation : changement de charge non recommandé (§7.11 B).
    const manual = replay([...reds, green(18, 8)], ASSISTED);
    expect(manual.evaluations[4]).toMatchObject({ decision: 'manual_weight', standard: false });
  });

  it('84. La protection contre les fautes de frappe s’applique normalement ; un exercice non assisté garde le sens habituel', () => {
    expect(checkWeight('230', 23)).toEqual({ kind: 'confirm', value: 230, previous: 23 });
    expect(checkWeight('2', 23)).toEqual({ kind: 'confirm', value: 2, previous: 23 });
    expect(checkWeight('20', 23)).toEqual({ kind: 'ok', value: 20 });
    const normal = replay([green(23, 12), green(23, 12), green(18, 8)]);
    expect(normal.evaluations[2]).toMatchObject({ decision: 'manual_weight', standard: false });
  });
});
