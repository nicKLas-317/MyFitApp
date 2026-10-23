import { describe, expect, it } from 'vitest';
import departJson from '../../../docs/exemples/depart-exemple.json?raw';
import type { Exercise } from '../../domain/types';
import { rebuildProfile } from '../../engine';
import { buildEngineSettings } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { parseJsonImport, planImport } from '../../transfer/backup';
import { checkImportFile, MAX_IMPORT_BYTES } from '../../transfer/file';
import { analyzeProgress, chartSeries } from '../progress';

describe('Bilan après import des données de départ (§19.3)', () => {
  it('140. Deux séances vertes au même palier (triceps haltère assis) : « En progression » ; une seule séance : « Trop tôt » ; graphique dès un point', () => {
    const parsed = parseJsonImport(departJson, [...SEED_EXERCISES], '2026-10-16');
    if (parsed.kind !== 'backup') throw new Error(parsed.kind);
    const plan = planImport(parsed.backup, { sessions: [], exercises: [...SEED_EXERCISES] }, { mode: 'merge' });
    const exercises: Exercise[] = [...SEED_EXERCISES.map((e) => plan.exercises.find((x) => x.id === e.id) ?? e), ...plan.exercises.filter((x) => !SEED_EXERCISES.some((e) => e.id === x.id))];
    const replay = rebuildProfile(plan.sessions, buildEngineSettings(exercises));
    const progress = analyzeProgress(replay.evaluations, replay.profile);
    const triceps = progress.find((p) => p.variantId === 'extension-triceps-haltere-assis');
    expect(triceps).toMatchObject({ category: 'progressing', sessions: 2, validated: 1 });
    expect(replay.profile.variants['extension-triceps-haltere-assis']?.recommendation).toMatchObject({ kind: 'reps_up', targetReps: 9 });
    // Les autres exercices n'ont qu'une séance chacun.
    expect(progress.filter((p) => p.category !== 'progressing').every((p) => p.category === 'new' && p.sessions === 1)).toBe(true);
    // Graphique d'évolution : un point dès la première séance, deux pour le triceps.
    expect(chartSeries('chest-press', plan.sessions, replay.evaluations)).toHaveLength(1);
    expect(chartSeries('extension-triceps-haltere-assis', plan.sessions, replay.evaluations).map((p) => p.weightKg)).toHaveLength(2);
  });
});

describe('Fichier choisi pour l’import (§11.1)', () => {
  it('141. Aucun filtre de type : un .json (même reçu sans type), du texte ou des notes sont acceptés ; un fichier vide, binaire, tronqué ou trop gros est refusé avec un message clair', () => {
    expect(checkImportFile('sauvegarde.json', departJson.length, departJson)).toBeNull();
    expect(checkImportFile('myfitapp-sauvegarde (1)', departJson.length, departJson)).toBeNull();
    expect(checkImportFile('notes.txt', 30, 'Pec deck\n3x8x30kg ++')).toBeNull();
    expect(checkImportFile('vide.json', 0, '  ')).toMatch(/vide/);
    expect(checkImportFile('tronque.json', 20, '{"app": "MyFitApp", "sess')).toMatch(/illisible ou incomplet/);
    expect(checkImportFile('photo.jpg', 100, '\u0000\u0001JFIF\u0000��'.repeat(10))).toMatch(/n’est pas une sauvegarde MyFitApp/);
    expect(checkImportFile('enorme.json', MAX_IMPORT_BYTES + 1, '{}')).toMatch(/trop volumineux/);
  });
});
