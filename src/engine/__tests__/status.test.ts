import { describe, expect, it } from 'vitest';
import type { Feeling } from '../../domain/types';
import { clampReps, computeStatus, validatePerformance, type EvaluablePerformance } from '../status';
import { finalState, perf, replay } from './helpers';

const ALL_FEELINGS: Feeling[] = ['tres_mal', 'mal', 'moyen', 'bien', 'tres_bien', 'inconnu'];
const status = (reps: number[], feeling: Feeling, target = 8, plannedSets = 3) =>
  computeStatus(perf(45, target, reps, feeling, { plannedSets }) as EvaluablePerformance);

describe('§15 Calcul du statut', () => {
  it('1. 8-8-8 à la cible 8, « Bien passé » ou « Très bien passé » : vert', () => {
    expect(status([8, 8, 8], 'bien')).toBe('vert');
    expect(status([8, 8, 8], 'tres_bien')).toBe('vert');
  });

  it('2. 8-8-8 à la cible 8, « Moyen », « Mal passé » ou « Inconnu » : orange', () => {
    expect(status([8, 8, 8], 'moyen')).toBe('orange');
    expect(status([8, 8, 8], 'mal')).toBe('orange');
    expect(status([8, 8, 8], 'inconnu')).toBe('orange');
  });

  it('3. 8-8-7 avec « Très bien passé » : orange', () => {
    expect(status([8, 8, 7], 'tres_bien')).toBe('orange');
  });

  it('4. 8-7-7 avec n’importe quel ressenti : rouge', () => {
    for (const f of ALL_FEELINGS) expect(status([8, 7, 7], f)).toBe('rouge');
    for (const f of ALL_FEELINGS) expect(status([5, 5, 5], f)).toBe('rouge');
  });

  it('5. 8-8-8 avec « Très mal passé » : rouge', () => {
    expect(status([8, 8, 8], 'tres_mal')).toBe('rouge');
  });

  it('6. Deux séries sur trois enregistrées : orange, quelle que soit la performance', () => {
    for (const f of ALL_FEELINGS) {
      expect(status([8, 8], f)).toBe('orange');
      expect(status([6, 5], f)).toBe('orange');
      expect(status([], f)).toBe('orange');
    }
  });

  it('7. Les répétitions ne peuvent pas dépasser la cible', () => {
    // Saisie : le « + » est bloqué à la cible.
    expect(clampReps(9, 8)).toBe(8);
    expect(clampReps(12, 8)).toBe(8);
    expect(clampReps(-1, 8)).toBe(0);
    expect(clampReps(7, 8)).toBe(7);
    // Donnée : une performance au-dessus de la cible est invalide…
    const over = perf(45, 8, [9, 8, 8], 'tres_bien');
    expect(validatePerformance(over)).toContain('reps_above_target');
    // … et le moteur refuse de la compter.
    const result = replay([over]);
    expect(result.evaluations).toHaveLength(0);
    expect(result.ignored[0]?.reasons).toContain('reps_above_target');
    expect(result.profile.variants).toEqual({});
  });

  it('Poids nul, négatif ou non numérique refusé', () => {
    expect(validatePerformance(perf(0, 8, [8, 8, 8], 'bien'))).toContain('invalid_weight');
    expect(validatePerformance(perf(-5, 8, [8, 8, 8], 'bien'))).toContain('invalid_weight');
    expect(validatePerformance(perf(Number.NaN, 8, [8, 8, 8], 'bien'))).toContain('invalid_weight');
    expect(validatePerformance(perf(52.5, 8, [8, 8, 8], 'bien'))).toEqual([]);
  });

  it('La couleur de l’exercice est celle de sa dernière performance', () => {
    expect(finalState([perf(45, 8, [8, 8, 8], 'bien'), perf(45, 8, [8, 7, 7], 'bien')]).lastStatus).toBe(
      'rouge',
    );
  });
});
