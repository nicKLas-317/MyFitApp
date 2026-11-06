import { describe, expect, it } from 'vitest';
import type { Feeling } from '../../domain/types';
import { DEFAULT_VARIANT_CONFIG, type EngineSettings } from '../config';
import { neutralForReds } from '../progression';
import { perf, replay, V } from './helpers';

const F = (w: number, t: number, reps: number[], feeling: Feeling) => perf(w, t, reps, feeling);
const reds = (steps: ReturnType<typeof F>[], settings?: EngineSettings) => replay(steps, settings).evaluations.map((e) => e.redStreak);
const downs = (steps: ReturnType<typeof F>[], settings?: EngineSettings) =>
  replay(steps, settings).evaluations.map((e) => e.recommendation.kind === 'weight_down' || e.recommendation.kind === 'reps_down');

/** Séquences fictives de la simulation du 6 novembre 2026 (B1 retenue), au même poids. */
const SEQ = {
  alternance: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => F(12, 8, [8, 8, 8], i % 2 ? 'mal' : 'tres_mal')),
  mal6: [1, 2, 3, 4, 5, 6].map(() => F(12, 8, [8, 8, 8], 'mal')),
  tresMal2Mal4: [F(12, 8, [8, 8, 8], 'tres_mal'), F(12, 8, [8, 8, 8], 'tres_mal'), ...[1, 2, 3, 4].map(() => F(12, 8, [8, 8, 8], 'mal'))],
  curl: [F(12, 8, [8, 8, 8], 'mal'), F(12, 8, [8, 8, 8], 'tres_mal'), F(12, 8, [8, 8, 6], 'mal'), F(12, 8, [8, 8, 8], 'tres_mal'), F(12, 8, [8, 8, 8], 'mal')],
  mauvaisePasse: [
    F(30, 9, [9, 9, 9], 'bien'), F(30, 9, [9, 9, 8], 'mal'), F(30, 9, [9, 8, 8], 'moyen'), F(30, 9, [9, 9, 9], 'tres_mal'),
    F(30, 9, [9, 9, 8], 'mal'), F(30, 9, [9, 9, 9], 'moyen'), F(30, 9, [9, 9, 9], 'bien'), F(30, 9, [9, 9, 9], 'bien'),
  ],
  malade: [F(30, 9, [9, 8, 8], 'mal'), F(30, 9, [9, 9, 9], 'tres_mal'), F(30, 9, [9, 9, 8], 'mal'), F(30, 9, [9, 9, 9], 'mal'), F(30, 9, [9, 9, 9], 'bien')],
  debutant: [
    F(20, 8, [8, 8, 7], 'bien'), F(20, 8, [8, 8, 8], 'bien'), F(20, 8, [8, 8, 8], 'bien'), F(20, 9, [9, 9, 8], 'bien'),
    F(20, 9, [9, 9, 9], 'moyen'), F(20, 9, [9, 9, 8], 'mal'), F(20, 9, [9, 9, 9], 'bien'), F(20, 9, [9, 9, 9], 'bien'),
    F(20, 10, [10, 10, 9], 'bien'), F(20, 10, [10, 9, 9], 'moyen'), F(20, 10, [10, 10, 9], 'mal'), F(20, 10, [10, 10, 10], 'bien'),
  ],
  debutantBloque: [
    F(20, 10, [10, 10, 9], 'bien'), F(20, 10, [10, 9, 9], 'bien'), F(20, 10, [10, 10, 9], 'mal'), F(20, 10, [10, 9, 9], 'moyen'),
    F(20, 10, [10, 10, 9], 'mal'), F(20, 10, [10, 10, 10], 'bien'),
  ],
  oubli: [F(40, 8, [8, 8, 8], 'inconnu'), F(40, 8, [8, 7, 7], 'bien'), F(40, 8, [8, 8, 7], 'inconnu'), F(40, 8, [8, 7, 7], 'moyen'), F(40, 8, [8, 8, 8], 'bien')],
};

describe('Séance « Mal passé » neutre pour le compteur de rouges (version 1.42.0, §7.8)', () => {
  it('302. Alternance Mal / Très mal : la baisse est proposée à la 4ᵉ rouge (8ᵉ séance) ; avant, jamais', () => {
    expect(reds(SEQ.alternance)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
    expect(downs(SEQ.alternance)).toEqual([false, false, false, false, false, false, false, true]);
    // Le cas de l'utilisateur (curl incliné) : la séance 8-8-6 « Mal » n'efface plus la rouge d'avant.
    expect(reds(SEQ.curl)).toEqual([0, 1, 1, 2, 2]);
  });

  it('302. Pas de baisse injustifiée : Mal ×6, Très mal ×2 puis Mal, mauvaise passe, malade une semaine, débutant, ressenti oublié', () => {
    expect(reds(SEQ.mal6)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(reds(SEQ.tresMal2Mal4)).toEqual([1, 2, 2, 2, 2, 2]);
    expect(reds(SEQ.mauvaisePasse)).toEqual([0, 0, 1, 2, 2, 0, 0, 0]);
    expect(reds(SEQ.malade)).toEqual([1, 2, 2, 2, 0]);
    expect(Math.max(...reds(SEQ.debutant))).toBe(1);
    expect(reds(SEQ.debutantBloque)).toEqual([0, 1, 1, 2, 2, 0]);
    // « Moyen » et un ressenti oublié remettent toujours le compteur à 0.
    expect(reds(SEQ.oubli)).toEqual([0, 1, 0, 1, 0]);
    for (const seq of [SEQ.mal6, SEQ.tresMal2Mal4, SEQ.mauvaisePasse, SEQ.malade, SEQ.debutant, SEQ.debutantBloque, SEQ.oubli]) {
      expect(downs(seq).some(Boolean)).toBe(false);
    }
  });

  it('302. Neutre seulement pour une séance orange « Mal » : une rouge compte, une verte ou une autre orange remet à 0, un changement de poids aussi', () => {
    expect(neutralForReds('orange', { feeling: 'mal' })).toBe(true);
    expect(neutralForReds('orange', { feeling: 'moyen' })).toBe(false);
    expect(neutralForReds('orange', { feeling: 'inconnu' })).toBe(false);
    expect(neutralForReds('rouge', { feeling: 'mal' })).toBe(false);
    expect(neutralForReds('vert', { feeling: 'bien' })).toBe(false);
    // 8-7-7 « Mal » reste rouge (deux séries sous la cible) et compte.
    expect(reds([F(12, 8, [8, 8, 8], 'tres_mal'), F(12, 8, [8, 7, 7], 'mal')])).toEqual([1, 2]);
    // Nouveau poids : le compteur repart (0 pour une séance « Mal »).
    expect(reds([F(12, 8, [8, 8, 8], 'tres_mal'), F(12, 8, [8, 8, 8], 'tres_mal'), F(10, 8, [8, 8, 8], 'mal')])).toEqual([1, 2, 0]);
  });

  it('302. Baisse déjà proposée (§7.11 D) : une séance « Mal » au même palier la laisse, une séance « Moyen » ou verte la retire, une rouge la maintient', () => {
    const four = [1, 2, 3, 4].map(() => F(12, 8, [8, 8, 8], 'tres_mal'));
    const after = (next: ReturnType<typeof F>) => replay([...four, next]).evaluations.at(-1)!;
    expect(replay(four).evaluations.at(-1)!.recommendation.kind).toBe('weight_down');
    expect(after(F(12, 8, [8, 8, 8], 'mal'))).toMatchObject({ decision: 'refusal', redStreak: 4, recommendation: { kind: 'weight_down' } });
    expect(after(F(12, 8, [8, 8, 7], 'mal')).recommendation.kind).toBe('weight_down');
    expect(after(F(12, 8, [8, 8, 8], 'moyen'))).toMatchObject({ redStreak: 0, recommendation: { kind: 'keep' } });
    expect(after(F(12, 8, [8, 8, 8], 'bien'))).toMatchObject({ redStreak: 0, recommendation: { kind: 'keep' } });
    expect(after(F(12, 8, [8, 8, 8], 'tres_mal'))).toMatchObject({ redStreak: 5, recommendation: { kind: 'weight_down' } });
  });

  it('302. Même règle au poids du corps : « Mal » neutre, la cible −1 arrive à la 4ᵉ rouge', () => {
    const BW: EngineSettings = { defaults: DEFAULT_VARIANT_CONFIG, overrides: { [V]: { bodyweight: true } } };
    const seq = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => F(0, 20, [20, 20, 20], i % 2 ? 'mal' : 'tres_mal'));
    expect(reds(seq, BW)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
    expect(replay(seq, BW).evaluations.at(-1)!.recommendation).toMatchObject({ kind: 'reps_down', targetReps: 19 });
  });
});
