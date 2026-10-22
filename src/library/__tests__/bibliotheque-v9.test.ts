import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { weeklyRecap } from '../../analysis/weekly';
import type { Exercise, Session } from '../../domain/types';
import { rebuildProfile } from '../../engine';
import { openAppDb, Repository } from '../../storage/db';
import { buildBackup, parseJsonImport, planImport } from '../../transfer/backup';
import { draftFromNotes } from '../../transfer/draft';
import { matchExercise } from '../../transfer/match';
import { buildEngineSettings, displayName, indexVariants } from '../catalog';
import { illustrationFor } from '../illustrations';
import { SEED_ADDITIONS, SEED_EXERCISES, SEED_VERSION } from '../seed';
import { buildSearchIndex, searchExercises } from '../search';

const LIB: Exercise[] = [...SEED_EXERCISES];
const INDEX = buildSearchIndex(LIB);
const VARIANTS = indexVariants(LIB);
const ids = (q: string) => searchExercises(INDEX, q).map((r) => r.entry.variant.id);
const choiceOf = (name: string) => {
  const c = draftFromNotes(`${name}\n3x8x50kg +`, LIB, '2026-10-22').exercises[0]!.choice;
  return c?.kind === 'variant' ? c.variantId : null;
};
const byId = (id: string) => LIB.find((e) => e.id === id)!;

const MACHINE = 'tirage-horizontal';
const POULIE = 'tirage-horizontal-poulie-basse';
const OLD_SYNONYMS = ['Seated row', 'Rowing assis', 'Tirage poulie basse'];
const NEW_SYNONYMS = [
  'Tirage horizontal', 'Tirage horizontal machine', 'Rowing machine', 'Rowing assis machine',
  'Seated row', 'Seated row machine', 'Chest supported row', 'Machine row',
];

/** Le tirage horizontal tel qu'en version 8 (tirage à la poulie basse), avec un synonyme appris de mes notes. */
const asV8 = (e: Exercise): Exercise =>
  e.id === MACHINE
    ? { ...e, name: 'Tirage horizontal', synonyms: [...OLD_SYNONYMS], variants: e.variants.map((v) => (v.id === MACHINE ? { ...v, synonyms: ['Seated row horizontal'] } : v)) }
    : e;
const V8 = LIB.filter((e) => e.id !== POULIE).map(asV8);

let n = 0;
function done(variantId: string, date: string, weightKg: number, feeling: Session['performances'][number]['feeling'] = 'bien'): Session {
  const t = new Date(`${date}T18:00:00`).getTime();
  return {
    id: `s${++n}`, name: 'Séance', date, startedAt: t, endedAt: t + 3_600_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: [{ variantId, weightKg, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling }],
  };
}

describe('Bibliothèque version 9 : tirage horizontal machine (appui pectoral) et poulie basse (§4.0)', () => {
  it('174. Le tirage horizontal garde son identifiant et devient la machine à appui pectoral ; la poulie basse est un exercice distinct', () => {
    expect(SEED_VERSION).toBe(9);
    expect(SEED_ADDITIONS[9]).toEqual([POULIE]);
    const machine = byId(MACHINE);
    expect(machine).toMatchObject({ name: 'Tirage horizontal machine (appui pectoral)', primaryGroup: 'dos', secondaryGroups: ['biceps'], equipment: 'machine' });
    expect(machine.synonyms).toEqual(NEW_SYNONYMS);
    const poulie = byId(POULIE);
    expect(poulie).toMatchObject({ name: 'Tirage horizontal poulie basse', primaryGroup: 'dos', secondaryGroups: ['biceps'], equipment: 'poulie' });
    expect(poulie.synonyms).toEqual(['Tirage poulie basse', 'Rowing poulie basse', 'Seated cable row', 'Cable row', 'Low row', 'Tirage horizontal poulie']);
    // Trois prises chacun, avec leur propre historique.
    for (const e of [machine, poulie]) {
      expect(e.variants.map((v) => [v.id, v.name])).toEqual([[e.id, 'Prise moyenne'], [`${e.id}--prise-tres-large`, 'Prise très large'], [`${e.id}--prise-serree`, 'Prise serrée']]);
    }
    expect(displayName(VARIANTS.get(MACHINE))).toBe('Tirage horizontal machine (appui pectoral) — Prise moyenne');
    expect(displayName(VARIANTS.get(`${POULIE}--prise-serree`))).toBe('Tirage horizontal poulie basse — Prise serrée');
    // Illustrations : le dessin du tirage à la poulie va à la poulie basse ; la machine (sans dessin libre) a un pictogramme.
    expect(illustrationFor(POULIE)?.title).toBe('Seated cable rows');
    expect(illustrationFor(POULIE, `${POULIE}--prise-tres-large`)?.title).toBe('Seated cable rows');
    for (const v of machine.variants) expect(illustrationFor(MACHINE, v.id), v.id).toBeUndefined();
  });

  it('175. « tirage horizontal » et « seated row » → la machine ; « poulie basse », « cable row », « câble » → la poulie basse', () => {
    const machineNames = ['tirage horizontal', 'seated row', 'Seated row horizontal', 'tirage horizontal machine', 'rowing machine', 'rowing assis machine', 'seated row machine', 'chest supported row', 'machine row'];
    for (const q of machineNames) {
      expect(ids(q)[0], q).toBe(MACHINE);
      expect(matchExercise(q, LIB), q).toMatchObject({ confidence: 'certain', suggestion: MACHINE });
      expect(choiceOf(q), q).toBe(MACHINE);
    }
    for (const q of ['tirage poulie basse', 'rowing poulie basse', 'seated cable row', 'cable row', 'low row', 'tirage horizontal câble', 'tirage horizontal cable', 'tirage horizontal poulie']) {
      expect(ids(q)[0], q).toBe(POULIE);
      expect(ids(q), q).not.toContain(MACHINE);
      expect(matchExercise(q, LIB), q).toMatchObject({ confidence: 'certain', suggestion: POULIE });
      expect(choiceOf(q), q).toBe(POULIE);
    }
    // « poulie basse » seul : la poulie basse seulement, proposée à l'import (à vérifier).
    expect(ids('poulie basse')).toEqual([POULIE, `${POULIE}--prise-serree`, `${POULIE}--prise-tres-large`]);
    expect(choiceOf('poulie basse')).toBe(POULIE);
    // « câble » seul est un matériel : il trouve la poulie basse parmi les exercices à la poulie, jamais la machine.
    expect(ids('câble')).toContain(POULIE);
    expect(ids('câble')).not.toContain(MACHINE);
    // Une prise reste une variante de son exercice.
    expect(choiceOf('seated row prise serrée')).toBe(`${MACHINE}--prise-serree`);
    expect(choiceOf('cable row wide grip')).toBe(`${POULIE}--prise-tres-large`);
    // « appui pectoral » et « chest supported » ne font pas de la machine un exercice de pectoraux.
    for (const q of ['pec', 'pecs', 'pectoraux', 'chest', 'pectoral']) expect(ids(q), q).not.toContain(MACHINE);
    expect(ids('appui pectoral')[0]).toBe(MACHINE);
    // Les deux tirages sont des exercices du dos, distincts dans le récapitulatif comme dans l'historique.
    expect(ids('dos')).toEqual(expect.arrayContaining([MACHINE, POULIE]));
    const r = rebuildProfile([done(MACHINE, '2026-10-12', 50), done(MACHINE, '2026-10-15', 50), done(POULIE, '2026-10-19', 40)], buildEngineSettings(LIB));
    expect(r.profile.variants[MACHINE]).toMatchObject({ greenStreak: 2, recommendation: { kind: 'reps_up', targetReps: 9 } });
    expect(r.profile.variants[POULIE]).toMatchObject({ greenStreak: 1, palier: { weightKg: 40, targetReps: 8 } });
    const recap = weeklyRecap([done(POULIE, '2026-10-19', 40)], LIB, new Date('2026-10-22T12:00:00').getTime());
    expect(recap.cells.find((c) => c.group === 'dos')?.count).toBe(1);
  });

  it('176. Installation existante (version 8) : renommage une seule fois, synonymes appris gardés, poulie basse ajoutée, séances rattachées à la machine', async () => {
    // Synonyme ajouté à la main sur l'exercice, en plus du synonyme appris de mes notes (sur la variante).
    const local = V8.map((e) => (e.id === MACHINE ? { ...e, synonyms: [...e.synonyms, 'Rowing Basic-Fit'] } : e));
    const repo = new Repository(await openAppDb(`test-v9-${Math.random()}`));
    await repo.putExercises(local);
    await repo.setMeta('seeded', true);
    await repo.setMeta('seedVersion', 8);
    const sessions = [done(MACHINE, '2026-10-12', 50), done(`${MACHINE}--prise-serree`, '2026-10-15', 45, 'moyen')];
    for (const s of sessions) await repo.putSession(s);
    const before = rebuildProfile(sessions, buildEngineSettings(local));

    await repo.ensureSeed();
    const after = await repo.loadExercises();
    expect(await repo.getMeta('seedVersion')).toBe(SEED_VERSION);
    const machine = after.find((e) => e.id === MACHINE)!;
    expect(machine.name).toBe('Tirage horizontal machine (appui pectoral)');
    expect(machine.equipment).toBe('machine');
    expect(machine.synonyms).toEqual([...NEW_SYNONYMS, 'Rowing Basic-Fit']);
    expect(machine.synonyms).not.toContain('Tirage poulie basse');
    // Variantes (prises), synonymes appris et identifiants inchangés.
    expect(machine.variants).toEqual(local.find((e) => e.id === MACHINE)!.variants);
    expect(machine.variants[0]!.synonyms).toEqual(['Seated row horizontal']);
    expect(after.find((e) => e.id === POULIE)).toEqual(byId(POULIE));
    expect(after).toHaveLength(LIB.length);
    // Séances et profil inchangés : tout reste sur la machine, la poulie basse n'a aucun historique.
    expect(await repo.loadSessions()).toEqual(sessions);
    const replay = rebuildProfile(await repo.loadSessions(), buildEngineSettings(after));
    expect(replay.profile).toEqual(before.profile);
    expect(replay.profile.variants[POULIE]).toBeUndefined();
    // L'import de mes notes retrouve toujours la machine grâce au synonyme appris.
    expect(matchExercise('Seated row horizontal', after)).toMatchObject({ suggestion: MACHINE });

    // Une seule fois : relancer ne change rien, une poulie basse supprimée n'est pas recréée, un renommage ultérieur reste.
    await repo.deleteExercise(POULIE);
    await repo.putExercises([{ ...machine, name: 'Rowing de ma salle' }]);
    await repo.ensureSeed();
    const again = await repo.loadExercises();
    expect(again.map((e) => e.id)).not.toContain(POULIE);
    expect(again.find((e) => e.id === MACHINE)!.name).toBe('Rowing de ma salle');
    repo.close();

    // Nom personnalisé avant la migration : gardé ; les synonymes sont tout de même corrigés.
    const custom = new Repository(await openAppDb(`test-v9-${Math.random()}`));
    await custom.putExercises(V8.map((e) => (e.id === MACHINE ? { ...e, name: 'Mon rowing' } : e)));
    await custom.setMeta('seeded', true);
    await custom.setMeta('seedVersion', 8);
    await custom.ensureSeed();
    const mine = (await custom.loadExercises()).find((e) => e.id === MACHINE)!;
    expect(mine.name).toBe('Mon rowing');
    expect(mine.synonyms).toEqual(NEW_SYNONYMS);
    custom.close();
  });

  it('177. Une sauvegarde antérieure ne réintroduit pas l’ancien tirage horizontal, en fusion comme en remplacement', () => {
    const sessions = [done(MACHINE, '2026-10-12', 50)];
    const withAdded = V8.map((e) => (e.id === MACHINE ? { ...e, synonyms: [...e.synonyms, 'Rowing Basic-Fit'] } : e));
    for (const exercises of [V8, withAdded]) {
      const parsed = parseJsonImport(JSON.stringify(buildBackup({ sessions, exercises }, 1)), LIB, '2026-10-22');
      if (parsed.kind !== 'backup') throw new Error(parsed.kind);
      const migrated = parsed.backup.exercises.find((e) => e.id === MACHINE)!;
      expect(migrated.name).toBe('Tirage horizontal machine (appui pectoral)');
      expect(migrated.synonyms).not.toContain('Tirage poulie basse');
      expect(migrated.variants[0]!.synonyms).toEqual(['Seated row horizontal']);
      for (const mode of ['merge', 'replace'] as const) {
        const plan = planImport(parsed.backup, { sessions: [], exercises: LIB }, { mode });
        const machine = plan.exercises.find((e) => e.id === MACHINE);
        if (machine) {
          expect(machine.name, mode).toBe('Tirage horizontal machine (appui pectoral)');
          expect(machine.synonyms, mode).toEqual(expect.arrayContaining(NEW_SYNONYMS));
          expect(machine.synonyms, mode).not.toContain('Tirage poulie basse');
          expect(machine.variants[0]!.synonyms, mode).toContain('Seated row horizontal');
        }
        // Les séances importées restent sur la machine.
        expect(plan.sessions.map((s) => s.performances[0]!.variantId), mode).toEqual([MACHINE]);
      }
    }
  });
});
