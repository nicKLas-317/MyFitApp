import { describe, expect, it } from 'vitest';
import { DEFAULT_VARIANT_CONFIG, type EngineSettings } from '../../engine';
import { perf, replay, V } from '../../engine/__tests__/helpers';
import { cardHint, freshLoadHint } from '../TargetSummary';

const ASSISTED: EngineSettings = { defaults: DEFAULT_VARIANT_CONFIG, overrides: { [V]: { assisted: true } } };
const state = (steps: ReturnType<typeof perf>[], settings?: EngineSettings) => replay(steps, settings).profile.variants[V]!;
const card = (s: ReturnType<typeof state>, assisted: boolean, weightKg: number, targetReps = s.palier.targetReps) =>
  cardHint(s, assisted, { weightKg, targetReps, plannedSets: 3 }).hint;

describe('Séance de départ : charge changée sans recommandation (version 1.42.0, §5.3.2)', () => {
  const keep = state([perf(12, 8, [8, 8, 8], 'mal')]);
  const up = state([perf(12, 12, [12, 12, 12], 'bien'), perf(12, 12, [12, 12, 12], 'bien')]);
  const down = state([1, 2, 3, 4].map(() => perf(12, 8, [8, 8, 8], 'tres_mal')));

  it('303. Plus légère sans recommandation : « ↓ Nouvelle charge : séance de départ » ; plus lourde : « ↑ … » ; même charge, charge à saisir : rien', () => {
    expect(card(keep, false, 10)).toEqual({ kind: 'fresh', arrow: '↓', label: 'Nouvelle charge : séance de départ' });
    expect(card(keep, false, 14)).toEqual({ kind: 'fresh', arrow: '↑', label: 'Nouvelle charge : séance de départ' });
    expect(card(keep, false, 12)).toEqual({ kind: 'same' });
    expect(card(keep, false, 0)).toBeNull();
    expect(freshLoadHint(undefined, false, 10)).toBeNull();
    // Une autre cible à la même charge : rien (comme avant).
    expect(card(keep, false, 12, 10)).toBeNull();
  });

  it('303. Charge recommandée suivie : rien ; charge dans l’autre sens : séance de départ', () => {
    expect(up.recommendation.kind).toBe('weight_up');
    expect(card(up, false, 14, 8)).toBeNull();
    expect(card(up, false, 10)).toEqual({ kind: 'fresh', arrow: '↓', label: 'Nouvelle charge : séance de départ' });
    expect(down.recommendation.kind).toBe('weight_down');
    expect(card(down, false, 10)).toBeNull();
    expect(card(down, false, 14)).toEqual({ kind: 'fresh', arrow: '↑', label: 'Nouvelle charge : séance de départ' });
  });

  it('303. Exercice assisté : « Nouvelle aide : séance de départ », sans flèche ; moins d’aide recommandée et suivie : rien', () => {
    const a = state([perf(30, 8, [8, 8, 8], 'moyen')], ASSISTED);
    expect(card(a, true, 35)).toEqual({ kind: 'fresh', arrow: null, label: 'Nouvelle aide : séance de départ' });
    expect(card(a, true, 25)).toEqual({ kind: 'fresh', arrow: null, label: 'Nouvelle aide : séance de départ' });
    const less = state([perf(30, 12, [12, 12, 12], 'bien'), perf(30, 12, [12, 12, 12], 'bien')], ASSISTED);
    expect(less.recommendation.kind).toBe('weight_up');
    expect(card(less, true, 25, 8)).toBeNull();
  });

  it('303. Le moteur traite la même séance en séance de départ (changement non recommandé) : la mention dit ce que fait le moteur', () => {
    const r = replay([perf(12, 8, [8, 8, 8], 'mal'), perf(10, 8, [8, 8, 8], 'bien'), perf(10, 8, [8, 8, 8], 'bien')]);
    expect(r.evaluations.map((e) => [e.decision, e.validation])).toEqual([['first', false], ['manual_weight', false], ['follow', true]]);
  });
});
