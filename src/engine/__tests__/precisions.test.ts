import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE_SETTINGS, type EngineSettings } from '../config';
import { finalState, green, incomplete, orange, partial, perf, red, replay, V } from './helpers';

const last = (steps: Parameters<typeof replay>[0], settings?: EngineSettings) =>
  replay(steps, settings).evaluations.at(-1);

const TWO_GREEN_8 = [green(45, 8), green(45, 8)];
const TWO_GREEN_12 = [green(45, 12), green(45, 12)];
const FOUR_RED_10 = [red(45, 10), red(45, 10), red(45, 10), red(45, 10)];

describe('§15 Précisions validées (§7.11)', () => {
  it('63. (A, B) Charge supérieure non recommandée : ne valide pas ; recommandée : valide', () => {
    const manual = replay([green(45, 8), green(50, 8), green(50, 8), green(50, 8)]);
    expect(manual.evaluations.map((e) => [e.decision, e.validation, e.greenStreak])).toEqual([
      ['first', true, 1],
      ['manual_weight', false, 0],
      ['follow', true, 1],
      ['follow', true, 2],
    ]);
    expect(manual.profile.variants[V]?.recommendation.kind).toBe('reps_up');

    // Charge inférieure non recommandée : également manuelle.
    expect(last([green(45, 8), green(40, 8)])?.decision).toBe('manual_weight');

    const recommended = last([...TWO_GREEN_12, green(50, 8)]);
    expect(recommended?.decision).toBe('follow');
    expect(recommended?.validation).toBe(true);
    expect(recommended?.greenStreak).toBe(1);

    // Charge supérieure recommandée mais cible ≠ 8 : non standard.
    expect(last([...TWO_GREEN_12, green(50, 10)])?.decision).toBe('manual_target');
  });

  it('64. (C) Cible différente de l’actuelle et de la recommandée : nouveau palier, compteur à 0', () => {
    const result = replay([green(45, 8), green(45, 10), green(45, 10)]);
    expect(result.evaluations[1]).toMatchObject({
      decision: 'manual_target',
      validation: false,
      greenStreak: 0,
      palier: { weightKg: 45, targetReps: 10 },
    });
    expect(result.evaluations[2]).toMatchObject({ decision: 'follow', validation: true, greenStreak: 1 });

    // Avec +1 recommandé (cible 9), choisir 11 est aussi un palier manuel.
    expect(last([...TWO_GREEN_8, green(45, 11)])).toMatchObject({
      decision: 'manual_target',
      palier: { weightKg: 45, targetReps: 11 },
      greenStreak: 0,
    });
  });

  it('65. (C/D) Garder la cible actuelle alors que +1 est recommandé est un refus', () => {
    const refusedGreen = last([...TWO_GREEN_8, green(45, 8)]);
    expect(refusedGreen).toMatchObject({
      decision: 'refusal',
      validation: false,
      palier: { weightKg: 45, targetReps: 8 },
      greenStreak: 2,
      recommendation: { kind: 'reps_up', targetReps: 9 },
    });
    // Refus répété : toujours actif.
    expect(last([...TWO_GREEN_8, green(45, 8), green(45, 8)])?.recommendation.kind).toBe('reps_up');

    for (const bad of [orange(45, 8), red(45, 8)]) {
      expect(last([...TWO_GREEN_8, bad])).toMatchObject({
        decision: 'refusal',
        greenStreak: 0,
        recommendation: { kind: 'keep', targetReps: 8 },
      });
    }
  });

  it('66. (D) Refus de « poids supérieur » : verte maintient, orange ou rouge retire', () => {
    expect(last([...TWO_GREEN_12, green(45, 12)])?.recommendation.kind).toBe('weight_up');
    expect(last([...TWO_GREEN_12, green(45, 12), green(45, 12)])?.recommendation.kind).toBe('weight_up');
    expect(last([...TWO_GREEN_12, orange(45, 12)])?.recommendation).toEqual({
      kind: 'keep',
      targetReps: 12,
      plannedSets: 3,
    });
    expect(last([...TWO_GREEN_12, red(45, 12)])?.recommendation.kind).toBe('keep');
  });

  it('67. (D) Refus de « poids inférieur » : rouge maintient, verte ou orange complète retire', () => {
    const again = last([...FOUR_RED_10, red(45, 10)]);
    expect(again).toMatchObject({ decision: 'refusal', redStreak: 5, recommendation: { kind: 'weight_down' } });

    expect(last([...FOUR_RED_10, green(45, 10)])).toMatchObject({
      redStreak: 0,
      recommendation: { kind: 'keep', targetReps: 10 },
    });
    expect(last([...FOUR_RED_10, orange(45, 10)])?.recommendation.kind).toBe('keep');
    // Une séance incomplète (orange) ne touche pas au compteur de rouges (F).
    expect(last([...FOUR_RED_10, incomplete(45, 10)])).toMatchObject({
      redStreak: 4,
      recommendation: { kind: 'weight_down' },
    });
  });

  it('68. (E) Compteur de rouges : rouges non standard comptées, cible ignorée, poids décisif', () => {
    const fourSetsRed = perf(45, 10, [10, 9, 9, 9], 'moyen', { plannedSets: 4 });
    const s = finalState([red(45, 10), red(45, 11), fourSetsRed, red(45, 9)]);
    expect(s.redStreak).toBe(4);
    expect(s.recommendation.kind).toBe('weight_down');

    // Changement de poids : remise à 0, la rouge au nouveau poids compte 1.
    const moved = finalState([red(45, 10), red(45, 10), red(45, 10), red(42.5, 10)]);
    expect(moved.redStreak).toBe(1);
    expect(moved.recommendation.kind).toBe('keep');
  });

  it('69. (F) Incomplète au palier actuel : validations à 0, rouges inchangées', () => {
    expect(last([green(45, 8), incomplete(45, 8)])).toMatchObject({ status: 'orange', greenStreak: 0 });
    expect(finalState([green(45, 8), incomplete(45, 8), green(45, 8)]).recommendation.kind).toBe('keep');
    expect(last([red(45, 8), red(45, 8), incomplete(45, 8)])).toMatchObject({ redStreak: 2, greenStreak: 0 });
  });

  it('70. (G) Première performance : 3×9 compte, hors plage ne valide pas', () => {
    // Exemple : « Lat pulldown vertical 3×9×36 kgs », ici avec un bon ressenti.
    const first = replay([perf(36, 9, [9, 9, 9], 'tres_bien'), perf(36, 9, [9, 9, 9], 'bien')]);
    expect(first.evaluations.map((e) => [e.decision, e.validation])).toEqual([
      ['first', true],
      ['follow', true],
    ]);
    expect(first.profile.variants[V]?.recommendation).toMatchObject({ kind: 'reps_up', targetReps: 10 });

    // Tel qu'importé (« -= ») : orange, ne valide pas.
    expect(last([perf(36, 9, [9, 9, 9], 'mal')])).toMatchObject({ status: 'orange', validation: false });

    expect(last([green(40, 6)])).toMatchObject({ decision: 'first', standard: false, validation: false });
    expect(last([green(40, 13)])?.validation).toBe(false);
    expect(last([perf(40, 8, [8, 8, 8, 8], 'bien', { plannedSets: 4 })])?.validation).toBe(false);
  });

  it('71. (H) Performance partielle : aucun statut, palier et compteurs inchangés', () => {
    const result = replay([green(45, 8), partial(60), green(45, 8)]);
    expect(result.evaluations).toHaveLength(2);
    expect(result.ignored).toEqual([{ sessionId: 's2', variantId: V, reasons: ['partial'] }]);
    expect(result.profile.variants[V]).toMatchObject({
      palier: { weightKg: 45, targetReps: 8 },
      greenStreak: 2,
      recommendation: { kind: 'reps_up' },
    });

    // Le marqueur « partiel » suffit, même si une cible et des séries sont renseignées.
    const flagged = { ...red(45, 8), partial: true };
    expect(replay([green(45, 8), flagged, green(45, 8)]).profile.variants[V]?.greenStreak).toBe(2);

    // Exercice uniquement connu par un historique partiel : pas d'état, donc pas de pastille.
    const onlyPartial = replay([partial(60)]);
    expect(onlyPartial.profile.variants[V]).toBeUndefined();
    expect(onlyPartial.ignored).toHaveLength(1);
  });

  it('72. (I) Cible manuelle au-dessus de 12 : poids supérieur, jamais au-delà de 12', () => {
    const s = finalState([green(45, 12), green(45, 13), green(45, 13), green(45, 13)]);
    expect(s.palier.targetReps).toBe(13);
    expect(s.recommendation).toEqual({ kind: 'weight_up', targetReps: 8, plannedSets: 3 });

    // Sous la borne basse, la progression +1 s'applique.
    expect(finalState([green(45, 8), green(45, 6), green(45, 6), green(45, 6)]).recommendation).toMatchObject({
      kind: 'reps_up',
      targetReps: 7,
    });

    // Une plage spécifique est respectée.
    const settings: EngineSettings = { ...DEFAULT_ENGINE_SETTINGS, overrides: { [V]: { maxReps: 15 } } };
    expect(finalState(TWO_GREEN_12, V, settings).recommendation).toMatchObject({ kind: 'reps_up', targetReps: 13 });
  });

  it('73. (J) 52,5 kg et 52.50 kg sont le même poids', () => {
    const s = replay([green(52.5, 8), green(52.5, 8), green(52.50000001, 9)]);
    expect(s.evaluations.at(-1)).toMatchObject({ decision: 'follow', validation: true, greenStreak: 1 });
    // 0,01 kg d'écart est un autre poids.
    expect(last([green(52.5, 8), green(52.51, 8)])?.decision).toBe('manual_weight');
  });
});
