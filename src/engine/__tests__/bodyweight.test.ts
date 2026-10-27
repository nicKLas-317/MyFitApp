import { describe, expect, it } from 'vitest';
import type { Exercise, Session } from '../../domain/types';
import { buildReport, periodContaining, reportText } from '../../analysis/report';
import { computeRecords, formatRecord } from '../../analysis/records';
import { correctPerformance } from '../../history/ops';
import { compactConfig } from '../../library/edit';
import { buildEngineSettings, displayName, indexVariants } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { addExercise, newPerformance, recordRemainingSets, setFeeling, startSession } from '../../session/ops';
import { markerLabel } from '../../ui/labels';
import { cardHint, recommendedTarget } from '../../ui/TargetSummary';
import { DEFAULT_VARIANT_CONFIG, resolveConfig, type EngineSettings } from '../config';
import { progressMarker } from '../marker';
import { rebuildProfile } from '../replay';
import { expectedTarget } from '../progression';
import { validatePerformance } from '../status';
import { finalState, green, history, orange, perf, red, replay, V } from './helpers';

/** Crunch au sol : poids du corps, plage par défaut 10 à 40 (version 1.24.0). */
const BW: EngineSettings = { defaults: DEFAULT_VARIANT_CONFIG, overrides: { [V]: { bodyweight: true } } };
const cfg = resolveConfig(BW, V);

describe('Exercices au poids du corps : progression par les répétitions seulement (version 1.24.0)', () => {
  it('247. Plage 10 à 40, +1 rép. après deux vertes, plafond atteint au maximum, jamais de charge ; −1 rép. après quatre rouges', () => {
    expect(cfg).toMatchObject({ sets: 3, minReps: 10, maxReps: 40, bodyweight: true, assisted: false });
    // Réglable par exercice ; un exercice à charge garde 8 à 12, sans réglage « poids du corps » (inchangé).
    expect(resolveConfig({ ...BW, overrides: { [V]: { bodyweight: true, maxReps: 25 } } }, V)).toMatchObject({ minReps: 10, maxReps: 25 });
    expect(resolveConfig(BW, 'autre')).toEqual(DEFAULT_VARIANT_CONFIG);

    // Charge nulle : valide au poids du corps seulement ; une charge y est refusée.
    expect(validatePerformance(green(0, 10), true)).toEqual([]);
    expect(validatePerformance(green(0, 10))).toEqual(['invalid_weight']);
    expect(validatePerformance(green(5, 10), true)).toEqual(['invalid_weight']);

    // Première séance à 3×15 (dans la plage) : standard, compte comme validation ; deux vertes → 3×16.
    let r = replay([green(0, 15), green(0, 15)], BW);
    expect(r.evaluations.map((e) => [e.decision, e.validation])).toEqual([['first', true], ['follow', true]]);
    expect(r.profile.variants[V]?.recommendation).toEqual({ kind: 'reps_up', targetReps: 16, plannedSets: 3 });
    expect(expectedTarget(r.profile.variants[V], 0, cfg)).toBe(16);
    expect(markerLabel(progressMarker(r.profile.variants[V])!)).toBe('+1 rép.');
    // Une seule verte : rien ; vert, orange, vert : rien (règles du §7.5 inchangées).
    expect(finalState([green(0, 15)], V, BW).recommendation.kind).toBe('keep');
    expect(finalState([green(0, 15), orange(0, 15), green(0, 15)], V, BW).recommendation.kind).toBe('keep');

    // Plafond : deux vertes à 40 → la cible reste 40 (« Plafond atteint »), jamais de poids supérieur ; la séance au
    // plafond suit la recommandation et valide encore.
    r = replay([green(0, 40), green(0, 40), green(0, 40)], BW);
    expect(r.evaluations[1]!.recommendation).toEqual({ kind: 'ceiling', targetReps: 40, plannedSets: 3 });
    expect(r.evaluations[2]).toMatchObject({ decision: 'follow', standard: true, validation: true, greenStreak: 3 });
    const top = r.profile.variants[V]!;
    expect(expectedTarget(top, 0, cfg)).toBe(40);
    expect(progressMarker(top)).toBeNull();
    expect(recommendedTarget(top, { sets: 3, reps: 10 }, false).hint).toEqual({ kind: 'ceiling' });
    expect(cardHint(top, false, { weightKg: 0, targetReps: 40, plannedSets: 3 }).hint).toEqual({ kind: 'ceiling' });

    // Trois rouges : rien ; quatre : cible −1 (« ↓ −1 rép. »).
    const reds = [red(0, 15), red(0, 15), red(0, 15), red(0, 15)];
    expect(finalState(reds.slice(0, 3), V, BW).recommendation.kind).toBe('keep');
    const low = finalState(reds, V, BW);
    expect(low.recommendation).toEqual({ kind: 'reps_down', targetReps: 14, plannedSets: 3 });
    expect(expectedTarget(low, 0, cfg)).toBe(14);
    expect(progressMarker(low)).toMatchObject({ kind: 'reps_down', removed: 1 });
    expect(markerLabel(progressMarker(low)!)).toBe('−1 rép.');
    expect(cardHint(low, false, { weightKg: 0, targetReps: 14, plannedSets: 3 }).hint).toEqual({ kind: 'change', arrow: '↓', label: '−1 rép.' });
    // Suivie : nouveau palier 3×14, compteurs repartis de 0 (comme une baisse de charge), la verte valide.
    r = replay([...reds, green(0, 14)], BW);
    expect(r.evaluations[4]).toMatchObject({ decision: 'follow', standard: true, validation: true, greenStreak: 1, redStreak: 0, palier: { weightKg: 0, targetReps: 14 } });
    expect(replay([...reds, red(0, 14)], BW).evaluations[4]).toMatchObject({ decision: 'follow', redStreak: 1, recommendation: { kind: 'keep' } });
    // Refusée : une nouvelle rouge la maintient, une verte la retire (§7.11 D, comme le poids inférieur).
    expect(replay([...reds, red(0, 15)], BW).evaluations[4]).toMatchObject({ decision: 'refusal', redStreak: 5, recommendation: { kind: 'reps_down' } });
    expect(replay([...reds, green(0, 15)], BW).evaluations[4]).toMatchObject({ decision: 'refusal', redStreak: 0, recommendation: { kind: 'keep' } });
    // Jamais sous la borne basse : quatre rouges à 3×10 laissent 3×10.
    expect(finalState([red(0, 10), red(0, 10), red(0, 10), red(0, 10)], V, BW).recommendation).toEqual({ kind: 'keep', targetReps: 10, plannedSets: 3 });
    // Une performance avec une charge est écartée du moteur.
    expect(replay([green(5, 15)], BW).ignored).toEqual([{ sessionId: 's1', variantId: V, reasons: ['invalid_weight'] }]);
  });

  it('248. Saisie sans charge, correction, réglage, records et bilans : jamais « 0 kg »', () => {
    const LIB: Exercise[] = [...SEED_EXERCISES];
    const settings = buildEngineSettings(LIB);
    const ctx = { state: undefined, cfg: resolveConfig(settings, 'crunch-sol') };
    // Jamais réalisé : rien à demander, 3 × 10 sans charge.
    expect(newPerformance('crunch-sol', ctx)).toEqual({ variantId: 'crunch-sol', weightKg: 0, targetReps: 10, plannedSets: 3, reps: [], feeling: 'inconnu' });
    let s = addExercise(startSession(Date.UTC(2026, 9, 27, 17), 'maison'), 'crunch-sol', ctx, Date.UTC(2026, 9, 27, 17)).session;
    s = setFeeling(recordRemainingSets(s, 'crunch-sol', 1), 'crunch-sol', 'bien', 1);
    expect(s.performances[0]).toMatchObject({ weightKg: 0, reps: [10, 10, 10] });

    // Correction d'une séance passée : la charge reste nulle.
    expect(correctPerformance(s, 'crunch-sol', { reps: [10, 10, 9] }, 2, true).errors).toEqual([]);
    expect(correctPerformance(s, 'crunch-sol', { reps: [10, 10, 9] }, 2).errors).toEqual(['invalid_weight']);
    expect(correctPerformance(s, 'crunch-sol', { weightKg: 5 }, 2, true).errors).toEqual(['invalid_weight']);
    // Réglage enregistré : « poids du corps » gardé, plage par défaut 10 à 40 non recopiée.
    expect(compactConfig({ ...DEFAULT_VARIANT_CONFIG, minReps: 10, maxReps: 40, bodyweight: true })).toEqual({ bodyweight: true });
    expect(compactConfig({ ...DEFAULT_VARIANT_CONFIG, minReps: 10, maxReps: 25, bodyweight: true })).toEqual({ bodyweight: true, maxReps: 25 });
    expect(compactConfig(DEFAULT_VARIANT_CONFIG)).toBeUndefined();

    // Records : le plus de répétitions ; « 3 × 25 », sans charge.
    const day = (d: number, target: number, extra: Partial<Session> = {}) =>
      history([perf(0, target, [target, target, target], 'bien', { variantId: 'crunch-sol' })]).map((x) => ({
        ...x, id: `c${d}`, date: `2026-10-${d}`, startedAt: new Date(2026, 9, d, 18).getTime(), endedAt: new Date(2026, 9, d, 19).getTime(), ...extra,
      }))[0]!;
    const sessions = [day(19, 24), day(20, 24), day(21, 25), day(22, 25), day(23, 25), day(24, 25)];
    const records = computeRecords(sessions, settings);
    expect(formatRecord(records.current.get('crunch-sol')!)).toBe('3 × 25');
    expect(records.breaks.map((b) => b.sessionId)).toEqual(['c21']);

    // Bilan : progression sans charge ; quatre rouges → « cible −1 rép. recommandée ».
    const reds = [26, 27, 28, 29].map((d) => ({ ...day(d, 30), performances: [perf(0, 30, [30, 28, 27], 'moyen', { variantId: 'crunch-sol' })] }));
    const all = [...sessions, ...reds];
    const { evaluations } = rebuildProfile(all, settings);
    const name = (id: string) => displayName(indexVariants(LIB).get(id));
    const text = reportText(
      buildReport(periodContaining('month', new Date(2026, 9, 30).getTime()), {
        sessions: all, exercises: LIB, evaluations, settings, groups: ['abdominaux'], weighIns: [], now: new Date(2026, 9, 31, 12).getTime(),
      }),
      name,
    );
    expect(text).toContain('Crunch au sol : 3×24 → 3×25 (20 oct.)');
    expect(text).toContain('👑 Crunch au sol : 3 × 25');
    expect(text).toContain('Crunch au sol : 4ᵉ séance rouge de suite → cible −1 rép. recommandée (29 oct.)');
    expect(text).not.toContain('0 kg');
  });
});
