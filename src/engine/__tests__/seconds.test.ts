import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Exercise, Session } from '../../domain/types';
import { buildReport, periodContaining, reportText } from '../../analysis/report';
import { computeRecords, formatRecord } from '../../analysis/records';
import { compactConfig, validateConfig } from '../../library/edit';
import { buildEngineSettings, displayName, indexVariants } from '../../library/catalog';
import { SEED_ADDITIONS, SEED_EXERCISES, SEED_VERSION } from '../../library/seed';
import { buildSearchIndex, searchExercises } from '../../library/search';
import { openAppDb, Repository } from '../../storage/db';
import { buildBackup, parseJsonImport } from '../../transfer/backup';
import { addExercise, newPerformance, recordRemainingSets, setFeeling, startSession } from '../../session/ops';
import { changeText, formatRecommendation, markerLabel } from '../../ui/labels';
import { cardHint, recommendedTarget } from '../../ui/TargetSummary';
import { DEFAULT_VARIANT_CONFIG, repStep, resolveConfig, type EngineSettings } from '../config';
import { progressMarker } from '../marker';
import { expectedTarget } from '../progression';
import { rebuildProfile } from '../replay';
import { finalState, green, history, orange, perf, red, replay, V } from './helpers';

/** Planche : en secondes, au poids du corps, plage par défaut 20 à 60 s, pas de 5 s (version 1.25.0). */
const SEC: EngineSettings = { defaults: DEFAULT_VARIANT_CONFIG, overrides: { [V]: { bodyweight: true, seconds: true } } };
const cfg = resolveConfig(SEC, V);
const LIB: Exercise[] = [...SEED_EXERCISES];

describe('Exercices en secondes : gainage, progression par pas de 5 s (version 1.25.0)', () => {
  it('252. Plage 20 à 60 s, +5 s après deux vertes, plafond au maximum, −5 s après quatre rouges ; exercices en répétitions inchangés', () => {
    expect(cfg).toMatchObject({ sets: 3, minReps: 20, maxReps: 60, bodyweight: true, seconds: true, assisted: false });
    expect(repStep(cfg)).toBe(5);
    // « En secondes » implique le poids du corps ; plage réglable ; poids du corps et charge : pas de 1, inchangés.
    expect(resolveConfig({ ...SEC, overrides: { [V]: { seconds: true, maxReps: 90 } } }, V)).toMatchObject({ bodyweight: true, minReps: 20, maxReps: 90 });
    expect(repStep(resolveConfig({ ...SEC, overrides: { [V]: { bodyweight: true } } }, V))).toBe(1);
    expect(resolveConfig(SEC, 'autre')).toEqual(DEFAULT_VARIANT_CONFIG);

    // Première séance à 3×30 s : standard ; deux vertes → 3×35 s (« ↑ +5 s »).
    let r = replay([green(0, 30), green(0, 30)], SEC);
    expect(r.evaluations.map((e) => [e.decision, e.validation])).toEqual([['first', true], ['follow', true]]);
    const up = r.profile.variants[V]!;
    expect(up.recommendation).toEqual({ kind: 'reps_up', targetReps: 35, plannedSets: 3 });
    expect(expectedTarget(up, 0, cfg)).toBe(35);
    expect(markerLabel(progressMarker(up)!, false, true)).toBe('+5 s');
    expect(cardHint(up, false, { weightKg: 0, targetReps: 35, plannedSets: 3 }, true).hint).toEqual({ kind: 'change', arrow: '↑', label: '+5 s' });
    expect(recommendedTarget(up, { sets: 3, reps: 20 }, false, true)).toEqual({
      target: { sets: 3, reps: 35, weightKg: 0 },
      hint: { kind: 'change', arrow: '↑', label: '+5 s' },
    });
    expect(formatRecommendation(up.recommendation, false, true)).toBe('3 × 35 s');
    // Suivie à 3×35 s : nouveau palier, elle valide.
    r = replay([green(0, 30), green(0, 30), green(0, 35)], SEC);
    expect(r.evaluations[2]).toMatchObject({ decision: 'follow', standard: true, validation: true, greenStreak: 1, palier: { weightKg: 0, targetReps: 35 } });
    // Une seule verte, ou vert-orange-vert : rien.
    expect(finalState([green(0, 30)], V, SEC).recommendation.kind).toBe('keep');
    expect(finalState([green(0, 30), orange(0, 30), green(0, 30)], V, SEC).recommendation.kind).toBe('keep');
    // Près du plafond : jamais au-delà (58 s → 60 s) ; au plafond : la cible reste (« Plafond atteint »).
    const near: EngineSettings = { ...SEC, overrides: { [V]: { bodyweight: true, seconds: true, maxReps: 58 } } };
    expect(finalState([green(0, 55), green(0, 55)], V, near).recommendation).toEqual({ kind: 'reps_up', targetReps: 58, plannedSets: 3 });
    r = replay([green(0, 60), green(0, 60), green(0, 60)], SEC);
    expect(r.evaluations[1]!.recommendation).toEqual({ kind: 'ceiling', targetReps: 60, plannedSets: 3 });
    expect(r.evaluations[2]).toMatchObject({ decision: 'follow', validation: true });

    // Trois rouges : rien ; quatre : −5 s ; jamais sous 20 s.
    const reds = [red(0, 40), red(0, 40), red(0, 40), red(0, 40)];
    expect(finalState(reds.slice(0, 3), V, SEC).recommendation.kind).toBe('keep');
    const low = finalState(reds, V, SEC);
    expect(low.recommendation).toEqual({ kind: 'reps_down', targetReps: 35, plannedSets: 3 });
    expect(markerLabel(progressMarker(low)!, false, true)).toBe('−5 s');
    expect(replay([...reds, green(0, 35)], SEC).evaluations[4]).toMatchObject({ decision: 'follow', validation: true, redStreak: 0 });
    expect(replay([...reds, red(0, 40)], SEC).evaluations[4]).toMatchObject({ decision: 'refusal', recommendation: { kind: 'reps_down' } });
    expect(finalState([red(0, 22), red(0, 22), red(0, 22), red(0, 22)], V, SEC).recommendation).toEqual({ kind: 'reps_down', targetReps: 20, plannedSets: 3 });
    expect(finalState([red(0, 20), red(0, 20), red(0, 20), red(0, 20)], V, SEC).recommendation).toEqual({ kind: 'keep', targetReps: 20, plannedSets: 3 });
    // Une performance avec une charge est écartée du moteur.
    expect(replay([green(5, 30)], SEC).ignored).toHaveLength(1);

    // Exercices en répétitions : mêmes textes qu'avant.
    expect(markerLabel({ kind: 'reps_up', added: 1, from: { plannedSets: 3, targetReps: 8 }, to: { plannedSets: 3, targetReps: 9 } })).toBe('+1 rép.');
    expect(changeText({ from: { weightKg: 0, targetReps: 30 }, to: { weightKg: 0, targetReps: 35 } }, true)).toBe('30 → 35 s');
    expect(changeText({ from: { weightKg: 40, targetReps: 8 }, to: { weightKg: 40, targetReps: 9 } })).toBe('8 → 9 rép.');
  });

  it('253. Planche (bibliothèque version 12) : saisie sans charge en secondes, réglage, records, bilans, base existante et sauvegarde', async () => {
    expect(SEED_VERSION).toBeGreaterThanOrEqual(12);
    expect(SEED_ADDITIONS[12]).toEqual(['planche']);
    const settings = buildEngineSettings(LIB);
    expect(LIB.find((e) => e.id === 'planche')).toMatchObject({ name: 'Planche', primaryGroup: 'abdominaux', secondaryGroups: [], equipment: 'poids du corps' });
    expect(resolveConfig(settings, 'planche')).toMatchObject({ bodyweight: true, seconds: true, minReps: 20, maxReps: 60, sets: 3 });
    const ids = (q: string) => searchExercises(buildSearchIndex(LIB), q).map((x) => x.entry.variant.id);
    for (const q of ['planche', 'gainage', 'plank', 'front plank', 'gainage ventral']) expect(ids(q)[0], q).toBe('planche');

    // Jamais réalisée : 3 × 20 s, sans charge, rien à demander.
    const ctx = { state: undefined, cfg: resolveConfig(settings, 'planche') };
    expect(newPerformance('planche', ctx)).toEqual({ variantId: 'planche', weightKg: 0, targetReps: 20, plannedSets: 3, reps: [], feeling: 'inconnu' });
    let s = addExercise(startSession(Date.UTC(2026, 9, 27, 17), 'Séance'), 'planche', ctx, Date.UTC(2026, 9, 27, 17)).session;
    s = setFeeling(recordRemainingSets(s, 'planche', 1), 'planche', 'bien', 1);
    expect(s.performances[0]).toMatchObject({ weightKg: 0, reps: [20, 20, 20] });

    // Réglage enregistré : « en secondes » et « poids du corps » gardés, plage 20 à 60 s non recopiée ; jusqu'à 600 s.
    expect(compactConfig({ ...DEFAULT_VARIANT_CONFIG, minReps: 20, maxReps: 60, bodyweight: true, seconds: true })).toEqual({ bodyweight: true, seconds: true });
    expect(compactConfig({ ...DEFAULT_VARIANT_CONFIG, minReps: 20, maxReps: 90, bodyweight: true, seconds: true })).toEqual({ bodyweight: true, seconds: true, maxReps: 90 });
    expect(validateConfig({ ...DEFAULT_VARIANT_CONFIG, minReps: 20, maxReps: 120, bodyweight: true, seconds: true })).toEqual([]);
    expect(validateConfig({ ...DEFAULT_VARIANT_CONFIG, minReps: 10, maxReps: 120, bodyweight: true })).toEqual(['range']);

    // Records « 3 × 45 s » ; bilan « 3×40 s → 3×45 s », « cible −5 s recommandée », jamais « 0 kg ».
    const day = (d: number, target: number, reps = [target, target, target], feeling: 'bien' | 'moyen' = 'bien') =>
      history([perf(0, target, reps, feeling, { variantId: 'planche' })]).map((x) => ({
        ...x, id: `p${d}`, date: `2026-10-${d}`, startedAt: new Date(2026, 9, d, 18).getTime(), endedAt: new Date(2026, 9, d, 19).getTime(),
      }))[0]!;
    const sessions: Session[] = [day(12, 40), day(13, 40), day(14, 45), day(15, 45)];
    const records = computeRecords(sessions, settings);
    expect(formatRecord(records.current.get('planche')!)).toBe('3 × 45 s');
    const reds = [26, 27, 28, 29].map((d) => day(d, 50, [50, 40, 35], 'moyen'));
    const all = [...sessions, day(16, 50), day(17, 50), ...reds];
    const { evaluations } = rebuildProfile(all, settings);
    const name = (id: string) => displayName(indexVariants(LIB).get(id));
    const text = reportText(
      buildReport(periodContaining('month', new Date(2026, 9, 30).getTime()), {
        sessions: all, exercises: LIB, evaluations, settings, groups: ['abdominaux'], weighIns: [], now: new Date(2026, 9, 31, 12).getTime(),
      }),
      name,
    );
    expect(text).toContain('Planche : 3×40 s → 3×45 s (13 oct.)');
    expect(text).toContain('👑 Planche : 3 × 50 s');
    expect(text).toContain('Planche : 4ᵉ séance rouge de suite → cible −5 s recommandée (29 oct.)');
    expect(text).not.toContain('0 kg');

    // Base existante en version 11 : la planche ajoutée une seule fois, jamais recréée après suppression.
    const repo = new Repository(await openAppDb(`test-v12-${Math.random()}`));
    await repo.putExercises(LIB.filter((e) => e.id !== 'planche'));
    await repo.setMeta('seeded', true);
    await repo.setMeta('seedVersion', 11);
    await repo.ensureSeed();
    expect((await repo.loadExercises()).find((e) => e.id === 'planche')).toEqual(LIB.find((e) => e.id === 'planche'));
    await repo.deleteExercise('planche');
    await repo.ensureSeed();
    expect((await repo.loadExercises()).map((e) => e.id)).not.toContain('planche');
    repo.close();

    // Sauvegarde : identique après import ; « en secondes » sans poids du corps refusé.
    const backup = buildBackup({ sessions, exercises: LIB }, 1);
    const parsed = parseJsonImport(JSON.stringify(backup), LIB, '2026-10-28');
    expect(parsed.kind === 'backup' && parsed.backup.sessions).toEqual(sessions);
    const bad = LIB.map((e) => (e.id === 'planche' ? { ...e, variants: [{ ...e.variants[0]!, config: { seconds: true } }] } : e));
    expect(parseJsonImport(JSON.stringify({ ...backup, sessions: [], exercises: bad }), LIB, '2026-10-28').kind).toBe('error');
  });
});
