import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import sampleJson from '../../../docs/exemples/seance-exemple-1.json?raw';
import type { Exercise, Session } from '../../domain/types';
import { DEFAULT_VARIANT_CONFIG, EMPTY_PROFILE, rebuildProfile } from '../../engine';
import { buildEngineSettings } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { addExercise, finishSession, recordSet, setFeeling, startSession } from '../../session/ops';
import { openAppDb, Repository } from '../../storage/db';
import {
  BACKUP_REMINDER_MS,
  buildBackup,
  needsBackupReminder,
  parseJsonImport,
  planImport,
} from '../backup';
import { draftFromNotes, draftProblems, finalizeDrafts, hasBlockingProblems, previewEvaluations, setDraftDate } from '../draft';
import { NOTES_11_3 } from './fixtures';

const TODAY = '2026-10-15';
const LIB: Exercise[] = [...SEED_EXERCISES];
let dbCount = 0;
const freshRepo = async () => new Repository(await openAppDb(`test-backup-${++dbCount}`));

/** Jeu de données varié : séance saisie, séance importée avec nouvelle variante et synonyme appris. */
function sampleData(): { sessions: Session[]; exercises: Exercise[] } {
  const ctx = { state: undefined, cfg: DEFAULT_VARIANT_CONFIG };
  let s = startSession(Date.UTC(2026, 9, 1, 16), 'app-1');
  s = addExercise(s, 'chest-press', ctx, s.startedAt!, 30).session;
  for (const r of [8, 8, 8]) s = recordSet(s, 'chest-press', r, s.startedAt! + 1);
  s = setFeeling(s, 'chest-press', 'tres_bien', s.startedAt! + 2);
  const done = finishSession(s, s.startedAt! + 3_600_000).session;

  const draft = setDraftDate(draftFromNotes(`${NOTES_11_3}\n\nCurl biceps\n3x8x14kg +`, LIB, TODAY), '2026-10-12');
  const fixed = {
    ...draft,
    exercises: draft.exercises.map((e) =>
      e.sourceName === 'Curl biceps' ? { ...e, choice: { kind: 'variant' as const, variantId: 'curl-biceps-halteres' } } : e,
    ),
  };
  const result = finalizeDrafts([fixed], LIB, [done], Date.UTC(2026, 9, 13));
  const exercises = LIB.map((e) => result.exercises.find((x) => x.id === e.id) ?? e);
  return { sessions: [done, ...result.sessions], exercises };
}

const settingsOf = (exercises: readonly Exercise[]) => buildEngineSettings(exercises);

describe('Export et import JSON (§11.9, §11.10)', () => {
  it('31. L’import d’un JSON valide restaure correctement les données', async () => {
    const data = sampleData();
    const text = JSON.stringify(buildBackup(data, Date.UTC(2026, 9, 14)));
    const parsed = parseJsonImport(text, LIB, TODAY);
    expect(parsed.kind).toBe('backup');
    if (parsed.kind !== 'backup') return;

    const repo = await freshRepo();
    await repo.ensureSeed();
    const plan = planImport(parsed.backup, { sessions: [], exercises: await repo.loadExercises() }, { mode: 'merge' });
    expect(plan.blocking).toEqual([]);
    await repo.applyImport(plan);
    const sessions = await repo.loadSessions();
    expect(sessions.sort((a, b) => a.id.localeCompare(b.id))).toEqual([...data.sessions].sort((a, b) => a.id.localeCompare(b.id)));
    const exercises = await repo.loadExercises();
    expect(exercises.find((e) => e.id === 'curl-biceps-halteres')?.variants[0]?.synonyms).toEqual(['Curl biceps']);
    repo.close();
  });

  it('32. Un JSON invalide est signalé sans altérer les données existantes', async () => {
    const repo = await freshRepo();
    await repo.ensureSeed();
    const before = sampleData();
    await repo.applyImport(before);
    const snapshot = { sessions: await repo.loadSessions(), exercises: await repo.loadExercises() };

    const broken = parseJsonImport('{"app": "MyFitApp", "schemaVersion": 2, "sessions": [', LIB, TODAY);
    expect(broken).toMatchObject({ kind: 'error' });
    const backup = buildBackup(before, 1);
    const invalid = { ...backup, sessions: [{ ...backup.sessions[0]!, performances: [{ variantId: 'inconnu', weightKg: -3 }] }] };
    const rejected = parseJsonImport(JSON.stringify(invalid), LIB, TODAY);
    expect(rejected.kind).toBe('error');
    if (rejected.kind === 'error') expect(rejected.details.join(' ')).toMatch(/weightKg invalide/);
    expect(parseJsonImport(JSON.stringify({ ...backup, schemaVersion: 9 }), LIB, TODAY)).toMatchObject({ kind: 'error' });
    expect(parseJsonImport('{"foo": 1}', LIB, TODAY)).toMatchObject({ kind: 'error' });

    // Écriture interrompue : la transaction unique n'enregistre rien.
    const bad = { ...before.sessions[0]!, id: undefined } as unknown as Session;
    await expect(repo.applyImport({ sessions: [{ ...before.sessions[0]!, id: 'nouvelle' }, bad], exercises: [] })).rejects.toThrow();
    expect(await repo.loadSessions()).toEqual(snapshot.sessions);
    expect(await repo.loadExercises()).toEqual(snapshot.exercises);
    repo.close();
  });

  it('43 et 79. Export puis import : séances, réglages, pesées et profil recalculé identiques, sans doublon', async () => {
    const data = sampleData();
    const withConfig = data.exercises.map((e) =>
      e.id === 'leg-curl' ? { ...e, variants: e.variants.map((v) => ({ ...v, config: { maxReps: 15 } })) } : e,
    );
    const source = { sessions: data.sessions, exercises: withConfig };
    const backup = buildBackup({ ...source, bodyTracking: { heightCm: 180, weighIns: [{ date: '2026-10-01', weightKg: 78.5 }] } }, 5);
    const parsed = parseJsonImport(JSON.stringify(backup), LIB, TODAY);
    if (parsed.kind !== 'backup') throw new Error(parsed.kind);
    expect(parsed.backup.bodyTracking).toEqual({ heightCm: 180, weighIns: [{ date: '2026-10-01', weightKg: 78.5 }] });
    expect(parsed.backup.settings).toEqual({});

    // Restauration sur un nouvel appareil.
    const repo = await freshRepo();
    await repo.ensureSeed();
    await repo.applyImport(planImport(parsed.backup, { sessions: [], exercises: await repo.loadExercises() }, { mode: 'merge' }));
    const restored = { sessions: await repo.loadSessions(), exercises: await repo.loadExercises() };
    expect(restored.exercises.find((e) => e.id === 'leg-curl')?.variants[0]?.config).toEqual({ maxReps: 15 });
    expect(rebuildProfile(restored.sessions, settingsOf(restored.exercises))).toEqual(
      rebuildProfile(source.sessions, settingsOf(source.exercises)),
    );

    // Réimport sur le même appareil : tout est déjà présent, rien n'est ajouté.
    const again = planImport(parsed.backup, restored, { mode: 'merge' });
    expect(again.sessions).toEqual([]);
    expect(again.exercises).toEqual([]);
    expect(again.identical).toHaveLength(source.sessions.length);
    await repo.applyImport(again);
    expect(await repo.loadSessions()).toHaveLength(source.sessions.length);
    repo.close();
  });

  it('43. Une même séance sous un autre identifiant est un doublon, importé seulement si confirmé', () => {
    const data = sampleData();
    const copy = { ...data.sessions[1]!, id: 'copie' };
    const backup = buildBackup({ sessions: [copy], exercises: data.exercises }, 1);
    const plan = planImport(backup, data, { mode: 'merge' });
    expect(plan.duplicates.map((s) => s.id)).toEqual(['copie']);
    expect(plan.sessions).toEqual([]);
    expect(planImport(backup, data, { mode: 'merge', includeDuplicates: true }).sessions.map((s) => s.id)).toEqual(['copie']);
  });

  it('44 et 79. L’import ne supprime ni ne remplace les données existantes sans confirmation explicite', async () => {
    const data = sampleData();
    const repo = await freshRepo();
    await repo.ensureSeed();
    const custom = data.exercises.map((e) => (e.id === 'chest-press' ? { ...e, name: 'Ma chest press' } : e));
    await repo.applyImport({ ...data, exercises: custom });
    const local = { sessions: await repo.loadSessions(), exercises: await repo.loadExercises() };

    // Sauvegarde plus ancienne : une seule séance, modifiée, et un exercice renommé autrement.
    const renamed = local.exercises.map((e) => (e.id === 'chest-press' ? { ...e, name: 'Autre nom', synonyms: ['Presse pecs'] } : e));
    const older = buildBackup({ sessions: [{ ...data.sessions[0]!, name: 'Ancien nom' }], exercises: renamed }, 1);
    const plan = planImport(older, local, { mode: 'merge' });
    expect(plan.conflicts.map((s) => s.id)).toEqual([data.sessions[0]!.id]);
    expect(plan.exerciseConflicts.map((e) => e.id)).toEqual(['chest-press']);
    expect(plan.sessions).toEqual([]);
    await repo.applyImport(plan);
    const after = await repo.loadSessions();
    expect(after).toHaveLength(data.sessions.length);
    expect(after.find((s) => s.id === data.sessions[0]!.id)?.name).toBe(data.sessions[0]!.name);
    const chest = (await repo.loadExercises()).find((e) => e.id === 'chest-press')!;
    expect(chest.name).toBe('Ma chest press');
    expect(chest.synonyms).toContain('Presse pecs');

    // Remplacement global : uniquement sur demande explicite.
    await repo.applyImport({ ...planImport(older, local, { mode: 'replace' }), replace: true });
    expect((await repo.loadSessions()).map((s) => s.name)).toEqual(['Ancien nom']);
    repo.close();
  });

  it('une séance en cours importée est ignorée si une autre est en cours sur l’appareil', () => {
    const active = startSession(10, 'ici');
    const elsewhere = startSession(20, 'ailleurs');
    const plan = planImport(buildBackup({ sessions: [elsewhere], exercises: [] }, 1), { sessions: [active], exercises: LIB }, { mode: 'merge' });
    expect(plan.skippedActive.map((s) => s.id)).toEqual(['ailleurs']);
    expect(plan.sessions).toEqual([]);
  });
});

describe('Fichier d’exemple docs/exemples/seance-exemple-1.json', () => {
  it('62. S’importe correctement : six exercices, poids, séries et ressentis conformes', () => {
    const parsed = parseJsonImport(sampleJson, LIB, TODAY);
    expect(parsed.kind).toBe('drafts');
    if (parsed.kind !== 'drafts') return;
    expect(parsed.format).toBe('simple');
    expect(parsed.drafts).toHaveLength(1);
    const draft = parsed.drafts[0]!;
    expect(draft).toMatchObject({ sourceId: 'seance-exemple-1', date: '2026-03-09', dateConfirmed: true, name: 'Séance du 9 mars 2026' });

    const problems = draftProblems(draft, { sessions: [], exercises: LIB, profile: EMPTY_PROFILE });
    expect(hasBlockingProblems(problems), JSON.stringify(problems)).toBe(false);

    const { sessions } = finalizeDrafts(parsed.drafts, LIB, [], 1_000);
    const session = sessions[0]!;
    expect(session).toMatchObject({ id: 'seance-exemple-1', date: '2026-03-09', origin: 'import', state: 'done', startedAt: null });
    expect(session.sourceText).toContain('Seated row horizontal');
    expect(session.performances.map((p) => [p.variantId, p.weightKg, p.plannedSets, p.targetReps, p.reps, p.feeling])).toEqual([
      ['tirage-horizontal', 48, 3, 8, [8, 8, 8], 'moyen'],
      ['elevations-laterales', 9, 3, 8, [8, 8, 8], 'tres_bien'],
      ['curl-biceps-poulie-corde', 15, 3, 8, [8, 8, 8], 'tres_bien'],
      ['curl-biceps-banc-incline--70', 10, 3, 8, [8, 8, 8], 'mal'],
      ['tirage-vertical', 36, 3, 9, [9, 9, 9], 'mal'],
      ['extension-triceps-haltere-assis', 14, 3, 8, [8, 8, 8], 'tres_bien'],
    ]);
    const preview = previewEvaluations(parsed.drafts, LIB, []).get(draft.key)!;
    expect(draft.exercises.map((e) => preview.get(e.key)?.status)).toEqual(['orange', 'vert', 'vert', 'orange', 'orange', 'vert']);
  });

  it('62. Le JSON simple et les notes du même bloc donnent la même séance', () => {
    const parsed = parseJsonImport(sampleJson, LIB, TODAY);
    if (parsed.kind !== 'drafts') throw new Error(parsed.kind);
    const fromJson = finalizeDrafts(parsed.drafts, LIB, [], 1).sessions[0]!;
    const fromNotes = finalizeDrafts([setDraftDate(draftFromNotes(NOTES_11_3, LIB, TODAY), '2026-10-12')], LIB, [], 1).sessions[0]!;
    expect(fromJson.performances).toEqual(fromNotes.performances);
  });

  it('un JSON de structure inconnue est adapté quand sa structure est détectable', () => {
    const text = JSON.stringify([
      { jour: '2026-10-02', exercices: [{ nom: 'Leg press', poids: '100 kg', series: 3, reps: 10, ressenti: '+' }] },
    ]);
    const parsed = parseJsonImport(text, LIB, TODAY);
    expect(parsed.kind).toBe('drafts');
    if (parsed.kind !== 'drafts') return;
    expect(parsed.format).toBe('detected');
    expect(parsed.drafts[0]!.exercises[0]).toMatchObject({ weightKg: 100, plannedSets: 3, targetReps: 10, reps: [10, 10, 10], feeling: 'bien' });
    expect(parsed.drafts[0]!.exercises[0]!.choice).toEqual({ kind: 'variant', variantId: 'presse-a-cuisses' });
  });

  it('un ressenti contredit par son symbole est soumis à confirmation', () => {
    const text = JSON.stringify({ schemaVersion: 1, sessions: [{ date: '2026-10-02', exercises: [{ sourceName: 'Leg curl', weightKg: 40, sets: [8, 8, 8], feeling: 'bien', feelingSymbol: '--' }] }] });
    const parsed = parseJsonImport(text, LIB, TODAY);
    if (parsed.kind !== 'drafts') throw new Error(parsed.kind);
    const problems = draftProblems(parsed.drafts[0]!, { sessions: [], exercises: LIB, profile: EMPTY_PROFILE });
    expect(problems.map((p) => p.code)).toContain('feeling_conflict');
  });
});

describe('Rappel de sauvegarde (§12)', () => {
  const day = 24 * 60 * 60 * 1000;
  const done = (createdAt: number, updatedAt = createdAt): Session => ({ ...startSession(createdAt, `s${createdAt}`), state: 'done', updatedAt });

  it('aucun rappel sans séance, ni avant 14 jours', () => {
    expect(needsBackupReminder([], null, 100 * day)).toBe(false);
    expect(needsBackupReminder([done(day)], null, day + BACKUP_REMINDER_MS - 1)).toBe(false);
    expect(needsBackupReminder([done(day)], null, day + BACKUP_REMINDER_MS)).toBe(true);
  });

  it('rappel 14 jours après le dernier export seulement si de nouvelles séances existent', () => {
    const exportAt = 10 * day;
    expect(needsBackupReminder([done(day)], exportAt, exportAt + 20 * day)).toBe(false);
    expect(needsBackupReminder([done(day), done(12 * day)], exportAt, exportAt + 13 * day)).toBe(false);
    expect(needsBackupReminder([done(day), done(12 * day)], exportAt, exportAt + 14 * day)).toBe(true);
  });
});
