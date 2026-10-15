import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import departJson from '../../../docs/exemples/depart-exemple.json?raw';
import { rebuildProfile, resolveConfig } from '../../engine';
import { buildEngineSettings } from '../../library/catalog';
import { openAppDb, Repository } from '../../storage/db';
import { parseJsonImport, planImport } from '../backup';

/** Code de l'application (hors tests), pour vérifier qu'aucun fichier ne charge les données de départ. */
const APP_SOURCES = import.meta.glob<string>(['../../**/*.{ts,tsx}', '!../../**/__tests__/**', '../../../index.html'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('88. Données de départ docs/exemples/depart-exemple.json', () => {
  it('s’importe dans une base vide et donne le profil attendu', async () => {
    const parsed = parseJsonImport(departJson, [], '2026-10-16');
    expect(parsed.kind).toBe('backup');
    if (parsed.kind !== 'backup') return;

    const repo = new Repository(await openAppDb('test-depart'));
    await repo.ensureSeed();
    const plan = planImport(parsed.backup, { sessions: [], exercises: await repo.loadExercises() }, { mode: 'merge' });
    expect(plan.blocking).toEqual([]);
    await repo.applyImport(plan);
    const sessions = await repo.loadSessions();
    const exercises = await repo.loadExercises();
    repo.close();

    expect(sessions.map((s) => s.date).sort()).toEqual(['2026-03-09', '2026-03-12']);
    expect(sessions.flatMap((s) => s.performances)).toHaveLength(12);
    const settings = buildEngineSettings(exercises);
    const { profile, evaluations } = rebuildProfile(sessions, settings);

    // Triceps haltère assis : deux séances vertes à 3×8 → 3×9 à 14 kg.
    expect(profile.variants['extension-triceps-haltere-assis']).toMatchObject({
      palier: { weightKg: 14, targetReps: 8 },
      greenStreak: 2,
      recommendation: { kind: 'reps_up', targetReps: 9, plannedSets: 3 },
    });
    // Chest press : « += » stocké comme Moyen → orange, symbole conservé.
    const chest = sessions.find((s) => s.date === '2026-03-12')!.performances.find((p) => p.variantId === 'chest-press');
    expect(chest).toMatchObject({ weightKg: 47, feeling: 'moyen', feelingSymbol: '+=' });
    expect(profile.variants['chest-press']?.lastStatus).toBe('orange');
    // Dips assistés : réglage assisté, la charge est une aide.
    expect(resolveConfig(settings, 'dips-assistes').assisted).toBe(true);
    expect(exercises.find((e) => e.id === 'dips-assistes')?.variants[0]?.config).toEqual({ assisted: true });
    expect(profile.variants['dips-assistes']?.palier).toEqual({ weightKg: 27, targetReps: 8 });
    // Variantes distinctes, avec leur propre historique.
    expect(profile.variants['curl-biceps-banc-incline--70']?.palier).toEqual({ weightKg: 10, targetReps: 8 });
    expect(profile.variants['curl-biceps-banc-incline']).toBeUndefined();
    expect(profile.variants['tirage-vertical--prise-tres-large']?.palier).toEqual({ weightKg: 41, targetReps: 8 });
    expect(profile.variants['tirage-vertical']?.palier).toEqual({ weightKg: 36, targetReps: 9 });
    expect(profile.variants['ecarte-couche-halteres']?.palier).toEqual({ weightKg: 9, targetReps: 8 });
    // Élévations latérales : l'exemple est rattaché à la machine ; la version haltères n'a pas d'historique.
    expect(profile.variants['elevations-laterales-machine']?.palier).toEqual({ weightKg: 9, targetReps: 8 });
    expect(profile.variants['elevations-laterales']).toBeUndefined();
    const lateral = exercises.find((e) => e.id === 'elevations-laterales-machine')!;
    expect(lateral.variants[0]?.synonyms).toEqual(['Epaules latéral raise']);
    // Bibliothèque à jour : pas d'ancien nom ni de « Tirage nuque » réintroduits par l'import.
    expect(exercises.find((e) => e.id === 'elevations-laterales')?.name).toBe('Élévations latérales haltères');
    expect(exercises.find((e) => e.id === 'tirage-vertical')?.synonyms).toEqual(['Lat pulldown', 'Tirage poitrine']);
    expect(evaluations).toHaveLength(12);
    // Les noms de tes notes sont mémorisés pour les imports suivants.
    expect(exercises.find((e) => e.id === 'extension-triceps-haltere-assis')?.variants[0]?.synonyms).toEqual([
      'Triceps sur banc assis 1 haltere',
      'Triceps sur banc 1 haltere',
    ]);
  });

  it('n’est jamais chargé automatiquement par l’application', () => {
    const files = Object.keys(APP_SOURCES);
    expect(files.length).toBeGreaterThan(20);
    for (const [path, source] of Object.entries(APP_SOURCES)) {
      // Le code exécuté seulement : les commentaires peuvent citer les fichiers d'exemple.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
      expect(code.includes('mes-seances-depart'), path).toBe(false);
      expect(code.includes('seance-exemple'), path).toBe(false);
    }
  });
});
