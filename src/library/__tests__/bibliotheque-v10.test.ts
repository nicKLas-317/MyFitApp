import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Exercise, MuscleGroup } from '../../domain/types';
import { openAppDb, Repository } from '../../storage/db';
import { buildBackup, parseJsonImport, planImport } from '../../transfer/backup';
import { SEED_EXERCISES, SEED_VERSION } from '../seed';
import { buildSearchIndex, searchExercises } from '../search';

const LIB: Exercise[] = [...SEED_EXERCISES];
const ids = (q: string) => searchExercises(buildSearchIndex(LIB), q).map((r) => r.entry.variant.id);
const secondary = (id: string) => LIB.find((e) => e.id === id)!.secondaryGroups;
const FLIES = ['pec-deck', 'ecarte-couche-halteres', 'ecarte-poulie'];
/** La bibliothèque telle qu'en version 9 : les écartés avaient les épaules en groupe secondaire. */
const V9 = LIB.map((e) => (FLIES.includes(e.id) ? { ...e, secondaryGroups: ['epaules'] as MuscleGroup[] } : e));

describe('Bibliothèque version 10 : groupes secondaires réellement sollicités (§4.0, §19.6)', () => {
  it('185. Les écartés n’ont plus les épaules en secondaire ; les mouvements composés gardent leur second groupe', () => {
    expect(SEED_VERSION).toBeGreaterThanOrEqual(10);
    for (const id of FLIES) expect(secondary(id), id).toEqual([]);
    expect(secondary('tractions-assistees')).toEqual(['biceps']);
    expect(secondary('tirage-vertical')).toEqual(['biceps']);
    expect(secondary('dips-assistes')).toEqual(['pectoraux']);
    expect(secondary('developpe-couche')).toEqual(['triceps', 'epaules']);
    for (const e of LIB) {
      expect(e.secondaryGroups, e.id).not.toContain(e.primaryGroup);
      expect(e.secondaryGroups, e.id).not.toContain('abdominaux');
    }
    // La recherche par groupe suit : « épaules » trouve les développés, plus les écartés.
    expect(ids('epaules')).toContain('developpe-couche');
    for (const id of FLIES) expect(ids('epaules'), id).not.toContain(id);
  });

  it('186. Base existante (version 9) : correction appliquée une seule fois, groupes personnalisés gardés ; une sauvegarde antérieure ne remet pas les épaules', async () => {
    const install = async (exercises: Exercise[]) => {
      const repo = new Repository(await openAppDb(`test-v10-${Math.random()}`));
      await repo.putExercises(exercises);
      await repo.setMeta('seeded', true);
      await repo.setMeta('seedVersion', 9);
      await repo.ensureSeed();
      return repo;
    };
    const repo = await install(V9);
    const after = await repo.loadExercises();
    expect(await repo.getMeta('seedVersion')).toBe(SEED_VERSION);
    for (const id of FLIES) expect(after.find((e) => e.id === id)?.secondaryGroups, id).toEqual([]);
    expect(after).toHaveLength(LIB.length);
    // Une seule fois : les épaules remises à la main sur le pec deck restent.
    const pecDeck = after.find((e) => e.id === 'pec-deck')!;
    await repo.putExercises([{ ...pecDeck, secondaryGroups: ['epaules'] }]);
    await repo.ensureSeed();
    expect((await repo.loadExercises()).find((e) => e.id === 'pec-deck')?.secondaryGroups).toEqual(['epaules']);
    repo.close();

    // Une sauvegarde d'avant la version 10, fusionnée : la version corrigée de l'appareil est gardée, sans conflit.
    const backup = parseJsonImport(JSON.stringify(buildBackup({ sessions: [], exercises: V9 }, 1)), LIB, '2026-10-22');
    if (backup.kind !== 'backup') throw new Error(backup.kind);
    const plan = planImport(backup.backup, { sessions: [], exercises: LIB }, { mode: 'merge' });
    for (const id of FLIES) expect(plan.exercises.find((e) => e.id === id), id).toBeUndefined();
    expect(plan.exerciseConflicts).toEqual([]);

    // Groupes personnalisés avant la mise à jour : conservés.
    const custom = await install(V9.map((e) => (e.id === 'ecarte-poulie' ? { ...e, secondaryGroups: ['epaules', 'triceps'] as MuscleGroup[] } : e)));
    expect((await custom.loadExercises()).find((e) => e.id === 'ecarte-poulie')?.secondaryGroups).toEqual(['epaules', 'triceps']);
    custom.close();
  });
});
