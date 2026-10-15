import { describe, expect, it } from 'vitest';
import jsonExemple2 from '../../../docs/exemples/seance-exemple-2.json?raw';
import { EMPTY_PROFILE } from '../../engine';
import { SEED_EXERCISES } from '../../library/seed';
import { parseJsonImport } from '../backup';
import { draftFromNotes, draftProblems, finalizeDrafts, hasBlockingProblems, updateDraftExercise, type DraftSession } from '../draft';
import { parseNotes } from '../notes';
import { NOTES_EXEMPLE_2 } from './fixtures';

const TODAY = '2026-10-15';
const LIB = [...SEED_EXERCISES];
const ctx = { sessions: [], exercises: LIB, profile: EMPTY_PROFILE };
const codes = (draft: DraftSession, key: string) => draftProblems(draft, ctx).filter((p) => p.exerciseKey === key).map((p) => p.code);

describe('87. Deuxième jeu d’import (exemple anonymisé)', () => {
  it('notes : six exercices lus tels quels, rien d’inventé', () => {
    const parsed = parseNotes(NOTES_EXEMPLE_2, TODAY);
    expect(parsed.date).toBeNull();
    expect(parsed.entries.map((e) => [e.sourceName, e.plannedSets, e.targetReps, e.reps, e.weightKg, e.feeling, e.feelingSymbol])).toEqual([
      ['Développé épaules', 3, 8, [8, 8, 8], 38, 'moyen', '='],
      ['Dips assistés', 3, 8, [8, 8, 8], 27, 'moyen', '='],
      ['Triceps sur banc 1 haltere', 3, 8, [8, 8, 8], 14, 'tres_bien', '++'],
      ['Chest press', 3, 8, [8, 8, 8], 47, 'moyen', '+='],
      ['Lat pull tirage vertical prise très large', 3, 8, [8, 8, 8], 41, 'moyen', '='],
      ['Écarté sur banc à plat avec halteres (pectoraux)', 3, 8, [8, 8, 8], 9, 'moyen', '='],
    ]);
    expect(parsed.entries[3]).toMatchObject({ weightText: '47gs', issues: ['unknown_unit'] });
  });

  it('notes : « += » vaut Moyen, « 47gs » est à confirmer, la prise très large est proposée, les dips sont assistés', () => {
    const draft = draftFromNotes(NOTES_EXEMPLE_2, LIB, TODAY);
    expect(draft).toMatchObject({ date: TODAY, dateConfirmed: false, dateSource: 'today' });
    const [epaules, dips, triceps, chest, lat, ecarte] = draft.exercises;
    expect(epaules!.choice).toEqual({ kind: 'variant', variantId: 'developpe-epaules-machine' });
    expect(dips!.choice).toEqual({ kind: 'variant', variantId: 'dips-assistes' });
    expect(codes(draft, dips!.key)).toContain('assisted');
    // Correspondance incertaine : proposée en tête des candidats, jamais choisie d'office si elle n'est pas fiable.
    expect(triceps!.match.candidates[0]?.variantId).toBe('extension-triceps-haltere-assis');
    expect(chest!).toMatchObject({ feeling: 'moyen', feelingSymbol: '+=', feelingConfirmed: true, weightKg: 47 });
    expect(chest!.toConfirm).toEqual(['Poids noté « 47gs » : unité non reconnue, lu 47 kg.']);
    expect(codes(draft, chest!.key)).toContain('to_confirm');
    expect(lat!.choice).toEqual({ kind: 'new_variant', exerciseId: 'tirage-vertical', name: 'prise très large' });
    expect(ecarte!.choice).toEqual({ kind: 'variant', variantId: 'ecarte-couche-halteres' });

    // Une fois la date, le poids et le triceps confirmés, l'import est possible et conserve le symbole d'origine.
    let ready: DraftSession = { ...draft, dateConfirmed: true };
    ready = updateDraftExercise(ready, chest!.key, { checksConfirmed: true });
    ready = updateDraftExercise(ready, triceps!.key, { choice: { kind: 'variant', variantId: 'extension-triceps-haltere-assis' } });
    expect(hasBlockingProblems(draftProblems(ready, ctx)), JSON.stringify(draftProblems(ready, ctx))).toBe(false);
    const { sessions, exercises } = finalizeDrafts([ready], LIB, [], 1);
    expect(sessions[0]!.performances.find((p) => p.variantId === 'chest-press')).toMatchObject({ feeling: 'moyen', feelingSymbol: '+=', weightKg: 47 });
    expect(exercises.find((e) => e.id === 'tirage-vertical')?.variants.map((v) => v.id)).toEqual(['tirage-vertical', 'tirage-vertical--prise-tres-large']);
  });

  it('JSON : même lecture, la remarque du fichier est à confirmer, la charge d’aide des dips est reconnue', () => {
    const parsed = parseJsonImport(jsonExemple2, LIB, TODAY);
    if (parsed.kind !== 'drafts') throw new Error(parsed.kind);
    const draft = parsed.drafts[0]!;
    expect(draft).toMatchObject({ sourceId: 'seance-exemple-2', date: '2026-03-12', dateConfirmed: true });
    expect(draft.exercises.map((e) => e.choice)).toEqual([
      { kind: 'variant', variantId: 'developpe-epaules-machine' },
      { kind: 'variant', variantId: 'dips-assistes' },
      { kind: 'variant', variantId: 'extension-triceps-haltere-assis' },
      { kind: 'variant', variantId: 'chest-press' },
      { kind: 'new_variant', exerciseId: 'tirage-vertical', name: 'prise très large' },
      { kind: 'variant', variantId: 'ecarte-couche-halteres' },
    ]);
    const [, dips, , chest] = draft.exercises;
    expect(dips!.assistedHint).toBe(true);
    expect(codes(draft, dips!.key)).toContain('assisted');
    expect(codes(draft, dips!.key)).not.toContain('assisted_mismatch');
    expect(chest).toMatchObject({ feeling: 'moyen', feelingSymbol: '+=', feelingConfirmed: true, weightKg: 47, checksConfirmed: false });
    expect(chest!.toConfirm[0]).toContain('47gs');
    expect(hasBlockingProblems(draftProblems(draft, ctx))).toBe(true);
    const confirmed = updateDraftExercise(draft, chest!.key, { checksConfirmed: true });
    expect(hasBlockingProblems(draftProblems(confirmed, ctx))).toBe(false);
  });

  it('une aide signalée sur un exercice non assisté est relevée', () => {
    const text = JSON.stringify({ schemaVersion: 1, sessions: [{ date: '2026-10-15', exercises: [{ sourceName: 'Chest press', weightKg: 20, sets: [8, 8, 8], feeling: 'bien', weightIsAssistance: true }] }] });
    const parsed = parseJsonImport(text, LIB, TODAY);
    if (parsed.kind !== 'drafts') throw new Error(parsed.kind);
    expect(codes(parsed.drafts[0]!, 'e1')).toContain('assisted_mismatch');
  });
});
