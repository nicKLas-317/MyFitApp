import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { weeklyRecap } from '../../analysis/weekly';
import type { Exercise, Session } from '../../domain/types';
import { openAppDb, Repository } from '../../storage/db';
import { buildBackup, parseJsonImport, planImport } from '../../transfer/backup';
import { draftFromNotes } from '../../transfer/draft';
import { matchExercise } from '../../transfer/match';
import { SEED_ADDITIONS, SEED_EXERCISES, SEED_VERSION } from '../seed';
import { buildSearchIndex, searchExercises } from '../search';
import { nameKey } from '../text';

const LIB: Exercise[] = [...SEED_EXERCISES];
const INDEX = buildSearchIndex(LIB);
const ids = (q: string) => searchExercises(INDEX, q).map((r) => r.entry.variant.id);
const choiceOf = (name: string) => {
  const c = draftFromNotes(`${name}\n3x10x40kg +`, LIB, '2026-10-16').exercises[0]!.choice;
  return c?.kind === 'variant' ? c.variantId : null;
};
const NEW = ['curl-biceps-barre-droite', 'mollets-machine', 'abducteurs-machine', 'adducteurs-machine'];
const LEGS = ['abducteurs-machine', 'adducteurs-machine', 'chaise', 'curl-ischios', 'hack-squat', 'leg-curl', 'leg-extension', 'mollets-machine', 'mollets-machine--assis', 'presse-a-cuisses', 'squat-kettlebell'];

describe('Bibliothèque version 7 : curl à la barre, mollets, abducteurs, adducteurs (§4.0)', () => {
  it('147. Les quatre exercices, leurs groupes et leur matériel ; le curl à la barre est distinct des curls aux haltères et à la poulie', () => {
    const byId = (id: string) => LIB.find((e) => e.id === id)!;
    expect(byId('curl-biceps-barre-droite')).toMatchObject({ name: 'Curl biceps barre droite', primaryGroup: 'biceps', secondaryGroups: [], equipment: 'barre' });
    expect(byId('mollets-machine')).toMatchObject({ name: 'Mollets machine', primaryGroup: 'jambes', secondaryGroups: ['mollets'], equipment: 'machine' });
    expect(byId('abducteurs-machine')).toMatchObject({ name: 'Abducteurs machine', primaryGroup: 'jambes', secondaryGroups: ['fessiers'], equipment: 'machine' });
    expect(byId('adducteurs-machine')).toMatchObject({ name: 'Adducteurs machine', primaryGroup: 'jambes', secondaryGroups: ['adducteurs'], equipment: 'machine' });
    for (const id of NEW.filter((x) => x !== 'mollets-machine')) expect(byId(id).variants, id).toEqual([{ id, name: 'Standard', synonyms: [], archived: false }]);
    // Version 8 : machine debout (variante standard) et machine assise.
    expect(byId('mollets-machine').variants.map((v) => [v.id, v.name])).toEqual([['mollets-machine', 'Debout'], ['mollets-machine--assis', 'Assis']]);
    expect(SEED_ADDITIONS[7]).toEqual(NEW);
    // Curl à la barre : recherche et import, sans jamais retenir un autre curl.
    for (const q of ['curl barre', 'curl barre droite', 'curl à la barre', 'barbell curl', 'straight bar curl']) {
      expect(ids(q)[0], q).toBe('curl-biceps-barre-droite');
      expect(choiceOf(q), q).toBe('curl-biceps-barre-droite');
    }
    // Version 8 : « curl biceps barre » hésite entre la barre droite (proposée d'abord) et la barre EZ.
    expect(ids('curl biceps barre').slice(0, 2)).toEqual(['curl-biceps-barre-droite', 'curl-biceps-barre-ez']);
    expect(matchExercise('curl biceps barre', LIB).candidates.slice(0, 2).map((c) => c.variantId)).toEqual(['curl-biceps-barre-droite', 'curl-biceps-barre-ez']);
    expect(ids('curl haltères')).not.toContain('curl-biceps-barre-droite');
    expect(ids('curl poulie')).toEqual(['curl-biceps-poulie-corde']);
    expect(ids('curl biceps').slice(0, 5).sort()).toEqual(['curl-biceps-banc-incline', 'curl-biceps-barre-droite', 'curl-biceps-barre-ez', 'curl-biceps-halteres', 'curl-biceps-poulie-corde']);
    expect(matchExercise('curl biceps', LIB)).toMatchObject({ confidence: 'ambiguous', suggestion: null });
    // Tous les exercices restent distincts une fois le lexique appliqué.
    const keys = LIB.flatMap((e) => [e.name, ...e.synonyms].map((n) => [nameKey(n), e.id] as const));
    for (const [key, id] of keys) expect(keys.filter(([k, other]) => k === key && other !== id), key).toEqual([]);
  });

  it('148. Lexique : mollets, fessiers et adducteurs sont des sous-groupes des jambes ; « jambes » et « legs » trouvent tous les exercices de jambes', () => {
    // Machine debout (variante standard) en tête, machine assise ensuite (version 8).
    for (const q of ['mollet', 'mollets', 'calf', 'calves']) expect(ids(q), q).toEqual(['mollets-machine', 'mollets-machine--assis']);
    for (const q of ['fessier', 'fessiers', 'fesses', 'glutes']) expect(ids(q), q).toEqual(['abducteurs-machine']);
    for (const q of ['adducteur', 'adducteurs', 'adductors']) expect(ids(q), q).toEqual(['adducteurs-machine']);
    for (const q of ['jambe', 'jambes', 'legs']) expect(ids(q).sort(), q).toEqual(LEGS);
    // Import : synonymes reconnus directement.
    for (const q of ['mollets', 'calf press', 'calf raise', 'extension mollets', 'presse mollets', 'machine à mollets', 'Mollets machine']) {
      expect(choiceOf(q), q).toBe('mollets-machine');
    }
    expect(choiceOf('presse à cuisses')).toBe('presse-a-cuisses');
    expect(choiceOf('fessiers machine')).toBe('abducteurs-machine');
    // Un sous-groupe seul, sans être un synonyme, propose ses exercices et demande de choisir.
    for (const q of ['fessiers', 'glutes']) {
      expect(matchExercise(q, LIB), q).toMatchObject({ confidence: 'ambiguous', suggestion: null });
      expect(matchExercise(q, LIB).candidates.map((c) => c.variantId), q).toEqual(['abducteurs-machine']);
    }
  });

  it('149. Abducteurs et adducteurs ne sont jamais confondus (abduction ≠ adduction), en recherche comme à l’import', () => {
    const abd = ['abducteurs', 'abducteur', 'abduction', 'machine abducteurs', 'hip abduction', 'abductor machine', 'abductors', 'Abducteurs machine'];
    const add = ['adducteurs', 'adducteur', 'adduction', 'machine adducteurs', 'hip adduction', 'adductor machine', 'adductors', 'Adducteurs machine'];
    for (const q of abd) {
      expect(ids(q), q).toEqual(['abducteurs-machine']);
      expect(choiceOf(q), q).toBe('abducteurs-machine');
    }
    for (const q of add) {
      expect(ids(q), q).toEqual(['adducteurs-machine']);
      expect(choiceOf(q), q).toBe('adducteurs-machine');
    }
    // Les deux mots ne diffèrent que d'une lettre : un mot connu n'est jamais lu comme une faute de frappe.
    expect(nameKey('Abducteurs machine')).not.toBe(nameKey('Adducteurs machine'));
    // Une vraie faute de frappe (mot inconnu) reste tolérée.
    expect(ids('extenzion triceps')).toEqual(expect.arrayContaining(['extension-triceps-poulie', 'extension-triceps-haltere-assis']));
  });

  it('150. Récapitulatif hebdomadaire : mollets, abducteurs et adducteurs comptent dans « Jambes », une fois par séance', () => {
    const t = new Date(2026, 9, 13, 18).getTime();
    const session = (id: string, start: number, variants: string[]): Session => ({
      id, name: 'J', date: '2026-10-13', startedAt: start, endedAt: start + 1, createdAt: start, updatedAt: start, origin: 'app', state: 'done',
      performances: variants.map((variantId) => ({ variantId, weightKg: 40, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' })),
    });
    const one = weeklyRecap([session('a', t, ['mollets-machine', 'abducteurs-machine', 'adducteurs-machine'])], LIB, t + 3_600_000);
    expect(one.cells.find((c) => c.group === 'jambes')).toMatchObject({ count: 1, color: 'orange' });
    expect(one.cells.map((c) => c.group)).toEqual(expect.not.arrayContaining(['mollets', 'fessiers', 'adducteurs']));
    const three = ['mollets-machine', 'abducteurs-machine', 'adducteurs-machine'].map((v, i) => session(`s${i}`, t + i, [v]));
    expect(weeklyRecap(three, LIB, t + 3_600_000).cells.find((c) => c.group === 'jambes')?.count).toBe(3);
    // Le curl à la barre compte dans « Biceps ».
    expect(weeklyRecap([session('b', t, ['curl-biceps-barre-droite'])], LIB, t + 3_600_000).cells.find((c) => c.group === 'biceps')?.count).toBe(1);
  });

  it('151. Installation existante (version 6) : les quatre exercices ajoutés une seule fois, sans perte ni recréation d’un exercice supprimé ; sauvegardes compatibles', async () => {
    const v6 = LIB.filter((e) => !NEW.includes(e.id)).map((e) =>
      e.id === 'leg-curl' ? { ...e, name: 'Ma machine ischios', variants: e.variants.map((v) => ({ ...v, synonyms: ['leg curl de la salle'] })) } : e,
    );
    const repo = new Repository(await openAppDb(`test-v7-${Math.random()}`));
    await repo.putExercises(v6);
    await repo.setMeta('seeded', true);
    await repo.setMeta('seedVersion', 6);
    const s: Session = {
      id: 'ancienne', name: 'Jambes', date: '2026-10-12', startedAt: 1, endedAt: 2, createdAt: 1, updatedAt: 1, origin: 'app', state: 'done',
      performances: [{ variantId: 'leg-curl', weightKg: 40, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' }],
    };
    await repo.putSession(s);
    await repo.ensureSeed();
    const after = await repo.loadExercises();
    expect(after).toHaveLength(LIB.length);
    for (const id of NEW) expect(after.find((e) => e.id === id), id).toEqual(LIB.find((e) => e.id === id));
    // Rien d'autre ne change : nom personnalisé, synonymes appris et séances conservés.
    for (const e of v6) expect(after.find((x) => x.id === e.id), e.id).toEqual(e);
    expect(await repo.loadSessions()).toEqual([s]);
    expect(await repo.getMeta('seedVersion')).toBe(SEED_VERSION);
    // Supprimé par l'utilisateur : jamais recréé.
    await repo.deleteExercise('mollets-machine');
    await repo.ensureSeed();
    expect((await repo.loadExercises()).map((e) => e.id)).not.toContain('mollets-machine');
    // Une sauvegarde de la version 6 ne retire rien ; une sauvegarde de la version 7 garde les nouveaux groupes.
    const old = parseJsonImport(JSON.stringify(buildBackup({ sessions: [s], exercises: v6 }, 1)), LIB, '2026-10-16');
    if (old.kind !== 'backup') throw new Error(old.kind);
    const plan = planImport(old.backup, { sessions: [s], exercises: LIB }, { mode: 'merge' });
    expect(plan.exercises.filter((e) => NEW.includes(e.id))).toEqual([]);
    const fresh = parseJsonImport(JSON.stringify(buildBackup({ sessions: [], exercises: LIB }, 1)), [], '2026-10-16');
    if (fresh.kind !== 'backup') throw new Error(fresh.kind);
    expect(fresh.backup.exercises.find((e) => e.id === 'adducteurs-machine')?.secondaryGroups).toEqual(['adducteurs']);
    repo.close();
  });
});
