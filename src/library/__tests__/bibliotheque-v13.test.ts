import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { weeklyRecap } from '../../analysis/weekly';
import { computeRecords, formatRecord } from '../../analysis/records';
import type { Exercise, Session } from '../../domain/types';
import { rebuildProfile, resolveConfig } from '../../engine';
import { openAppDb, Repository } from '../../storage/db';
import { buildBackup, parseJsonImport } from '../../transfer/backup';
import { newPerformance } from '../../session/ops';
import { buildEngineSettings, displayName, indexVariants } from '../catalog';
import { illustrationFor } from '../illustrations';
import { SEED_ADDITIONS, SEED_EXERCISES, SEED_VERSION } from '../seed';
import { buildSearchIndex, searchExercises } from '../search';

const LIB: Exercise[] = [...SEED_EXERCISES];
const settings = buildEngineSettings(LIB);
const ids = (q: string) => searchExercises(buildSearchIndex(LIB), q).map((r) => r.entry.variant.id);
const KNEES = 'pompes--genoux';

/** Séance terminée le jour `d` d'octobre 2026 ; `home` : à la maison. */
function done(id: string, d: number, variantId: string, target: number, sets = 2, home = false): Session {
  const t = new Date(2026, 9, d, 18).getTime();
  return {
    id, name: id, date: `2026-10-${String(d).padStart(2, '0')}`, startedAt: t, endedAt: t + 1_800_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: [{ variantId, weightKg: 0, targetReps: target, plannedSets: sets, reps: Array(sets).fill(target), feeling: 'bien' }],
    ...(home ? { location: 'maison' as const } : {}),
  };
}

describe('Bibliothèque version 13 : pompes au poids du corps (version 1.27.0)', () => {
  it('260. Pompes classiques et sur les genoux : deux suivis, 2 séries, 10 à 40 ; recherche, progression, records, récapitulatif à la maison, dessin', async () => {
    expect(SEED_VERSION).toBeGreaterThanOrEqual(13);
    expect(SEED_ADDITIONS[13]).toEqual(['pompes']);
    const pompes = LIB.find((e) => e.id === 'pompes')!;
    expect(pompes).toMatchObject({ name: 'Pompes', primaryGroup: 'pectoraux', secondaryGroups: ['triceps', 'epaules'], equipment: 'poids du corps' });
    // Deux variantes seulement, chacune avec son suivi.
    expect(pompes.variants.map((v) => [v.id, v.name])).toEqual([['pompes', 'Classiques'], [KNEES, 'Sur les genoux']]);
    const refs = indexVariants(LIB);
    expect(displayName(refs.get('pompes'))).toBe('Pompes — Classiques');
    expect(displayName(refs.get(KNEES))).toBe('Pompes — Sur les genoux');
    for (const id of ['pompes', KNEES]) expect(resolveConfig(settings, id), id).toEqual({ sets: 2, minReps: 10, maxReps: 40, assisted: false, bodyweight: true });
    // Saisie : sans charge, 2 × 10, rien à demander.
    expect(newPerformance('pompes', { state: undefined, cfg: resolveConfig(settings, 'pompes') })).toEqual({
      variantId: 'pompes', weightKg: 0, targetReps: 10, plannedSets: 2, reps: [], feeling: 'inconnu',
    });

    // Recherche : synonymes ; « pompes genoux » et « knee push-up » ne trouvent que les genoux.
    for (const q of ['pompes', 'push-up', 'pushups', 'push up']) expect(ids(q).slice(0, 2), q).toEqual(['pompes', KNEES]);
    for (const q of ['pompes genoux', 'knee push-up', 'pompes sur les genoux']) expect(ids(q), q).toEqual([KNEES]);
    expect(ids('pompes classiques')).toEqual(['pompes']);
    expect(ids('pectoraux')).toEqual(expect.arrayContaining(['pompes', KNEES]));

    // Progression à 2 séries : deux vertes → +1 rép. ; les genoux ont leur propre suivi.
    const sessions = [done('a', 19, 'pompes', 12), done('b', 20, 'pompes', 12), done('c', 21, KNEES, 20)];
    const r = rebuildProfile(sessions, settings);
    expect(r.evaluations.map((e) => [e.variantId, e.standard, e.validation])).toEqual([['pompes', true, true], ['pompes', true, true], [KNEES, true, true]]);
    expect(r.profile.variants.pompes?.recommendation).toEqual({ kind: 'reps_up', targetReps: 13, plannedSets: 2 });
    expect(r.profile.variants[KNEES]?.recommendation).toEqual({ kind: 'keep', targetReps: 20, plannedSets: 2 });
    // 3 séries sur un exercice réglé à 2 : non standard (règle habituelle), ne valide pas.
    expect(rebuildProfile([done('x', 19, 'pompes', 12, 3)], settings).evaluations[0]).toMatchObject({ standard: false, validation: false });
    expect(formatRecord(computeRecords(sessions, settings).current.get('pompes')!)).toBe('2 × 12');

    // Récapitulatif à la maison : pectoraux ½ (« +1 maison »), triceps et épaules non comptés ; à la salle : 1 et ½.
    const now = new Date(2026, 9, 21, 20).getTime();
    const home = weeklyRecap([done('m', 21, 'pompes', 12, 2, true)], LIB, now).cells;
    expect(home.find((c) => c.group === 'pectoraux')).toMatchObject({ count: 0, indirect: 0, home: 1, score: 0.5 });
    for (const g of ['triceps', 'epaules']) expect(home.find((c) => c.group === g), g).toMatchObject({ count: 0, indirect: 0, score: 0 });
    const gym = weeklyRecap([done('s', 21, 'pompes', 12)], LIB, now).cells;
    expect(gym.find((c) => c.group === 'pectoraux')).toMatchObject({ count: 1, score: 1 });
    expect(gym.find((c) => c.group === 'triceps')).toMatchObject({ indirect: 1, score: 0.5 });
    // Au poids du corps : un seul suivi, quel que soit le lieu.
    expect(rebuildProfile([done('a', 19, 'pompes', 12), done('m', 20, 'pompes', 12, 2, true)], settings).profile.variants.pompes?.recommendation.kind).toBe('reps_up');

    // Dessin : pompes classiques (everkinetic/data) ; sur les genoux, pictogramme (le dessin des classiques serait trompeur).
    expect(illustrationFor('pompes', 'pompes')).toMatchObject({ title: 'Push ups', license: 'CC BY-SA 4.0', origin: 'everkinetic/data' });
    expect(illustrationFor('pompes', KNEES)).toBeUndefined();

    // Base existante en version 12 : ajoutées une seule fois, jamais recréées ; sauvegarde identique.
    const repo = new Repository(await openAppDb(`test-v13-${Math.random()}`));
    await repo.putExercises(LIB.filter((e) => e.id !== 'pompes'));
    await repo.setMeta('seeded', true);
    await repo.setMeta('seedVersion', 12);
    await repo.ensureSeed();
    expect((await repo.loadExercises()).find((e) => e.id === 'pompes')).toEqual(pompes);
    await repo.deleteExercise('pompes');
    await repo.ensureSeed();
    expect((await repo.loadExercises()).map((e) => e.id)).not.toContain('pompes');
    repo.close();
    const parsed = parseJsonImport(JSON.stringify(buildBackup({ sessions, exercises: LIB }, 1)), LIB, '2026-10-28');
    expect(parsed.kind === 'backup' && parsed.backup.sessions).toEqual(sessions);
  });
});
