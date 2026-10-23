import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import departJson from '../../../docs/exemples/depart-exemple.json?raw';
import type { Exercise, Session } from '../../domain/types';
import { rebuildProfile } from '../../engine';
import { weeklyRecap } from '../../analysis/weekly';
import { buildEngineSettings, displayName, groupGrips, indexVariants, type GripEntry, type VariantRef } from '../catalog';
import { SEED_EXERCISES, SEED_VERSION } from '../seed';
import { buildSearchIndex, searchExercises } from '../search';
import { GRIPS, gripOf, MEDIUM_GRIP } from '../text';
import { openAppDb, Repository } from '../../storage/db';
import { parseJsonImport, planImport } from '../../transfer/backup';
import { draftFromNotes } from '../../transfer/draft';
import { matchExercise } from '../../transfer/match';

const LIB: Exercise[] = [...SEED_EXERCISES];
const INDEX = buildSearchIndex(LIB);
const ids = (q: string) => searchExercises(INDEX, q).map((r) => r.entry.variant.id);
const choiceOf = (name: string) => {
  const c = draftFromNotes(`${name}\n3x8x40kg +`, LIB, '2026-10-16').exercises[0]!.choice;
  return c?.kind === 'variant' ? c.variantId : c;
};
const TV = 'tirage-vertical';
const LARGE = 'tirage-vertical--prise-tres-large';
const SERREE = 'tirage-vertical--prise-serree';

describe('Prises (§4.3.1)', () => {
  it('134. Trois prises, chacune une variante ; sans précision, la prise moyenne ; les écritures du lexique ne fusionnent jamais deux prises', () => {
    expect(GRIPS).toEqual(['Prise très large', 'Prise moyenne', 'Prise serrée']);
    expect(GRIPS).toContain(MEDIUM_GRIP);
    for (const w of ['prise très large', 'très large', 'prise large', 'large', 'wide', 'wide grip', 'extra wide']) expect(gripOf(`Tirage ${w}`), w).toBe('Prise très large');
    for (const w of ['prise moyenne', 'moyenne', 'normale', 'classique', 'standard']) expect(gripOf(`Tirage ${w}`), w).toBe('Prise moyenne');
    for (const w of ['prise serrée', 'serrée', 'serré', 'très serrée', 'close', 'close grip', 'narrow']) expect(gripOf(`Tirage ${w}`), w).toBe('Prise serrée');
    for (const w of ['prise neutre', 'supination', 'pronation', 'prise marteau']) expect(gripOf(`Tirage ${w}`), w).toBeNull();

    const tv = LIB.find((e) => e.id === TV)!;
    expect(tv.variants.map((v) => [v.id, v.name])).toEqual([[TV, 'Prise moyenne'], [LARGE, 'Prise très large'], [SERREE, 'Prise serrée']]);
    const names = indexVariants(LIB);
    expect(displayName(names.get(TV))).toBe('Tirage vertical — Prise moyenne');
    expect(displayName(names.get('pec-deck'))).toBe('Pec deck');

    // « tirage vertical » seul → prise moyenne (en tête de la recherche, retenue à l'import).
    expect(ids('tirage vertical')[0]).toBe(TV);
    expect(choiceOf('tirage vertical')).toBe(TV);
    expect(matchExercise('tirage vertical', LIB)).toMatchObject({ confidence: 'certain', suggestion: TV });
    for (const q of ['lat pull', 'latpull', 'tirage vertical prise moyenne', 'lat pulldown normale']) {
      expect(ids(q)[0], q).toBe(TV);
      expect(choiceOf(q), q).toBe(TV);
    }
    for (const q of ['tirage vertical wide grip', 'tirage vertical prise large', 'lat pull prise très large', 'Lat pull tirage vertical prise très large']) {
      expect(ids(q), q).toEqual([LARGE]);
      expect(choiceOf(q), q).toBe(LARGE);
    }
    expect(ids('tirage vertical close grip')).toEqual([SERREE]);
    expect(choiceOf('tirage vertical très serrée')).toBe(SERREE);
    // « prise très large » et « prise serrée » : deux variantes distinctes, sur chaque tirage.
    expect(ids('prise très large').sort()).toEqual(['tirage-horizontal--prise-tres-large', 'tirage-horizontal-poulie-basse--prise-tres-large', LARGE]);
    expect(ids('prise serrée').sort()).toEqual(['tirage-horizontal--prise-serree', 'tirage-horizontal-poulie-basse--prise-serree', SERREE]);
    // « seated row » désigne la machine (version 9) : sa prise très large d'abord, puis celle de la poulie basse.
    expect(ids('seated row wide')).toEqual(['tirage-horizontal--prise-tres-large', 'tirage-horizontal-poulie-basse--prise-tres-large']);
    expect(choiceOf('seated row wide')).toBe('tirage-horizontal--prise-tres-large');
    // Exercice sans prise : une prise demandée à l'import crée la variante et fait de la standard la prise moyenne.
    const draft = draftFromNotes('Développé couché prise serrée\n3x8x40kg +', LIB, '2026-10-16');
    expect(draft.exercises[0]!.choice).toEqual({ kind: 'new_variant', exerciseId: 'developpe-couche', name: 'Prise serrée' });
    expect(choiceOf('Développé couché')).toBe('developpe-couche');
  });

  it('135. Tirage vertical prise moyenne le lundi, prise très large le jeudi : « Dos (2×) » et deux historiques séparés', () => {
    const at = (d: number) => new Date(2026, 9, d, 18).getTime();
    const session = (id: string, d: number, variantId: string, weightKg: number): Session => ({
      id, name: id, date: `2026-10-${d}`, startedAt: at(d), endedAt: at(d) + 3_600_000, createdAt: at(d), updatedAt: at(d), origin: 'app', state: 'done',
      performances: [{ variantId, weightKg, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' }],
    });
    const sessions = [session('lundi', 12, TV, 40), session('jeudi', 15, LARGE, 35)];
    const dos = weeklyRecap(sessions, LIB, at(16)).cells.find((c) => c.group === 'dos')!;
    expect([dos.color, dos.count]).toEqual(['rouge', 2]);
    const profile = rebuildProfile(sessions, buildEngineSettings(LIB)).profile.variants;
    expect(profile[TV]).toMatchObject({ palier: { weightKg: 40, targetReps: 8 }, greenStreak: 1, lastSessionId: 'lundi' });
    expect(profile[LARGE]).toMatchObject({ palier: { weightKg: 35, targetReps: 8 }, greenStreak: 1, lastSessionId: 'jeudi' });
  });

  it('136. Bibliothèque version 6 : la variante standard devient « Prise moyenne », les prises manquantes sont ajoutées une fois, sans perte ni doublon', async () => {
    // Base de la version 5 : tirage vertical « Standard » et prise très large déjà créée par un import (nom en minuscules).
    const v5 = LIB.map((e) => {
      if (e.id === TV) return { ...e, variants: [{ id: TV, name: 'Standard', synonyms: ['Lat pulldown vertical'], archived: false }, { id: LARGE, name: 'prise très large', synonyms: ['Lat pull tirage vertical prise très large'], archived: false }] };
      if (e.id === 'tirage-horizontal') return { ...e, variants: [{ id: e.id, name: 'Standard', synonyms: [], archived: false }] };
      return e;
    });
    const repo = new Repository(await openAppDb(`test-prises-${Math.random()}`));
    await repo.putExercises(v5);
    await repo.setMeta('seeded', true);
    await repo.setMeta('seedVersion', 5);
    await repo.ensureSeed();
    const after = await repo.loadExercises();
    expect(after.find((e) => e.id === TV)!.variants.map((v) => [v.id, v.name, v.synonyms])).toEqual([
      [TV, 'Prise moyenne', ['Lat pulldown vertical']],
      [LARGE, 'prise très large', ['Lat pull tirage vertical prise très large']],
      [SERREE, 'Prise serrée', []],
    ]);
    expect(after.find((e) => e.id === 'tirage-horizontal')!.variants.map((v) => v.name)).toEqual(['Prise moyenne', 'Prise très large', 'Prise serrée']);
    expect(await repo.getMeta('seedVersion')).toBe(SEED_VERSION);
    // Une seule fois : relancer ne change rien.
    await repo.ensureSeed();
    expect(await repo.loadExercises()).toEqual(after);
    repo.close();

    // Données de départ (exemple anonymisé, format 2) importées sur une base neuve : bonnes prises, aucun doublon.
    const fresh = new Repository(await openAppDb(`test-prises-${Math.random()}`));
    await fresh.ensureSeed();
    const parsed = parseJsonImport(departJson, LIB, '2026-10-16');
    if (parsed.kind !== 'backup') throw new Error(parsed.kind);
    const plan = planImport(parsed.backup, { sessions: [], exercises: await fresh.loadExercises() }, { mode: 'merge' });
    expect(plan.blocking).toEqual([]);
    await fresh.applyImport(plan);
    const tv = (await fresh.loadExercises()).find((e) => e.id === TV)!;
    expect(tv.variants.map((v) => v.name)).toEqual(['Prise moyenne', 'Prise très large', 'Prise serrée']);
    const byDate = Object.fromEntries((await fresh.loadSessions()).map((s) => [s.date, s.performances.map((p) => p.variantId).filter((id) => id.startsWith(TV))]));
    expect(byDate['2026-03-09']).toEqual([TV]);
    expect(byDate['2026-03-12']).toEqual([LARGE]);
    fresh.close();
  });
});

describe('Regroupement d’affichage des prises (§4.3.1, version 1.21.0)', () => {
  const refs = indexVariants(LIB);
  const listed = (...ids: string[]) => ids.map((id) => ({ ref: refs.get(id)! }));
  const shape = (entries: GripEntry<{ ref: VariantRef }>[]) =>
    entries.map((e) => (e.kind === 'single' ? e.item.ref.variant.id : `${e.exercise.id}: ${e.items.map((i) => i.ref.variant.id).join(', ')}`));

  it('232. Les prises d’un même exercice forment une seule entrée (très large, moyenne, serrée), à la place de la première ; les autres variantes restent séparées', () => {
    const entries = groupGrips(listed('pec-deck', SERREE, 'mollets-machine', TV, 'mollets-machine--assis', LARGE));
    expect(shape(entries)).toEqual(['pec-deck', `${TV}: ${LARGE}, ${TV}, ${SERREE}`, 'mollets-machine', 'mollets-machine--assis']);
    // Une seule prise dans la liste (recherche « tirage vertical wide grip ») : entrée simple.
    expect(shape(groupGrips(listed(LARGE, 'pec-deck')))).toEqual([LARGE, 'pec-deck']);
    // Recherche : chaque prise reste un exercice-variante distinct, avec son propre identifiant.
    const grouped = groupGrips(searchExercises(INDEX, 'tirage vertical').map((r) => ({ ref: { exercise: r.entry.exercise, variant: r.entry.variant } })));
    expect(grouped[0]).toMatchObject({ kind: 'grips', exercise: { id: TV } });
    expect(grouped[0]!.kind === 'grips' && grouped[0]!.items.map((i) => i.ref.variant.name)).toEqual(GRIPS);
  });
});
