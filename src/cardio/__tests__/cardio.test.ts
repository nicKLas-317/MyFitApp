import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { CardioMachine, Exercise, Session } from '../../domain/types';
import { createSessionFromTemplate, DEFAULT_VARIANT_CONFIG, rebuildProfile } from '../../engine';
import { recapTitle, weeklyRecap } from '../../analysis/weekly';
import { buildEngineSettings } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { addExercise, finishSession, missingFeelings, recordSet, setFeeling, startSession } from '../../session/ops';
import { openAppDb, Repository } from '../../storage/db';
import { buildBackup, parseJsonImport, planImport, SCHEMA_VERSION } from '../../transfer/backup';
import { draftFromNotes, draftProblems, finalizeDrafts, hasBlockingProblems, setDraftDate, updateDraftCardio } from '../../transfer/draft';
import { parseNotes } from '../../transfer/notes';
import { NOTES_11_3, withExampleChoices } from '../../transfer/__tests__/fixtures';
import {
  addCardio,
  cardioErrors,
  cardioOf,
  DEFAULT_CARDIO_MACHINES,
  formatCardio,
  makeCardioBlock,
  machineListErrors,
  newMachine,
  parseDistance,
  parseMinutes,
  removeCardio,
  sanitizeCardioMachines,
  updateCardio,
} from '../model';

const LIB: Exercise[] = [...SEED_EXERCISES];
const TODAY = '2026-10-15';
const machine = (id: string) => DEFAULT_CARDIO_MACHINES.find((m) => m.id === id)!;
const TAPIS = machine('tapis');
const RAMEUR = machine('rameur');
const ELLIPTIQUE = machine('elliptique');
/** Heure locale : lun. 12 octobre 2026 = début de semaine. */
const at = (d: number, h = 18, m = 0) => new Date(2026, 9, d, h, m).getTime();
const nb = (s: string) => s.replace(/ /g, ' ');

/** Séance terminée : un exercice vert à 3×8, plus les blocs de cardio donnés. */
function done(start: number, id: string, cardio: { m: CardioMachine; min: number; incline?: 'neutre' | 'moyenne' | 'haute' }[], withExercise = true): Session {
  const ctx = { state: undefined, cfg: DEFAULT_VARIANT_CONFIG };
  let s = startSession(start, id);
  if (withExercise) {
    s = addExercise(s, 'pec-deck', ctx, start, 30).session;
    for (let i = 0; i < 3; i++) s = recordSet(s, 'pec-deck', 8, start + 1);
    s = setFeeling(s, 'pec-deck', 'bien', start + 2);
  }
  cardio.forEach((c, i) => {
    s = addCardio(s, makeCardioBlock({ machine: c.m, incline: c.incline, minutes: c.min }, `${id}-c${i}`), start + 3);
  });
  return finishSession(s, start + 3_600_000).session;
}

describe('Cardio : saisie et règles', () => {
  it('105. Machine, durée, inclinaison pour le tapis seulement (Neutre par défaut), distance facultative ; plusieurs blocs, correction et retrait', () => {
    const tapis = makeCardioBlock({ machine: TAPIS, minutes: 20 }, 'b1');
    expect(tapis).toEqual({ id: 'b1', machineId: 'tapis', machine: 'Tapis de marche', incline: 'neutre', minutes: 20 });
    const haute = makeCardioBlock({ machine: TAPIS, incline: 'haute', minutes: 15, distanceKm: 1.25 }, 'b2');
    expect(formatCardio(haute)).toBe('Tapis de marche · inclinaison haute · 15 min · 1,25 km');
    // Pas d'inclinaison hors tapis, même si elle est fournie.
    const rameur = makeCardioBlock({ machine: RAMEUR, incline: 'haute', minutes: 10 }, 'b3');
    expect(rameur.incline).toBeUndefined();
    expect(formatCardio(rameur)).toBe('Rameur · 10 min');
    expect(formatCardio(makeCardioBlock({ machine: ELLIPTIQUE, minutes: 75 }, 'b4'))).toBe('Vélo elliptique · 1 h 15');

    // Durée en minutes entières, distance facultative.
    expect(cardioErrors({ machine: RAMEUR, minutes: 0 })).toEqual(['invalid_minutes']);
    expect(cardioErrors({ machine: RAMEUR, minutes: 12.5 })).toEqual(['invalid_minutes']);
    expect(cardioErrors({ machine: RAMEUR, minutes: null })).toEqual(['invalid_minutes']);
    expect(cardioErrors({ machine: RAMEUR, minutes: 10, distanceKm: -1 })).toEqual(['invalid_distance']);
    expect(() => makeCardioBlock({ machine: RAMEUR, minutes: 0 }, 'x')).toThrow();
    expect([parseMinutes('20'), parseMinutes('20 min'), parseMinutes('abc'), parseMinutes('0'), parseMinutes('12,5')]).toEqual([20, 20, null, null, null]);
    expect([parseDistance(''), parseDistance('2,5'), parseDistance('2.5 km'), parseDistance('-1')]).toEqual([undefined, 2.5, 2.5, null]);

    let s = startSession(at(14), 's');
    s = addCardio(s, tapis, at(14, 18, 1));
    s = addCardio(s, rameur, at(14, 18, 30));
    expect(cardioOf(s).map((b) => b.id)).toEqual(['b1', 'b3']);
    s = updateCardio(s, { ...tapis, minutes: 25 }, at(14, 18, 40));
    expect(cardioOf(s).map((b) => b.minutes)).toEqual([25, 10]);
    s = removeCardio(s, 'b1', at(14, 18, 41));
    s = removeCardio(s, 'b3', at(14, 18, 42));
    // Une séance sans cardio n'a pas de champ « cardio » : identique à une séance d'une version antérieure.
    expect('cardio' in s).toBe(false);
  });

  it('106. Aucun effet sur le moteur ni ressenti demandé ; une séance réutilisée ne reprend pas le cardio', () => {
    const sessions = [done(at(5), 'a', []), done(at(7), 'b', [])];
    const withCardio = sessions.map((s, i) => addCardio(s, makeCardioBlock({ machine: TAPIS, incline: 'haute', minutes: 20 }, `c${i}`), s.updatedAt));
    const settings = buildEngineSettings(LIB);
    const plain = rebuildProfile(sessions, settings);
    const mixed = rebuildProfile(withCardio, settings);
    expect(mixed.profile).toEqual(plain.profile);
    expect(mixed.evaluations).toEqual(plain.evaluations);
    expect(plain.profile.variants['pec-deck']?.recommendation).toMatchObject({ targetReps: 9 });
    expect(missingFeelings(withCardio[1]!)).toEqual([]);

    const { session: reused } = createSessionFromTemplate(withCardio[1]!, mixed.profile, settings, { id: 'n', name: 'N', date: TODAY, now: at(15) });
    expect(reused.performances.map((p) => p.variantId)).toEqual(['pec-deck']);
    expect(cardioOf(reused)).toEqual([]);
  });

  it('107. Terminer une séance conserve ses blocs ; une séance ne contenant que du cardio est enregistrée', () => {
    let s = startSession(at(14), 'cardio-seul');
    s = addCardio(s, makeCardioBlock({ machine: ELLIPTIQUE, minutes: 30 }, 'e'), at(14, 18, 30));
    const { session, removed } = finishSession(s, at(14, 19));
    expect(removed).toEqual([]);
    expect(session.state).toBe('done');
    expect(session.performances).toEqual([]);
    expect(cardioOf(session)).toEqual([{ id: 'e', machineId: 'elliptique', machine: 'Vélo elliptique', minutes: 30 }]);
  });
});

describe('Cardio : récapitulatif hebdomadaire (§19.6)', () => {
  it('108. Le cardio n’entre dans aucun groupe ; l’en-tête donne le total de la semaine ; une séance de cardio seul compte', () => {
    const sessions = [
      done(at(12), 'lun', [{ m: TAPIS, min: 20, incline: 'haute' }]),
      done(at(13), 'mar', [{ m: RAMEUR, min: 10 }]),
      done(at(14), 'mer', [{ m: ELLIPTIQUE, min: 15 }], false),
      done(at(9), 'semaine-passee', [{ m: RAMEUR, min: 50 }]),
    ];
    const r = weeklyRecap(sessions, LIB, at(15));
    expect(r.sessionCount).toBe(3);
    expect(r.cardioMinutes).toBe(45);
    expect(nb(recapTitle(r))).toBe('Semaine du lun. 12 au dim. 18 oct. : 3 séances · 45 min de cardio');
    // Pectoraux : 2 séances (lundi, mardi) ; la séance de cardio seul ne touche aucun groupe.
    expect(r.cells.find((c) => c.group === 'pectoraux')?.count).toBe(2);
    expect(r.cells.filter((c) => c.group !== 'pectoraux').every((c) => c.count === 0)).toBe(true);

    expect(nb(recapTitle(weeklyRecap([done(at(12), 'x', [{ m: RAMEUR, min: 80 }])], LIB, at(15))))).toBe(
      'Semaine du lun. 12 au dim. 18 oct. : 1 séance · 1 h 20 de cardio',
    );
    // Sans cardio, l'en-tête ne change pas.
    expect(nb(recapTitle(weeklyRecap([done(at(12), 'y', [])], LIB, at(15))))).toBe('Semaine du lun. 12 au dim. 18 oct. : 1 séance');
    // Une séance en cours n'est pas comptée.
    const active = addCardio(startSession(at(15), 'z'), makeCardioBlock({ machine: RAMEUR, minutes: 10 }, 'zz'), at(15));
    expect(weeklyRecap([active], LIB, at(15, 19)).cardioMinutes).toBe(0);
  });
});

describe('Cardio : import de notes', () => {
  it('109. Six formes reconnues ; « Tapis » ou « marche » sans précision = Neutre ; « incliné » sans niveau demande Moyenne ou Haute', () => {
    const lines = [
      'Tapis 15 min',
      'Tapis incliné 20 min',
      'Marche inclinée haute 20min',
      'Rameur 10 min',
      'Elliptique 15 min',
      'Vélo elliptique 20 min',
      'Marche 30 minutes 2,5 km',
    ];
    const draft = draftFromNotes(lines.join('\n'), LIB, TODAY);
    expect(draft.exercises).toEqual([]);
    expect(draft.cardio.map((c) => [c.machine?.id, c.machine?.incline ? c.incline : '-', c.minutes, c.distanceKm])).toEqual([
      ['tapis', 'neutre', 15, null],
      ['tapis', null, 20, null],
      ['tapis', 'haute', 20, null],
      ['rameur', '-', 10, null],
      ['elliptique', '-', 15, null],
      ['elliptique', '-', 20, null],
      ['tapis', 'neutre', 30, 2.5],
    ]);

    const ctx = { exercises: LIB, sessions: [], profile: rebuildProfile([], buildEngineSettings(LIB)).profile };
    const dated = setDraftDate(draft, '2026-10-14');
    const problems = draftProblems(dated, ctx);
    expect(problems.filter((p) => p.level === 'error').map((p) => [p.code, p.exerciseKey])).toEqual([['cardio_incline', 'c2']]);
    // Le choix de l'inclinaison débloque l'import.
    const chosen = updateDraftCardio(dated, 'c2', { incline: 'moyenne' });
    expect(hasBlockingProblems(draftProblems(chosen, ctx))).toBe(false);
    const [session] = finalizeDrafts([chosen], LIB, [], at(15)).sessions;
    expect(session!.performances).toEqual([]);
    expect(cardioOf(session!).map(formatCardio)).toEqual([
      'Tapis de marche · inclinaison neutre · 15 min',
      'Tapis de marche · inclinaison moyenne · 20 min',
      'Tapis de marche · inclinaison haute · 20 min',
      'Rameur · 10 min',
      'Vélo elliptique · 15 min',
      'Vélo elliptique · 20 min',
      'Tapis de marche · inclinaison neutre · 30 min · 2,5 km',
    ]);
  });

  it('110. Cardio mêlé aux exercices : les exercices sont inchangés ; une machine inconnue est à choisir, jamais devinée', () => {
    const text = `${NOTES_11_3}\n\nTapis\n12 min\n\nVélo 20 min`;
    const parsed = parseNotes(text, TODAY);
    expect(parsed.entries).toHaveLength(6);
    expect(parsed.title).toBeNull();
    expect(parsed.cardio.map((c) => [c.sourceName, c.minutes])).toEqual([['Tapis', 12], ['Vélo', 20]]);
    const draft = withExampleChoices(setDraftDate(draftFromNotes(text, LIB, TODAY), '2026-10-14'));
    expect(draft.cardio[1]!.machine).toBeNull();
    const ctx = { exercises: LIB, sessions: [], profile: rebuildProfile([], buildEngineSettings(LIB)).profile };
    expect(draftProblems(draft, ctx).filter((p) => p.level === 'error').map((p) => p.code)).toEqual(['cardio_machine']);
    // Un nom de machine des réglages est reconnu.
    const machines = [...DEFAULT_CARDIO_MACHINES, newMachine('Vélo', false, DEFAULT_CARDIO_MACHINES)];
    expect(draftFromNotes(text, LIB, TODAY, machines).cardio[1]!.machine?.name).toBe('Vélo');
    // Exclure le bloc inconnu suffit aussi.
    const excluded = updateDraftCardio(draft, 'c2', { include: false });
    expect(hasBlockingProblems(draftProblems(excluded, ctx))).toBe(false);
    const [session] = finalizeDrafts([excluded], LIB, [], at(15)).sessions;
    expect(session!.performances).toHaveLength(6);
    expect(cardioOf(session!).map(formatCardio)).toEqual(['Tapis de marche · inclinaison neutre · 12 min']);
    // JSON simple : même rapprochement ; une inclinaison inconnue reste à choisir.
    const json = JSON.stringify({
      schemaVersion: 1,
      sessions: [{ date: '2026-10-14', cardio: [{ machine: 'Tapis', inclinaison: 'haute', minutes: 20 }, { machine: 'Tapis', inclinaison: 'raide', minutes: 5 }, { machine: 'Rameur', minutes: 10, distanceKm: 2 }] }],
    });
    const fromJson = parseJsonImport(json, LIB, TODAY);
    if (fromJson.kind !== 'drafts') throw new Error(fromJson.kind);
    expect(fromJson.drafts[0]!.cardio.map((c) => [c.machine?.id, c.incline, c.minutes, c.distanceKm])).toEqual([
      ['tapis', 'haute', 20, null],
      ['tapis', null, 5, null],
      ['rameur', 'neutre', 10, 2],
    ]);
  });
});

describe('Cardio : sauvegarde, migration et réglages', () => {
  it('111. Export puis import : blocs et machines conservés ; un doublon tient compte du cardio ; un bloc invalide est refusé', async () => {
    const sessions = [done(at(12), 'a', [{ m: TAPIS, min: 20, incline: 'haute' }, { m: RAMEUR, min: 10 }]), done(at(13), 'b', [], false)];
    const machines = [...DEFAULT_CARDIO_MACHINES.slice(0, 3), { id: 'cardio-velo', name: 'Vélo', incline: false }];
    const backup = buildBackup({ sessions, exercises: LIB, settings: { cardioMachines: machines } }, at(15));
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION);
    const parsed = parseJsonImport(JSON.stringify(backup), LIB, TODAY);
    if (parsed.kind !== 'backup') throw new Error(parsed.kind);
    expect(sanitizeCardioMachines(parsed.backup.settings.cardioMachines)).toEqual(machines);

    const repo = new Repository(await openAppDb('test-cardio-1'));
    await repo.ensureSeed();
    await repo.applyImport(planImport(parsed.backup, { sessions: [], exercises: await repo.loadExercises() }, { mode: 'merge' }));
    const restored = await repo.loadSessions();
    expect(restored.sort((x, y) => x.id.localeCompare(y.id))).toEqual(sessions);
    // Réimport : rien de nouveau.
    const again = planImport(parsed.backup, { sessions: restored, exercises: await repo.loadExercises() }, { mode: 'merge' });
    expect([again.sessions.length, again.identical.length]).toEqual([0, 2]);
    repo.close();

    // Même date, mêmes exercices, autre cardio : pas un doublon.
    const other = { ...sessions[0]!, id: 'autre', cardio: [{ ...sessions[0]!.cardio![0]!, minutes: 25 }] };
    const plan = planImport(buildBackup({ sessions: [other], exercises: LIB }, 1), { sessions, exercises: LIB }, { mode: 'merge' });
    expect(plan.duplicates).toEqual([]);
    const same = { ...sessions[0]!, id: 'meme' };
    expect(planImport(buildBackup({ sessions: [same], exercises: LIB }, 1), { sessions, exercises: LIB }, { mode: 'merge' }).duplicates).toHaveLength(1);

    const invalid = buildBackup({ sessions: [{ ...sessions[1]!, cardio: [{ id: 'x', machineId: 'tapis', machine: 'Tapis', incline: 'raide', minutes: 0 }] } as unknown as Session], exercises: LIB }, 1);
    const rejected = parseJsonImport(JSON.stringify(invalid), LIB, TODAY);
    expect(rejected.kind).toBe('error');
    if (rejected.kind === 'error') expect(rejected.details).toEqual(['sessions[0].cardio[0].incline inconnue.', 'sessions[0].cardio[0].minutes invalide.']);
  });

  it('112. Installation existante : une sauvegarde au format 2 est migrée sans perte et la liste des machines par défaut s’applique', async () => {
    const old = done(at(12), 'ancienne', []);
    const v2 = { ...buildBackup({ sessions: [old], exercises: LIB, settings: { weeklyRecap: { groups: ['dos'], redThreshold: 3 } } }, 1), schemaVersion: 2 };
    const parsed = parseJsonImport(JSON.stringify(v2), LIB, TODAY);
    if (parsed.kind !== 'backup') throw new Error(parsed.kind);
    expect(parsed.backup.schemaVersion).toBe(3);
    expect(parsed.backup.sessions).toEqual([old]);
    expect(parsed.backup.settings).toEqual({ weeklyRecap: { groups: ['dos'], redThreshold: 3 } });
    // Format plus récent : refusé, rien n'est importé.
    expect(parseJsonImport(JSON.stringify({ ...v2, schemaVersion: 4 }), LIB, TODAY).kind).toBe('error');

    // Base d'une version antérieure : séances sans cardio relues telles quelles, aucune liste de machines enregistrée.
    const repo = new Repository(await openAppDb('test-cardio-2'));
    await repo.ensureSeed();
    await repo.putSession(old);
    expect(await repo.loadSessions()).toEqual([old]);
    expect(sanitizeCardioMachines(await repo.getMeta('cardioMachines'))).toEqual(DEFAULT_CARDIO_MACHINES);
    repo.close();
  });

  it('113. Liste des machines : modifiable, noms uniques et non vides ; renommer une machine ne change pas les séances enregistrées', () => {
    const list = [...DEFAULT_CARDIO_MACHINES, newMachine('Vélo droit', false, DEFAULT_CARDIO_MACHINES)];
    expect(list.at(-1)).toEqual({ id: 'cardio-velo-droit', name: 'Vélo droit', incline: false });
    expect(machineListErrors(list)).toEqual([]);
    expect(machineListErrors([...list, { id: 'y', name: 'velo DROIT', incline: false }])).toEqual(['duplicate_name']);
    expect(machineListErrors([{ id: 'x', name: ' ', incline: true }])).toEqual(['empty_name']);
    expect(machineListErrors([])).toEqual(['empty_list']);
    expect(sanitizeCardioMachines([{ id: 'a', name: 'A', incline: 'oui' }, 3])).toEqual(DEFAULT_CARDIO_MACHINES);
    expect(sanitizeCardioMachines([{ id: 'a', name: 'A', incline: true }, { id: 'a', name: 'B', incline: false }])).toEqual([{ id: 'a', name: 'A', incline: true }]);

    const s = done(at(12), 'r', [{ m: TAPIS, min: 20 }]);
    const renamed = sanitizeCardioMachines([{ ...TAPIS, name: 'Tapis' }]);
    expect(renamed[0]!.name).toBe('Tapis');
    expect(cardioOf(s)[0]!.machine).toBe('Tapis de marche');
  });
});
