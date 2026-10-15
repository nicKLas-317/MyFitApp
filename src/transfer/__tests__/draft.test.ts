import { describe, expect, it } from 'vitest';
import type { Exercise, Session } from '../../domain/types';
import { EMPTY_PROFILE, rebuildProfile } from '../../engine';
import { buildEngineSettings } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import {
  draftFromNotes,
  draftProblems,
  finalizeDrafts,
  hasBlockingProblems,
  previewEvaluations,
  setDraftDate,
  updateDraftExercise,
  type DraftSession,
} from '../draft';
import { matchExercise } from '../match';
import { NOTES_11_3 } from './fixtures';

const TODAY = '2026-10-15';
const LIB: readonly Exercise[] = SEED_EXERCISES;

/** Import complet d'un bloc de notes à une date donnée, comme le ferait l'écran d'import. */
function importNotes(text: string, date: string, state: { sessions: Session[]; exercises: Exercise[] }, now: number) {
  const draft = setDraftDate(draftFromNotes(text, state.exercises, TODAY), date);
  const problems = draftProblems(draft, { ...state, profile: rebuildProfile(state.sessions, buildEngineSettings(state.exercises)).profile });
  expect(hasBlockingProblems(problems), JSON.stringify(problems)).toBe(false);
  const result = finalizeDrafts([draft], state.exercises, state.sessions, now);
  const exercises = state.exercises.map((e) => result.exercises.find((x) => x.id === e.id) ?? e);
  exercises.push(...result.exercises.filter((x) => !state.exercises.some((e) => e.id === x.id)));
  return { sessions: [...state.sessions, ...result.sessions], exercises, imported: result.sessions[0]! };
}

const ctx = (sessions: Session[] = [], exercises: readonly Exercise[] = LIB) => ({ sessions, exercises, profile: EMPTY_PROFILE });

describe('Reconnaissance des exercices (§11.7)', () => {
  it('38. Les noms français et anglais sont reconnus lorsque les correspondances sont fiables', () => {
    const cases: [string, string][] = [
      ['Lat pulldown', 'tirage-vertical'],
      ['Tirage vertical', 'tirage-vertical'],
      ['Seated row', 'tirage-horizontal'],
      ['Chest press', 'chest-press'],
      ['Développé assis machine', 'chest-press'],
      ['developpe couche', 'developpe-couche'],
      ['Bench press', 'developpe-couche'],
      ['Leg press', 'presse-a-cuisses'],
      ['Butterfly', 'pec-deck'],
      ['Lateral raise', 'elevations-laterales'],
      ['Triceps pushdown', 'extension-triceps-poulie'],
    ];
    for (const [name, id] of cases) {
      const m = matchExercise(name, LIB);
      expect(m.suggestion, name).toBe(id);
      expect(['certain', 'probable'], name).toContain(m.confidence);
    }
  });

  it('98. Leg curl (assis) et curl ischios (allongé) : deux machines distinctes, reconnues sans confusion', () => {
    for (const name of ['leg curl', 'Leg curl', 'Leg curl assis', 'seated leg curl', 'LEG CURL']) {
      expect(matchExercise(name, LIB), name).toMatchObject({ confidence: 'certain', suggestion: 'leg-curl' });
    }
    for (const name of ['curl ischios', 'Curl ischio allongé', 'curl ischio allonge', 'leg curl allongé', 'Lying leg curl', 'curl ischio']) {
      expect(matchExercise(name, LIB), name).toMatchObject({ confidence: 'certain', suggestion: 'curl-ischios' });
    }
    // En cas de doute, l'aperçu demande de choisir entre les deux machines.
    const doubt = draftFromNotes('Leg curl machine\n3x10x40kg +', LIB, TODAY).exercises[0]!;
    expect(doubt.choice).toBeNull();
    expect(doubt.match.confidence).toBe('ambiguous');
    expect(doubt.match.candidates.slice(0, 2).map((c) => c.variantId).sort()).toEqual(['curl-ischios', 'leg-curl']);
    // Historiques séparés : deux variantes distinctes pour le moteur.
    const draft = setDraftDate(draftFromNotes('Leg curl\n3x10x40kg +\n\nCurl ischios\n3x10x30kg +', LIB, TODAY), '2026-03-02');
    const { sessions } = finalizeDrafts([draft], LIB, [], 1);
    expect(sessions[0]!.performances.map((p) => [p.variantId, p.weightKg])).toEqual([
      ['leg-curl', 40],
      ['curl-ischios', 30],
    ]);
  });

  it('38. Les six exercices du §11.3 sont associés aux bons exercices', () => {
    const draft = draftFromNotes(NOTES_11_3, LIB, TODAY);
    expect(draft.exercises.map((e) => e.choice)).toEqual([
      { kind: 'variant', variantId: 'tirage-horizontal' },
      { kind: 'variant', variantId: 'elevations-laterales' },
      { kind: 'variant', variantId: 'curl-biceps-poulie-corde' },
      { kind: 'new_variant', exerciseId: 'curl-biceps-banc-incline', name: '70°' },
      { kind: 'variant', variantId: 'tirage-vertical' },
      { kind: 'variant', variantId: 'extension-triceps-haltere-assis' },
    ]);
    expect(draft.exercises[3]!.match.qualifier).toBe('70°');
  });

  it('39. Une correspondance ambiguë est à choisir ; la correction est mémorisée pour les imports suivants', () => {
    let state = { sessions: [] as Session[], exercises: [...LIB] };
    const draft = setDraftDate(draftFromNotes('Curl biceps\n3x8x14kg +', state.exercises, TODAY), '2026-10-01');
    const entry = draft.exercises[0]!;
    expect(entry.match.confidence).toBe('ambiguous');
    expect(entry.choice).toBeNull();
    expect(entry.match.candidates.map((c) => c.variantId)).toEqual(
      expect.arrayContaining(['curl-biceps-halteres', 'curl-biceps-poulie-corde', 'curl-biceps-banc-incline']),
    );
    expect(draftProblems(draft, ctx()).map((p) => p.code)).toContain('choose_exercise');

    const fixed = updateDraftExercise(draft, entry.key, { choice: { kind: 'variant', variantId: 'curl-biceps-halteres' } });
    expect(hasBlockingProblems(draftProblems(fixed, ctx()))).toBe(false);
    const result = finalizeDrafts([fixed], state.exercises, [], 1_000);
    expect(result.exercises.find((e) => e.id === 'curl-biceps-halteres')?.variants[0]?.synonyms).toEqual(['Curl biceps']);
    state = { sessions: result.sessions, exercises: state.exercises.map((e) => result.exercises.find((x) => x.id === e.id) ?? e) };

    const again = matchExercise('curl biceps', state.exercises);
    expect(again).toMatchObject({ confidence: 'learned', suggestion: 'curl-biceps-halteres' });

    // Nouvelle correction : le synonyme appris change de variante au lieu d'être dupliqué.
    const next = draftFromNotes('Curl biceps\n3x8x14kg +', state.exercises, TODAY);
    const moved = finalizeDrafts(
      [updateDraftExercise(setDraftDate(next, '2026-10-02'), 'e1', { choice: { kind: 'variant', variantId: 'curl-biceps-poulie-corde' } })],
      state.exercises,
      state.sessions,
      2_000,
    );
    const byId = new Map(moved.exercises.map((e) => [e.id, e]));
    expect(byId.get('curl-biceps-poulie-corde')?.variants[0]?.synonyms).toContain('Curl biceps');
    expect(byId.get('curl-biceps-halteres')?.variants[0]?.synonyms).toEqual([]);
  });

  it('un nom déjà présent dans la bibliothèque n’est pas ajouté comme synonyme', () => {
    const draft = setDraftDate(draftFromNotes('Lat pulldown\n3x8x40kg +', LIB, TODAY), '2026-10-01');
    expect(finalizeDrafts([draft], LIB, [], 1).exercises).toEqual([]);
  });

  it('77. Un angle précisé dans le nom crée par défaut une variante, avec son propre historique', () => {
    const withVariant = setDraftDate(draftFromNotes('Biceps curl banc incliné 70°\n3×8×10 kgs -=', LIB, TODAY), '2026-10-10');
    expect(withVariant.exercises[0]!.choice).toEqual({ kind: 'new_variant', exerciseId: 'curl-biceps-banc-incline', name: '70°' });
    const problems = draftProblems(withVariant, ctx());
    expect(hasBlockingProblems(problems)).toBe(false);
    expect(problems.find((p) => p.code === 'new_variant')?.level).toBe('warning');
    const result = finalizeDrafts([withVariant], LIB, [], 1_000);
    const exercise = result.exercises.find((e) => e.id === 'curl-biceps-banc-incline')!;
    expect(exercise.variants.map((v) => v.id)).toEqual(['curl-biceps-banc-incline', 'curl-biceps-banc-incline--70']);
    expect(exercise.variants[1]!.synonyms).toEqual(['Biceps curl banc incliné 70°']);
    expect(result.sessions[0]!.performances[0]!.variantId).toBe('curl-biceps-banc-incline--70');
    // Imports suivants : le nom est reconnu directement sur cette variante.
    const exercises = LIB.map((e) => (e.id === exercise.id ? exercise : e));
    expect(matchExercise('Biceps curl banc incliné 70°', exercises).suggestion).toBe('curl-biceps-banc-incline--70');

    // Autre écriture du même angle : la variante existante est reprise, pas recréée.
    const choice = (text: string) => draftFromNotes(`${text}\n3x8x12kg +`, exercises, TODAY).exercises[0]!.choice;
    expect(choice('Curl incliné 70 degrés')).toEqual({ kind: 'variant', variantId: 'curl-biceps-banc-incline--70' });
    // Autre angle : nouvelle variante ; sans angle : variante standard, à vérifier.
    expect(choice('Curl biceps banc incliné 45°')).toEqual({ kind: 'new_variant', exerciseId: 'curl-biceps-banc-incline', name: '45°' });
    const plain = draftFromNotes('Curl biceps banc incliné\n3x8x12kg +', exercises, TODAY).exercises[0]!;
    expect(plain.choice).toEqual({ kind: 'variant', variantId: 'curl-biceps-banc-incline' });
    // L'option inverse reste possible : rattacher à la variante standard.
    const standard = updateDraftExercise(withVariant, 'e1', { choice: { kind: 'variant', variantId: 'curl-biceps-banc-incline' } });
    expect(finalizeDrafts([standard], LIB, [], 1).sessions[0]!.performances[0]!.variantId).toBe('curl-biceps-banc-incline');
  });

  it('un exercice inconnu peut être créé comme exercice personnalisé', () => {
    const draft = setDraftDate(draftFromNotes('Hip thrust\n3x10x60kg +', LIB, TODAY), '2026-10-01');
    expect(draft.exercises[0]!.match.confidence).toBe('none');
    const incomplete = updateDraftExercise(draft, 'e1', { choice: { kind: 'new_exercise', name: 'Hip thrust', primaryGroup: null } });
    expect(draftProblems(incomplete, ctx()).map((p) => p.code)).toContain('new_exercise_group');
    const ready = updateDraftExercise(draft, 'e1', { choice: { kind: 'new_exercise', name: 'Hip thrust', primaryGroup: 'jambes' } });
    expect(hasBlockingProblems(draftProblems(ready, ctx()))).toBe(false);
    const result = finalizeDrafts([ready], LIB, [], 1_000);
    expect(result.exercises).toMatchObject([{ id: 'perso-hip-thrust', name: 'Hip thrust', primaryGroup: 'jambes' }]);
    expect(result.sessions[0]!.performances[0]!.variantId).toBe('perso-hip-thrust');
  });
});

describe('Import de notes et moteur de progression (§11.6)', () => {
  it('36. 3x8x52kg ++ importé valide ; 3x8x52kg = et 3x8x52kg sans symbole ne valident pas', () => {
    for (const [symbol, status, validation] of [
      ['++', 'vert', true],
      ['=', 'orange', false],
      ['', 'orange', false],
    ] as const) {
      const state = importNotes(`Seated row\n3x8x52kg ${symbol}`, '2026-10-01', { sessions: [], exercises: [...LIB] }, 1_000);
      const replay = rebuildProfile(state.sessions, buildEngineSettings(state.exercises));
      expect(replay.evaluations, symbol).toMatchObject([{ variantId: 'tirage-horizontal', status, validation }]);
      expect(replay.profile.variants['tirage-horizontal']!.greenStreak).toBe(validation ? 1 : 0);
    }
  });

  it('37. Deux imports successifs 3x8x52kg ++ à des dates différentes proposent 3×9 à 52 kg', () => {
    let state = { sessions: [] as Session[], exercises: [...LIB] };
    state = importNotes('Seated row\n3x8x52kg ++', '2026-10-01', state, 1_000);
    expect(rebuildProfile(state.sessions, buildEngineSettings(state.exercises)).profile.variants['tirage-horizontal']!.recommendation.kind).toBe('keep');
    state = importNotes('Seated row\n3x8x52kg ++', '2026-10-04', state, 2_000);
    const v = rebuildProfile(state.sessions, buildEngineSettings(state.exercises)).profile.variants['tirage-horizontal']!;
    expect(v.palier).toEqual({ weightKg: 52, targetReps: 8 });
    expect(v.recommendation).toEqual({ kind: 'reps_up', targetReps: 9, plannedSets: 3 });
  });

  it('41. La date saisie est conservée et les séances importées sont classées chronologiquement', () => {
    let state = { sessions: [] as Session[], exercises: [...LIB] };
    // Import dans le désordre : la séance du 10 d'abord, celle du 5 ensuite.
    state = importNotes('Seated row\n3x9x52kg ++', '2026-10-10', state, 1_000);
    state = importNotes('Seated row\n3x8x52kg ++', '2026-10-05', state, 2_000);
    expect(state.sessions.map((s) => s.date)).toEqual(['2026-10-10', '2026-10-05']);
    expect(state.sessions.every((s) => s.origin === 'import' && s.state === 'done' && s.startedAt === null)).toBe(true);
    const replay = rebuildProfile(state.sessions, buildEngineSettings(state.exercises));
    expect(replay.evaluations.map((e) => [state.sessions.find((s) => s.id === e.sessionId)!.date, e.palier.targetReps])).toEqual([
      ['2026-10-05', 8],
      ['2026-10-10', 9],
    ]);
  });

  it('41 et 80. Une date de notes doit être confirmée ; la modifier vaut confirmation', () => {
    const draft = draftFromNotes('Seated row\n3x8x52kg ++', LIB, TODAY);
    expect(draft).toMatchObject({ date: TODAY, dateConfirmed: false, dateSource: 'today', name: 'Séance du 15 octobre 2026' });
    expect(draftProblems(draft, ctx()).map((p) => p.code)).toContain('date_unconfirmed');
    const dated = draftFromNotes('12 octobre 2026\nSeated row\n3x8x52kg ++', LIB, TODAY);
    expect(dated).toMatchObject({ date: '2026-10-12', dateConfirmed: false, dateSource: 'text' });
    const confirmed = setDraftDate(dated, '2026-10-11');
    expect(confirmed).toMatchObject({ date: '2026-10-11', dateConfirmed: true, name: 'Séance du 11 octobre 2026' });
  });

  it('42. Un doublon potentiel est détecté et n’est importé qu’après confirmation explicite', () => {
    const state = importNotes(NOTES_11_3, '2026-10-12', { sessions: [], exercises: [...LIB] }, 1_000);
    const again = setDraftDate(draftFromNotes(NOTES_11_3, state.exercises, TODAY), '2026-10-12');
    const problems = draftProblems(again, { ...state, profile: EMPTY_PROFILE });
    expect(problems.find((p) => p.code === 'duplicate_session')?.level).toBe('error');
    expect(draftProblems({ ...again, allowDuplicate: true }, { ...state, profile: EMPTY_PROFILE }).map((p) => p.code)).not.toContain(
      'duplicate_session',
    );
    // Même contenu à une autre date : pas un doublon.
    const otherDay = setDraftDate(again, '2026-10-13');
    expect(draftProblems(otherDay, { ...state, profile: EMPTY_PROFILE }).map((p) => p.code)).not.toContain('duplicate_session');
  });

  it('40. Poids seul : historique partiel sans statut ; poids absent : import bloqué tant que non corrigé', () => {
    const draft = setDraftDate(draftFromNotes('Presse\n120kg\n\nLeg extension\n3x10', LIB, TODAY), '2026-10-01');
    const problems = draftProblems(draft, ctx());
    expect(problems.filter((p) => p.exerciseKey === 'e1').map((p) => [p.level, p.code])).toEqual([['warning', 'partial']]);
    expect(problems.filter((p) => p.exerciseKey === 'e2').map((p) => [p.level, p.code])).toContainEqual(['error', 'missing_weight']);

    const excluded = updateDraftExercise(draft, 'e2', { include: false });
    expect(hasBlockingProblems(draftProblems(excluded, ctx()))).toBe(false);
    const { sessions } = finalizeDrafts([excluded], LIB, [], 1);
    expect(sessions[0]!.performances).toEqual([
      { variantId: 'presse-a-cuisses', weightKg: 120, targetReps: null, plannedSets: null, reps: [], feeling: 'inconnu', partial: true },
    ]);
    const replay = rebuildProfile(sessions, buildEngineSettings(LIB));
    expect(replay.evaluations).toEqual([]);
    expect(replay.profile.variants['presse-a-cuisses']).toBeUndefined();
  });

  it('un symbole inconnu bloque l’import jusqu’au choix du ressenti', () => {
    const draft = setDraftDate(draftFromNotes('Seated row\n3x8x52kg +-', LIB, TODAY), '2026-10-01');
    expect(draftProblems(draft, ctx()).map((p) => p.code)).toContain('unknown_symbol');
    const fixed = updateDraftExercise(draft, 'e1', { feeling: 'bien', feelingConfirmed: true });
    expect(hasBlockingProblems(draftProblems(fixed, ctx()))).toBe(false);
  });

  it('l’aperçu affiche le statut que chaque performance obtiendra', () => {
    const draft: DraftSession = setDraftDate(draftFromNotes(NOTES_11_3, LIB, TODAY), '2026-10-12');
    const preview = previewEvaluations([draft], LIB, []).get(draft.key)!;
    expect(draft.exercises.map((e) => preview.get(e.key)?.status)).toEqual(['orange', 'vert', 'vert', 'orange', 'orange', 'vert']);
    const { sessions } = finalizeDrafts([draft], LIB, [], 1);
    expect(sessions[0]!.sourceText).toBe(NOTES_11_3);
  });
});
