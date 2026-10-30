import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { weeklyRecap } from '../../analysis/weekly';
import { computeRecords, formatRecord } from '../../analysis/records';
import type { Exercise, Session } from '../../domain/types';
import { DEFAULT_VARIANT_CONFIG, rebuildProfile, recommend, resolveConfig, startTarget } from '../../engine';
import { openAppDb, Repository } from '../../storage/db';
import { buildBackup, parseJsonImport } from '../../transfer/backup';
import { matchExercise } from '../../transfer/match';
import { newPerformance } from '../../session/ops';
import { buildEngineSettings } from '../catalog';
import { compactConfig, createExercise, EXERCISE_KINDS, KIND_RANGES, kindFlags, kindOf, setVariantConfig } from '../edit';
import { SEED_ADDITIONS, SEED_EXERCISES, SEED_VERSION } from '../seed';
import { buildSearchIndex, searchExercises } from '../search';

const LIB: Exercise[] = [...SEED_EXERCISES];
const settings = buildEngineSettings(LIB);
const ids = (q: string) => searchExercises(buildSearchIndex(LIB), q).map((r) => r.entry.variant.id);
const input = (name: string) => ({ name, synonyms: [], primaryGroup: 'jambes' as const, secondaryGroups: [], equipment: 'poids du corps' });

/** Séance terminée le jour `d` d'octobre 2026, la chaise tenue `target` s sur 3 séries. */
function chaise(d: number, target: number, reps = [target, target, target]): Session {
  const t = new Date(2026, 9, d, 18).getTime();
  return {
    id: `c${d}`, name: `c${d}`, date: `2026-10-${String(d).padStart(2, '0')}`, startedAt: t, endedAt: t + 1_800_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: [{ variantId: 'chaise', weightKg: 0, targetReps: target, plannedSets: 3, reps, feeling: 'bien' }],
  };
}

describe('Type d’un exercice et la chaise (version 1.31.0)', () => {
  it('275. Création : type « Charge (kg) », « Poids du corps (répétitions) » ou « Durée (secondes) », avec sa plage par défaut (8 à 12, 10 à 40, 20 à 60 s), modifiable', () => {
    expect(EXERCISE_KINDS.map((k) => k.label)).toEqual(['Charge (kg)', 'Poids du corps (répétitions)', 'Durée (secondes)']);
    expect(KIND_RANGES).toEqual({ load: { minReps: 8, maxReps: 12 }, bodyweight: { minReps: 10, maxReps: 40 }, seconds: { minReps: 20, maxReps: 60 } });
    const create = (name: string, kind: keyof typeof KIND_RANGES, range = KIND_RANGES[kind]) =>
      createExercise(input(name), LIB, { ...DEFAULT_VARIANT_CONFIG, ...range, ...kindFlags(kind) });

    // Charge : aucun réglage enregistré (valeurs par défaut).
    const load = create('Fentes bulgares', 'load');
    expect(load.variants[0]).not.toHaveProperty('config');
    // Poids du corps : 10 à 40, plage par défaut non recopiée.
    const bodyweight = create('Burpees', 'bodyweight');
    expect(bodyweight.variants[0]!.config).toEqual({ bodyweight: true });
    // Durée : 20 à 60 s ; une plage modifiée est gardée.
    const seconds = create('Gainage latéral', 'seconds');
    expect(seconds.variants[0]!.config).toEqual({ bodyweight: true, seconds: true });
    const longer = create('Gainage long', 'seconds', { minReps: 30, maxReps: 120 });
    expect(longer.variants[0]!.config).toEqual({ bodyweight: true, seconds: true, minReps: 30, maxReps: 120 });

    // Le moteur suit le type choisi : première cible au bas de la plage, sans charge au poids du corps et en durée.
    const lib = [...LIB, load, bodyweight, seconds, longer];
    const s = buildEngineSettings(lib);
    for (const [e, kind, min, max] of [[load, 'load', 8, 12], [bodyweight, 'bodyweight', 10, 40], [seconds, 'seconds', 20, 60], [longer, 'seconds', 30, 120]] as const) {
      const cfg = resolveConfig(s, e.id);
      expect(kindOf(cfg), e.name).toBe(kind);
      expect([cfg.minReps, cfg.maxReps], e.name).toEqual([min, max]);
      expect(recommend(undefined, cfg).targetReps, e.name).toBe(min);
    }
    expect(newPerformance(load.id, { state: undefined, cfg: resolveConfig(s, load.id) })).toBeNull();
    expect(newPerformance(seconds.id, { state: undefined, cfg: resolveConfig(s, seconds.id) })).toMatchObject({ weightKg: 0, targetReps: 20, plannedSets: 3 });

    // Changer de type (dans « Modifier », sans historique) : réglage remplacé.
    expect(setVariantConfig(bodyweight, bodyweight.id, { ...DEFAULT_VARIANT_CONFIG, ...KIND_RANGES.seconds, ...kindFlags('seconds') }).variants[0]!.config).toEqual({ bodyweight: true, seconds: true });
    expect(setVariantConfig(seconds, seconds.id, { ...DEFAULT_VARIANT_CONFIG, ...kindFlags('load') }).variants[0]).not.toHaveProperty('config');
  });

  it('276. La chaise (bibliothèque version 14) : durée de 20 à 90 s, cible de départ 3 × 45 s ; jambes, abdominaux en secondaire ; recherche, import, progression, récapitulatif, base existante et sauvegarde', async () => {
    expect(SEED_VERSION).toBe(14);
    expect(SEED_ADDITIONS[14]).toEqual(['chaise']);
    const chair = LIB.find((e) => e.id === 'chaise')!;
    expect(chair).toMatchObject({
      name: 'La chaise', synonyms: ['Chaise', 'Wall sit', 'Chaise contre le mur'], primaryGroup: 'jambes', secondaryGroups: ['abdominaux'], equipment: 'poids du corps',
    });
    const cfg = resolveConfig(settings, 'chaise');
    expect(cfg).toMatchObject({ bodyweight: true, seconds: true, sets: 3, minReps: 20, maxReps: 90, startReps: 45 });

    // Recherche et import.
    for (const q of ['la chaise', 'chaise', 'wall sit', 'chaise contre le mur']) expect(ids(q)[0], q).toBe('chaise');
    expect(ids('jambes')).toContain('chaise');
    for (const q of ['La chaise', 'Wall sit', 'chaise contre le mur']) expect(matchExercise(q, LIB), q).toMatchObject({ confidence: 'certain', suggestion: 'chaise' });

    // Jamais réalisée : 3 × 45 s, sans charge.
    expect(startTarget(cfg)).toBe(45);
    expect(recommend(undefined, cfg)).toEqual({ kind: 'start', targetReps: 45, plannedSets: 3 });
    expect(newPerformance('chaise', { state: undefined, cfg })).toEqual({ variantId: 'chaise', weightKg: 0, targetReps: 45, plannedSets: 3, reps: [], feeling: 'inconnu' });
    // La première séance à 45 s est standard : deux vertes → +5 s ; jamais au-delà de 90 s.
    const { profile, evaluations } = rebuildProfile([chaise(12, 45), chaise(14, 45)], settings);
    expect(evaluations.map((e) => [e.status, e.validation])).toEqual([['vert', true], ['vert', true]]);
    expect(profile.variants.chaise!.recommendation).toEqual({ kind: 'reps_up', targetReps: 50, plannedSets: 3 });
    expect(rebuildProfile([chaise(12, 90), chaise(14, 90)], settings).profile.variants.chaise!.recommendation.kind).toBe('ceiling');
    expect(formatRecord(computeRecords([chaise(12, 45), chaise(14, 50)], settings).current.get('chaise')!)).toBe('3 × 50 s');

    // Cible de départ : ramenée dans la plage ; gardée seulement si elle est dans la plage, au-dessus de la borne basse.
    expect(startTarget({ minReps: 50, maxReps: 90, startReps: 45 })).toBe(50);
    expect(startTarget({ minReps: 20, maxReps: 40, startReps: 45 })).toBe(40);
    expect(startTarget({ minReps: 20, maxReps: 60 })).toBe(20);
    expect(compactConfig(cfg)).toEqual({ bodyweight: true, seconds: true, maxReps: 90, startReps: 45 });
    expect(compactConfig({ ...cfg, minReps: 50 })).toEqual({ bodyweight: true, seconds: true, minReps: 50, maxReps: 90 });

    // Récapitulatif : jambes ; les abdominaux (secondaire) en indirect quand ils sont affichés.
    const now = new Date(2026, 9, 14, 20).getTime();
    const cells = weeklyRecap([chaise(12, 45)], LIB, now, { groups: ['jambes', 'abdominaux'], redThreshold: 2 }).cells;
    expect(cells.find((c) => c.group === 'jambes')).toMatchObject({ count: 1 });
    expect(cells.find((c) => c.group === 'abdominaux')).toMatchObject({ count: 0, indirect: 1 });

    // Base existante en version 13 : la chaise ajoutée une seule fois, jamais recréée après suppression.
    const repo = new Repository(await openAppDb(`test-v14-${Math.random()}`));
    await repo.putExercises(LIB.filter((e) => e.id !== 'chaise'));
    await repo.setMeta('seeded', true);
    await repo.setMeta('seedVersion', 13);
    await repo.ensureSeed();
    expect((await repo.loadExercises()).find((e) => e.id === 'chaise')).toEqual(chair);
    await repo.deleteExercise('chaise');
    await repo.ensureSeed();
    expect((await repo.loadExercises()).map((e) => e.id)).not.toContain('chaise');
    repo.close();

    // Sauvegarde : réglage (cible de départ comprise) identique après import ; cible de départ invalide refusée.
    const backup = buildBackup({ sessions: [chaise(12, 45)], exercises: LIB }, 1);
    const parsed = parseJsonImport(JSON.stringify(backup), LIB, '2026-10-28');
    expect(parsed.kind === 'backup' && parsed.backup.exercises.find((e) => e.id === 'chaise')).toEqual(chair);
    const bad = LIB.map((e) => (e.id === 'chaise' ? { ...e, variants: [{ ...e.variants[0]!, config: { ...e.variants[0]!.config, startReps: 4.5 } }] } : e));
    expect(parseJsonImport(JSON.stringify({ ...backup, exercises: bad }), LIB, '2026-10-28').kind).toBe('error');
  });
});
