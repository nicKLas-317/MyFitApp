import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { SEED_EXERCISES, SEED_VERSION } from '../../library/seed';
import { addExercise, recordSet, setFeeling, startSession } from '../../session/ops';
import { DEFAULT_VARIANT_CONFIG } from '../../engine';
import { openAppDb, Repository } from '../db';

let n = 0;
const freshName = () => `test-db-${++n}`;

describe('Persistance IndexedDB (§12)', () => {
  it('45. Une séance en cours est restaurée après fermeture et réouverture', async () => {
    const name = freshName();
    const repo = new Repository(await openAppDb(name));
    let s = startSession(1_000, 'active-1');
    s = addExercise(s, 'tirage-vertical', { state: undefined, cfg: DEFAULT_VARIANT_CONFIG }, 1_000, 40).session;
    s = recordSet(s, 'tirage-vertical', 8, 2_000);
    s = setFeeling(s, 'tirage-vertical', 'bien', 3_000);
    await repo.putSession(s);
    repo.close();

    const reopened = new Repository(await openAppDb(name));
    const sessions = await reopened.loadSessions();
    expect(sessions).toEqual([s]);
    expect(sessions[0]?.startedAt).toBe(1_000); // base du chronomètre
    reopened.close();
  });

  it('chaque enregistrement remplace la version précédente de la séance', async () => {
    const repo = new Repository(await openAppDb(freshName()));
    const s = startSession(1_000, 'x');
    await repo.putSession(s);
    await repo.putSession({ ...s, name: 'Haut du corps' });
    expect((await repo.loadSessions()).map((x) => x.name)).toEqual(['Haut du corps']);
    await repo.deleteSession('x');
    expect(await repo.loadSessions()).toEqual([]);
    repo.close();
  });

  it('la bibliothèque initiale est installée une seule fois, sans écraser les modifications', async () => {
    const repo = new Repository(await openAppDb(freshName()));
    await repo.ensureSeed();
    const first = await repo.loadExercises();
    expect(first).toHaveLength(SEED_EXERCISES.length);

    const renamed = { ...first[0]!, name: 'Mon tirage' };
    await repo.putExercises([renamed]);
    await repo.ensureSeed();
    const again = await repo.loadExercises();
    expect(again).toHaveLength(SEED_EXERCISES.length);
    expect(again.find((e) => e.id === renamed.id)?.name).toBe('Mon tirage');
    repo.close();
  });

  it('85. Une base existante reçoit une seule fois les exercices ajoutés à la bibliothèque, sans recréer les supprimés', async () => {
    const repo = new Repository(await openAppDb(freshName()));
    // Base installée avec la version 1 : 17 exercices, puis « Crunch machine » supprimé par l'utilisateur.
    const v1 = SEED_EXERCISES.filter((e) => !['dips-assistes', 'ecarte-couche-halteres', 'crunch-machine'].includes(e.id));
    await repo.putExercises(v1);
    await repo.setMeta('seeded', true);
    await repo.ensureSeed();
    const ids = (await repo.loadExercises()).map((e) => e.id);
    expect(ids).toContain('dips-assistes');
    expect(ids).toContain('ecarte-couche-halteres');
    expect(ids).not.toContain('crunch-machine');
    expect(await repo.getMeta('seedVersion')).toBe(SEED_VERSION);
    // Exercice ajouté puis supprimé : pas réinstallé au lancement suivant.
    await repo.deleteExercise('ecarte-couche-halteres');
    await repo.ensureSeed();
    expect((await repo.loadExercises()).map((e) => e.id)).not.toContain('ecarte-couche-halteres');
    const dips = (await repo.loadExercises()).find((e) => e.id === 'dips-assistes');
    expect(dips).toMatchObject({ primaryGroup: 'triceps', secondaryGroups: ['pectoraux'], variants: [{ config: { assisted: true } }] });
    repo.close();
  });

  it('une écriture en échec est signalée par une promesse rejetée', async () => {
    const repo = new Repository(await openAppDb(freshName()));
    repo.close();
    await expect(repo.putSession(startSession(1_000))).rejects.toThrow();
  });
});
