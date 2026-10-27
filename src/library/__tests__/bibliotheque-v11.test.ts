import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { weeklyRecap } from '../../analysis/weekly';
import type { Exercise, Session } from '../../domain/types';
import { resolveConfig } from '../../engine';
import { openAppDb, Repository } from '../../storage/db';
import { buildBackup, parseJsonImport, planImport } from '../../transfer/backup';
import { matchExercise } from '../../transfer/match';
import { buildEngineSettings } from '../catalog';
import { SEED_ADDITIONS, SEED_EXERCISES, SEED_VERSION } from '../seed';
import { buildSearchIndex, searchExercises } from '../search';

const LIB: Exercise[] = [...SEED_EXERCISES];
const ids = (q: string) => searchExercises(buildSearchIndex(LIB), q).map((r) => r.entry.variant.id);
const ABDOS = ['crunch-sol', 'crunch-oblique-touche-talons', 'releves-jambes-allonge'];

function done(variantId: string, date: string, weightKg: number, target = 15): Session {
  const t = new Date(`${date}T18:00:00`).getTime();
  return {
    id: `${variantId}-${date}`, name: 'Séance', date, startedAt: t, endedAt: t + 900_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: [{ variantId, weightKg, targetReps: target, plannedSets: 3, reps: [target, target, target], feeling: 'bien' }],
  };
}

describe('Bibliothèque version 11 : abdominaux au poids du corps (§4.0)', () => {
  it('249. Crunch au sol, crunch oblique touche talons, relevés de jambes allongé : poids du corps, recherche et import ; « crunch » seul → au sol', () => {
    expect(SEED_VERSION).toBe(11);
    expect(SEED_ADDITIONS[11]).toEqual(ABDOS);
    const settings = buildEngineSettings(LIB);
    for (const id of ABDOS) {
      const e = LIB.find((x) => x.id === id)!;
      expect(e, id).toMatchObject({ primaryGroup: 'abdominaux', secondaryGroups: [], equipment: 'poids du corps' });
      expect(resolveConfig(settings, id), id).toMatchObject({ bodyweight: true, minReps: 10, maxReps: 40, sets: 3 });
    }
    // Le crunch machine reste un exercice à charge, 8 à 12.
    expect(resolveConfig(settings, 'crunch-machine')).toEqual({ sets: 3, minReps: 8, maxReps: 12, assisted: false });

    // Recherche.
    expect(ids('crunch')[0]).toBe('crunch-sol');
    expect(ids('crunch')).toEqual(expect.arrayContaining(['crunch-machine', 'crunch-oblique-touche-talons']));
    expect(ids('crunch machine')[0]).toBe('crunch-machine');
    for (const q of ['heel touches', 'heel touch', 'touche talons', 'crunch oblique']) expect(ids(q), q).toEqual(['crunch-oblique-touche-talons']);
    for (const q of ['relevés de jambes', 'relevé de jambes allongé', 'leg raise', 'lying leg raise']) expect(ids(q)[0], q).toBe('releves-jambes-allonge');
    expect(ids('abdos')).toEqual(['crunch-machine', ...ABDOS]);
    // « jambes » et « legs » restent les exercices de jambes : jamais les relevés (abdominaux), malgré leur nom.
    for (const q of ['jambes', 'legs', 'leg']) expect(ids(q), q).not.toContain('releves-jambes-allonge');
    expect(ids('jambes')).toContain('leg-extension');

    // Import : nom ou synonyme reconnu directement ; « crunch » seul → au sol, sans demander.
    expect(matchExercise('crunch', LIB)).toMatchObject({ confidence: 'certain', suggestion: 'crunch-sol' });
    expect(matchExercise('Crunch machine', LIB)).toMatchObject({ confidence: 'certain', suggestion: 'crunch-machine' });
    expect(matchExercise('Heel touches', LIB)).toMatchObject({ confidence: 'certain', suggestion: 'crunch-oblique-touche-talons' });
    expect(matchExercise('Relevés de jambes allongé', LIB)).toMatchObject({ confidence: 'certain', suggestion: 'releves-jambes-allonge' });

    // Récapitulatif avec « Abdominaux » activé : une séance d'abdos compte 1, sans toucher aux jambes.
    const recap = weeklyRecap([done('releves-jambes-allonge', '2026-10-27', 0)], LIB, new Date('2026-10-28T12:00:00').getTime(), {
      groups: ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux'],
      redThreshold: 2,
    });
    expect(recap.cells.find((c) => c.group === 'abdominaux')).toMatchObject({ count: 1, indirect: 0 });
    expect(recap.cells.find((c) => c.group === 'jambes')).toMatchObject({ count: 0, indirect: 0 });
  });

  it('250. Base existante (version 10) : les trois exercices ajoutés une seule fois ; sauvegarde : charge nulle au poids du corps seulement', async () => {
    const V10 = LIB.filter((e) => !ABDOS.includes(e.id));
    const repo = new Repository(await openAppDb(`test-v11-${Math.random()}`));
    await repo.putExercises(V10);
    await repo.setMeta('seeded', true);
    await repo.setMeta('seedVersion', 10);
    const sessions = [done('crunch-machine', '2026-10-20', 30, 10)];
    for (const s of sessions) await repo.putSession(s);
    await repo.ensureSeed();
    const after = await repo.loadExercises();
    expect(await repo.getMeta('seedVersion')).toBe(SEED_VERSION);
    expect(after).toHaveLength(LIB.length);
    for (const id of ABDOS) expect(after.find((e) => e.id === id), id).toEqual(LIB.find((e) => e.id === id));
    expect(await repo.loadSessions()).toEqual(sessions);
    // Un exercice supprimé ensuite n'est jamais recréé.
    await repo.deleteExercise('crunch-sol');
    await repo.ensureSeed();
    expect((await repo.loadExercises()).map((e) => e.id)).not.toContain('crunch-sol');
    repo.close();

    // Sauvegarde : un crunch au sol sans charge s'exporte et se réimporte à l'identique.
    const mine = [done('crunch-sol', '2026-10-27', 0, 20), done('crunch-machine', '2026-10-20', 30, 10)];
    const backup = buildBackup({ sessions: mine, exercises: LIB }, 1);
    const parsed = parseJsonImport(JSON.stringify(backup), LIB, '2026-10-28');
    expect(parsed.kind).toBe('backup');
    if (parsed.kind !== 'backup') return;
    expect(parsed.backup.sessions).toEqual(mine);
    expect(planImport(parsed.backup, { sessions: [], exercises: LIB }, { mode: 'merge' }).sessions).toHaveLength(2);
    // Charge nulle sur un exercice à charge, ou charge sur un exercice au poids du corps : sauvegarde refusée.
    const zero = parseJsonImport(JSON.stringify({ ...backup, sessions: [done('crunch-machine', '2026-10-20', 0)] }), LIB, '2026-10-28');
    expect(zero.kind === 'error' && zero.details).toContain('Séance crunch-machine-2026-10-20 : charge invalide pour crunch-machine.');
    const loaded = parseJsonImport(JSON.stringify({ ...backup, sessions: [done('crunch-sol', '2026-10-27', 5)] }), LIB, '2026-10-28');
    expect(loaded.kind === 'error' && loaded.details).toContain('Séance crunch-sol-2026-10-27 : charge invalide pour crunch-sol.');
    const badConfig = LIB.map((e) => (e.id === 'crunch-sol' ? { ...e, variants: [{ ...e.variants[0]!, config: { bodyweight: 'oui' } }] } : e));
    expect(parseJsonImport(JSON.stringify({ ...backup, exercises: badConfig }), LIB, '2026-10-28').kind).toBe('error');
    // Une sauvegarde d'avant la version 11 (sans ces exercices) se fusionne sans rien retirer.
    const old = parseJsonImport(JSON.stringify(buildBackup({ sessions: [], exercises: LIB.filter((e) => !ABDOS.includes(e.id)) }, 1)), LIB, '2026-10-28');
    if (old.kind !== 'backup') throw new Error(old.kind);
    expect(planImport(old.backup, { sessions: [], exercises: LIB }, { mode: 'merge' }).exercises).toEqual([]);
  });
});
