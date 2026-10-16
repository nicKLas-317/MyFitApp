import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { weeklyRecap } from '../../analysis/weekly';
import { openAppDb, Repository } from '../../storage/db';
import { buildBackup, parseJsonImport, planImport } from '../../transfer/backup';
import type { Exercise } from '../../domain/types';
import { rebuildProfile } from '../../engine';
import { buildEngineSettings } from '../catalog';
import { SEED_EXERCISES, SEED_VERSION } from '../seed';
import { buildSearchIndex, searchExercises, searchWithInfo } from '../search';
import { canonicalName, nameKey } from '../text';
import lexique from '../lexique.json';
import { matchExercise } from '../../transfer/match';
import { draftFromNotes, draftProblems, setDraftDate, updateDraftExercise } from '../../transfer/draft';

const LIB: Exercise[] = [...SEED_EXERCISES];
const INDEX = buildSearchIndex(LIB);
const ids = (q: string) => searchExercises(INDEX, q).map((r) => r.entry.variant.id);
const imported = (name: string) => draftFromNotes(`${name}\n3x8x10kg +`, LIB, '2026-10-16').exercises[0]!;
const choiceOf = (name: string) => {
  const c = imported(name).choice;
  return c?.kind === 'variant' ? c.variantId : null;
};
const PECS = ['chest-press', 'pec-deck', 'developpe-couche', 'ecarte-couche-halteres'];

describe('Lexique d’équivalences (§4.2.1)', () => {
  it('125. Recherche : saisies en français, anglais et argot de salle', () => {
    for (const q of ['latéral raise haltère', 'lateral raise dumbbell', 'élévation latérale DB', 'élévation latérale haltères']) {
      expect(ids(q), q).toEqual(['elevations-laterales']);
    }
    expect(ids('curl biceps haltère')).toEqual(['curl-biceps-halteres', 'curl-biceps-banc-incline']);
    expect(ids('pec fly machine')).toEqual(['pec-deck']);
    expect(ids('rowing haltère')).toEqual(['rowing-haltere']);
    expect(ids('développé épaules machine')[0]).toBe('developpe-epaules-machine');
    expect(ids('shoulder press')[0]).toBe('developpe-epaules-machine');
    // Recherche par groupe : tous les exercices de pectoraux, quelle que soit l'écriture.
    for (const q of ['pec', 'pecs', 'pectoraux', 'chest', 'pecto']) expect(ids(q), q).toEqual(expect.arrayContaining(PECS));
    // « pec » dans « pec deck » ou « pec fly » désigne l'exercice précis.
    expect(ids('pec deck')).toEqual(['pec-deck']);
    expect(ids('pec fly')).toEqual(['pec-deck']);
    // Autres groupes du lexique.
    expect(ids('delts')).toEqual(expect.arrayContaining(['developpe-epaules-machine', 'elevations-laterales', 'elevations-laterales-machine']));
    expect(ids('abs')).toEqual(['crunch-machine']);
    expect(ids('tris').slice(0, 2).sort()).toEqual(['extension-triceps-haltere-assis', 'extension-triceps-poulie']);
    expect(ids('legs').sort()).toEqual(['abducteurs-machine', 'adducteurs-machine', 'curl-ischios', 'leg-curl', 'leg-extension', 'mollets-machine', 'presse-a-cuisses']);
    expect(ids('lat pull')[0]).toBe('tirage-vertical');
    expect(ids('seated row')[0]).toBe('tirage-horizontal');
  });

  it('126. Import : les mêmes saisies sont reconnues, un nom de groupe seul demande de choisir', () => {
    for (const q of ['latéral raise haltère', 'lateral raise dumbbell', 'élévation latérale DB', 'élévation latérale haltères']) {
      expect(matchExercise(q, LIB), q).toMatchObject({ confidence: 'certain', suggestion: 'elevations-laterales', unknownWords: [] });
    }
    expect(choiceOf('curl biceps haltère')).toBe('curl-biceps-halteres');
    expect(choiceOf('pec fly machine')).toBe('pec-deck');
    expect(choiceOf('rowing haltère')).toBe('rowing-haltere');
    expect(choiceOf('développé épaules machine')).toBe('developpe-epaules-machine');
    expect(choiceOf('shoulder press')).toBe('developpe-epaules-machine');
    for (const q of ['pec', 'pecs', 'pectoraux']) {
      const m = matchExercise(q, LIB);
      expect(m.confidence, q).toBe('ambiguous');
      expect(m.candidates.map((c) => c.variantId).sort(), q).toEqual([...PECS].sort());
      expect(choiceOf(q), q).toBeNull();
    }
    // Les machines voisines restent distinctes.
    expect(choiceOf('leg curl')).toBe('leg-curl');
    expect(choiceOf('curl ischios')).toBe('curl-ischios');
    expect(choiceOf('lying leg curl')).toBe('curl-ischios');
    expect(choiceOf('élévations latérales machine')).toBe('elevations-laterales-machine');
    // Sans matériel précisé, toujours un choix à faire (§4.0).
    expect(choiceOf('Epaules latéral raise')).toBeNull();
  });

  it('127. Un mot de matériel départage les variantes, sans exclure quand aucune ne l’a', () => {
    expect(ids('élévations latérales')).toEqual(expect.arrayContaining(['elevations-laterales', 'elevations-laterales-machine']));
    expect(ids('latéral raise haltère')).not.toContain('elevations-laterales-machine');
    expect(ids('latéral raise machine')).toEqual(['elevations-laterales-machine']);
    expect(ids('écarté machine')).toEqual(['pec-deck']);
    expect(ids('curl poulie')).toEqual(['curl-biceps-poulie-corde']);
    // Le tirage vertical est à la poulie : « machine » ne l'exclut pas, aucun autre tirage vertical n'étant une machine.
    expect(ids('tirage vertical machine')).toEqual(['tirage-vertical', 'tirage-vertical--prise-serree', 'tirage-vertical--prise-tres-large']);
    expect(choiceOf('latéral raise haltère')).toBe('elevations-laterales');
    expect(choiceOf('lateral raise machine')).toBe('elevations-laterales-machine');
    expect(matchExercise('curl biceps poulie', LIB).suggestion).toBe('curl-biceps-poulie-corde');
  });

  it('128. Mot inconnu : la recherche l’ignore si les autres suffisent ; l’import propose et demande confirmation', () => {
    const found = searchWithInfo(INDEX, 'élévation latérale haltères xyz');
    expect(found.results.map((r) => r.entry.variant.id)).toEqual(['elevations-laterales']);
    expect(found.ignored).toEqual(['xyz']);
    expect(searchWithInfo(INDEX, 'curl biceps marteau').ignored).toEqual(['marteau']);
    // Un seul mot reconnu ne suffit pas à identifier un exercice.
    expect(ids('tirage nuque')).toEqual([]);
    expect(searchWithInfo(INDEX, 'latéral raise haltère').ignored).toEqual([]);

    const entry = imported('élévation latérale haltères xyz');
    expect(entry.match).toMatchObject({ confidence: 'probable', suggestion: 'elevations-laterales', unknownWords: ['xyz'] });
    expect(entry.choice).toEqual({ kind: 'variant', variantId: 'elevations-laterales' });
    const ctx = { exercises: LIB, sessions: [], profile: rebuildProfile([], buildEngineSettings(LIB)).profile };
    const draft = setDraftDate(draftFromNotes('élévation latérale haltères xyz\n3x8x10kg +', LIB, '2026-10-16'), '2026-10-14');
    const blocking = draftProblems(draft, ctx).filter((p) => p.level === 'error');
    expect(blocking.map((p) => p.message)).toEqual(['À confirmer : Mot non reconnu : « xyz ». Vérifiez l’exercice proposé.']);
    const confirmed = updateDraftExercise(draft, draft.exercises[0]!.key, { checksConfirmed: true });
    expect(draftProblems(confirmed, ctx).filter((p) => p.level === 'error')).toEqual([]);
    // « Tirage nuque » n'est pas un tirage vertical : choix obligatoire.
    expect(matchExercise('Tirage nuque', LIB).suggestion).toBeNull();
  });

  it('129. Le lexique est un fichier de données : chaque écriture a la forme de sa référence, sur la saisie comme sur la bibliothèque', () => {
    for (const [reference, variants] of Object.entries(lexique.equivalences)) {
      for (const v of variants) expect(canonicalName(v), `${v} → ${reference}`).toBe(canonicalName(reference));
    }
    expect(nameKey('Latéral raises haltère')).toBe(nameKey('Élévations latérales haltères'));
    expect(canonicalName('PECS')).toBe(canonicalName('pectoraux'));
    // Expressions protégées : leurs mots ne sont pas remplacés.
    expect(canonicalName('pec deck')).not.toBe(canonicalName('pectoraux deck'));
    expect(nameKey('Leg curl')).not.toBe(nameKey('Curl ischios'));
    // Les exercices de la bibliothèque restent tous distincts une fois le lexique appliqué.
    const names = LIB.map((e) => nameKey(e.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it('131. Sous-groupes des jambes : « ischios » → leg curl et curl ischios, « quadri » → leg extension et presse, « jambes » → tous ; le récapitulatif compte tout dans « Jambes »', () => {
    for (const q of ['ischio', 'ischios', 'ischio-jambiers', 'hamstrings']) expect(ids(q).sort(), q).toEqual(['curl-ischios', 'leg-curl']);
    for (const q of ['quadri', 'quadriceps', 'quads']) expect(ids(q).sort(), q).toEqual(['leg-extension', 'presse-a-cuisses']);
    for (const q of ['jambe', 'jambes', 'legs']) expect(ids(q).sort(), q).toEqual(['abducteurs-machine', 'adducteurs-machine', 'curl-ischios', 'leg-curl', 'leg-extension', 'mollets-machine', 'presse-a-cuisses']);
    // Import : un sous-groupe seul propose ses exercices et demande de choisir.
    expect(matchExercise('ischios', LIB)).toMatchObject({ confidence: 'ambiguous', suggestion: null });
    expect(matchExercise('ischios', LIB).candidates.map((c) => c.variantId).sort()).toEqual(['curl-ischios', 'leg-curl']);
    expect(matchExercise('quadri', LIB).candidates.map((c) => c.variantId).sort()).toEqual(['leg-extension', 'presse-a-cuisses']);
    // Les noms précis restent reconnus.
    expect(choiceOf('curl ischios')).toBe('curl-ischios');
    expect(choiceOf('leg extension')).toBe('leg-extension');
    // Récapitulatif hebdomadaire : groupe principal seulement, inchangé.
    const t = new Date(2026, 9, 13, 18).getTime();
    const sessions = ['leg-curl', 'presse-a-cuisses'].map((variantId, i) => ({
      id: `j${i}`, name: 'J', date: '2026-10-13', startedAt: t + i, endedAt: t + i + 1, createdAt: t, updatedAt: t,
      origin: 'app' as const, state: 'done' as const,
      performances: [{ variantId, weightKg: 40, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' as const }],
    }));
    expect(weeklyRecap(sessions, LIB, t + 3_600_000).cells.find((c) => c.group === 'jambes')?.count).toBe(2);
  });

  it('132. Bibliothèque version 5 : la presse perd les ischio-jambiers une seule fois, sauf personnalisation ; une ancienne sauvegarde ne les réintroduit pas', async () => {
    const presse = LIB.find((e) => e.id === 'presse-a-cuisses')!;
    expect(presse.secondaryGroups).toEqual(['quadriceps']);
    const v4 = LIB.map((e) => (e.id === 'presse-a-cuisses' ? { ...e, secondaryGroups: ['quadriceps', 'ischio-jambiers'] as typeof e.secondaryGroups } : e));
    const install = async (exercises: Exercise[]) => {
      const repo = new Repository(await openAppDb(`test-lexique-${Math.random()}`));
      await repo.putExercises(exercises);
      await repo.setMeta('seeded', true);
      await repo.setMeta('seedVersion', 4);
      await repo.ensureSeed();
      return repo;
    };
    const repo = await install(v4);
    expect((await repo.loadExercises()).find((e) => e.id === 'presse-a-cuisses')?.secondaryGroups).toEqual(['quadriceps']);
    expect(await repo.getMeta('seedVersion')).toBe(SEED_VERSION);
    // Une sauvegarde d'avant la version 5 garde la version de l'appareil.
    const backup = parseJsonImport(JSON.stringify(buildBackup({ sessions: [], exercises: v4 }, 1)), LIB, '2026-10-16');
    if (backup.kind !== 'backup') throw new Error(backup.kind);
    const plan = planImport(backup.backup, { sessions: [], exercises: await repo.loadExercises() }, { mode: 'merge' });
    expect(plan.exercises.find((e) => e.id === 'presse-a-cuisses')).toBeUndefined();
    expect(plan.exerciseConflicts).toEqual([]);
    repo.close();
    // Groupes personnalisés par l'utilisateur : conservés.
    const custom = await install(v4.map((e) => (e.id === 'presse-a-cuisses' ? { ...e, secondaryGroups: ['ischio-jambiers'] as typeof e.secondaryGroups } : e)));
    expect((await custom.loadExercises()).find((e) => e.id === 'presse-a-cuisses')?.secondaryGroups).toEqual(['ischio-jambiers']);
    custom.close();
  });

  it('133. « seated row », « row assis » et « tirage horizontal » → Tirage horizontal ; « rowing haltère » et « dumbbell row » → Rowing haltère', () => {
    for (const q of ['seated row', 'row assis', 'tirage horizontal']) {
      expect(ids(q)[0], q).toBe('tirage-horizontal');
      expect(ids(q), q).not.toContain('rowing-haltere');
      expect(choiceOf(q), q).toBe('tirage-horizontal');
    }
    for (const q of ['rowing haltère', 'dumbbell row']) {
      expect(ids(q), q).toEqual(['rowing-haltere']);
      expect(choiceOf(q), q).toBe('rowing-haltere');
    }
  });
});
