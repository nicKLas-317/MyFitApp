import { describe, expect, it } from 'vitest';
import type { Exercise, Session } from '../../domain/types';
import { DEFAULT_VARIANT_CONFIG, rebuildProfile } from '../../engine';
import { buildEngineSettings } from '../catalog';
import {
  addVariant,
  createExercise,
  exerciseHasHistory,
  parseList,
  removeVariant,
  setVariantConfig,
  updateExercise,
  validateConfig,
  validateExerciseInput,
  validateVariantName,
  variantHasHistory,
} from '../edit';
import { SEED_EXERCISES } from '../seed';

const LIB: Exercise[] = [...SEED_EXERCISES];
const byId = (id: string, lib = LIB) => lib.find((e) => e.id === id)!;

function session(id: string, date: string, variantId: string, reps: number[], feeling: 'bien' | 'moyen' = 'bien'): Session {
  return {
    id, name: id, date, startedAt: null, endedAt: null, createdAt: 0, updatedAt: 0, origin: 'app', state: 'done',
    performances: [{ variantId, weightKg: 40, targetReps: 8, plannedSets: 3, reps, feeling }],
  };
}

describe('Gestion des exercices et variantes (§4.3)', () => {
  it('55. Renommer un exercice conserve son historique et ses compteurs', () => {
    const sessions = [session('s1', '2026-10-01', 'tirage-vertical', [8, 8, 8]), session('s2', '2026-10-03', 'tirage-vertical', [8, 8, 8])];
    const before = rebuildProfile(sessions, buildEngineSettings(LIB));
    const ex = byId('tirage-vertical');
    const renamed = updateExercise(ex, { name: 'Tirage poitrine Technogym', synonyms: ['Lat pulldown', 'Tirage nuque'], primaryGroup: 'dos', secondaryGroups: ['biceps'], equipment: 'poulie' });
    expect(renamed.id).toBe('tirage-vertical');
    expect(renamed.variants).toEqual(ex.variants);
    const lib = LIB.map((e) => (e.id === ex.id ? renamed : e));
    const after = rebuildProfile(sessions, buildEngineSettings(lib));
    expect(after).toEqual(before);
    expect(after.profile.variants['tirage-vertical']).toMatchObject({ greenStreak: 2, recommendation: { kind: 'reps_up', targetReps: 9 } });
  });

  it('56. Un exercice ou une variante avec historique est repéré (archivage seul possible)', () => {
    const sessions = [session('s1', '2026-10-01', 'leg-curl', [8, 8, 8])];
    expect(variantHasHistory('leg-curl', sessions)).toBe(true);
    expect(exerciseHasHistory(byId('leg-curl'), sessions)).toBe(true);
    expect(exerciseHasHistory(byId('pec-deck'), sessions)).toBe(false);
    const active: Session = { ...session('s2', '2026-10-02', 'pec-deck', []), state: 'active' };
    expect(exerciseHasHistory(byId('pec-deck'), [active])).toBe(true);
  });

  it('création d’un exercice personnalisé : identifiant stable et unique, validation des champs', () => {
    const input = { name: '  Hip   thrust ', synonyms: parseList('Pont fessier, glute bridge; pont fessier'), primaryGroup: 'jambes' as const, secondaryGroups: ['jambes' as const, 'ischio-jambiers' as const], equipment: 'barre' };
    const created = createExercise(input, LIB);
    expect(created).toMatchObject({
      id: 'perso-hip-thrust',
      name: 'Hip thrust',
      synonyms: ['Pont fessier', 'glute bridge'],
      secondaryGroups: ['ischio-jambiers'],
      variants: [{ id: 'perso-hip-thrust', name: 'Standard', synonyms: [], archived: false }],
    });
    expect(createExercise(input, [...LIB, created]).id).toBe('perso-hip-thrust-2');
    expect(validateExerciseInput({ ...input, name: 'Leg Curl' }, LIB)).toEqual(['name_taken']);
    expect(validateExerciseInput({ ...input, name: 'Leg curl' }, LIB, 'leg-curl')).toEqual([]);
    expect(validateExerciseInput({ ...input, name: ' ', primaryGroup: null }, LIB)).toEqual(['name_missing', 'group_missing']);
  });

  it('les variantes ont leur propre identifiant, un nom unique, et seule une variante non standard se supprime', () => {
    const ex = byId('tirage-vertical');
    const { exercise, variantId } = addVariant(ex, 'Prise serrée', LIB);
    expect(variantId).toBe('tirage-vertical--prise-serree');
    expect(validateVariantName(exercise, 'prise serree')).toBe('name_taken');
    expect(validateVariantName(exercise, '')).toBe('name_missing');
    expect(removeVariant(exercise, variantId).variants.map((v) => v.id)).toEqual(['tirage-vertical']);
    expect(() => removeVariant(exercise, 'tirage-vertical')).toThrow();
  });

  it('réglages spécifiques : validés, seules les différences sont conservées, et le moteur les applique', () => {
    expect(validateConfig({ sets: 4, minReps: 6, maxReps: 10 })).toEqual([]);
    expect(validateConfig({ sets: 0, minReps: 10, maxReps: 6 })).toEqual(['sets', 'range']);
    const ex = setVariantConfig(byId('leg-curl'), 'leg-curl', { ...DEFAULT_VARIANT_CONFIG, maxReps: 15 });
    expect(ex.variants[0]!.config).toEqual({ maxReps: 15 });
    expect(setVariantConfig(ex, 'leg-curl', DEFAULT_VARIANT_CONFIG).variants[0]).not.toHaveProperty('config');
    const settings = buildEngineSettings(LIB.map((e) => (e.id === ex.id ? ex : e)));
    expect(settings.overrides['leg-curl']).toEqual({ maxReps: 15 });
  });
});
