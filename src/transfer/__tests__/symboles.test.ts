import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Exercise, Feeling, Performance, Session, Status } from '../../domain/types';
import { computeStatus, isEvaluable, rebuildProfile } from '../../engine';
import { buildEngineSettings } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { openAppDb, Repository } from '../../storage/db';
import { buildBackup, parseJsonImport } from '../backup';
import { draftFromNotes, draftProblems, finalizeDrafts, hasBlockingProblems, setDraftDate, updateDraftExercise } from '../draft';
import { fixPlusEqualFeelings } from '../feelings';
import { parseNotes } from '../notes';

const TODAY = '2026-10-15';
const LIB: readonly Exercise[] = SEED_EXERCISES;
const SETTINGS = buildEngineSettings(LIB);

/** Import complet d'un bloc collé, comme l'écran d'import : performance enregistrée. */
function importPasted(text: string): Performance {
  const draft = setDraftDate(draftFromNotes(text, LIB, TODAY), TODAY);
  const problems = draftProblems(draft, { sessions: [], exercises: LIB, profile: rebuildProfile([], SETTINGS).profile });
  expect(hasBlockingProblems(problems), JSON.stringify(problems)).toBe(false);
  const perf = finalizeDrafts([draft], LIB, [], 1).sessions[0]?.performances[0];
  if (!perf) throw new Error(`Aucune performance pour ${text}`);
  return perf;
}

function statusOf(p: Performance): Status {
  if (!isEvaluable(p)) throw new Error('Performance non évaluable');
  return computeStatus(p);
}

const chest = (feeling: Feeling, feelingSymbol?: string): Performance => ({
  variantId: 'chest-press',
  weightKg: 52,
  targetReps: 8,
  plannedSets: 3,
  reps: [8, 8, 8],
  feeling,
  ...(feelingSymbol ? { feelingSymbol } : {}),
});

const done = (id: string, date: string, performances: Performance[]): Session => ({
  id,
  name: id,
  date,
  startedAt: null,
  endedAt: null,
  createdAt: 0,
  updatedAt: 0,
  origin: 'import',
  state: 'done',
  performances,
});

describe('Symboles de ressenti collés (§7.3, §11.5)', () => {
  it('166. « Chest press\\n3x8x52kg += » : Moyen, symbole conservé, orange ; jamais lu comme « + »', () => {
    const parsed = parseNotes('Chest press\n3x8x52kg +=', TODAY).entries;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ sourceName: 'Chest press', weightKg: 52, reps: [8, 8, 8], feeling: 'moyen', feelingSymbol: '+=', issues: [] });

    const perf = importPasted('Chest press\n3x8x52kg +=');
    expect(perf).toMatchObject({ variantId: 'chest-press', weightKg: 52, targetReps: 8, reps: [8, 8, 8], feeling: 'moyen', feelingSymbol: '+=' });
    expect(statusOf(perf)).toBe('orange');

    // Écritures voisines : collé, espacé, autre unité, signe × ; toujours Moyen.
    for (const text of ['Chest press\n3x8x52kg+=', 'Chest press\n3x8x52kg + =', 'Chest press\n3×8×52 kgs +=', 'Chest press 3x8x52kg +=']) {
      const p = importPasted(text);
      expect(p.feeling, text).toBe('moyen');
      expect(p.feelingSymbol, text).toBe('+=');
    }
  });

  it('167. Les autres symboles collés donnent leur ressenti et leur statut (§7.3, §7.4)', () => {
    const cases: [string, Feeling, Status][] = [
      ['++', 'tres_bien', 'vert'],
      ['+', 'bien', 'vert'],
      ['+=', 'moyen', 'orange'],
      ['=', 'moyen', 'orange'],
      ['-=', 'mal', 'orange'],
      ['--', 'tres_mal', 'rouge'],
    ];
    for (const [symbol, feeling, status] of cases) {
      const text = `Chest press\n3x8x52kg ${symbol}`;
      expect(parseNotes(text, TODAY).entries[0], text).toMatchObject({ feeling, feelingSymbol: symbol, issues: [] });
      const perf = importPasted(text);
      expect(perf.feeling, text).toBe(feeling);
      expect(perf.feelingSymbol, text).toBe(symbol);
      expect(statusOf(perf), text).toBe(status);
    }
    // Sans symbole : ressenti inconnu, orange.
    const none = importPasted('Chest press\n3x8x52kg');
    expect(none.feeling).toBe('inconnu');
    expect(none.feelingSymbol).toBeUndefined();
    expect(statusOf(none)).toBe('orange');
  });

  it('168. Un ressenti choisi dans l’aperçu qui contredit un symbole connu le remplace : « += » n’est jamais enregistré avec « Bien »', () => {
    const draft = setDraftDate(draftFromNotes('Chest press\n3x8x52kg +=', LIB, TODAY), TODAY);
    const key = draft.exercises[0]!.key;
    const changed = updateDraftExercise(draft, key, { feeling: 'bien', feelingConfirmed: true });
    const perf = finalizeDrafts([changed], LIB, [], 1).sessions[0]!.performances[0]!;
    expect(perf.feeling).toBe('bien');
    expect(perf.feelingSymbol).toBeUndefined();

    // Symbole inconnu : le ressenti choisi l'interprète, le symbole d'origine reste conservé.
    const unknown = setDraftDate(draftFromNotes('Chest press\n3x8x52kg ~', LIB, TODAY), TODAY);
    const chosen = updateDraftExercise(unknown, unknown.exercises[0]!.key, { feeling: 'moyen', feelingConfirmed: true });
    expect(finalizeDrafts([chosen], LIB, [], 1).sessions[0]!.performances[0]).toMatchObject({ feeling: 'moyen', feelingSymbol: '~' });
  });
});

describe('Correction des ressentis « += » enregistrés à tort (§7.3)', () => {
  const wrong = () => [
    done('s1', '2026-10-12', [chest('tres_bien', '++')]),
    done('s2', '2026-10-15', [chest('bien', '+='), { ...chest('bien', '+'), variantId: 'pec-deck' }]),
  ];

  it('169. Seuls les « += » sans Moyen passent à Moyen ; les autres ressentis ne sont pas touchés', () => {
    const sessions = [
      ...wrong(),
      done('s3', '2026-10-16', [chest('moyen', '+=')]),
      done('s4', '2026-10-17', [chest('moyen', '+'), { ...chest('bien', '-='), variantId: 'pec-deck' }, { ...chest('tres_mal'), variantId: 'leg-curl' }]),
      done('s5', '2026-10-18', [chest('tres_bien', ' + = ')]),
    ];
    const fixed = fixPlusEqualFeelings(sessions);
    expect(fixed.map((s) => s.id)).toEqual(['s2', 's5']);
    expect(fixed[0]!.performances).toEqual([chest('moyen', '+='), { ...chest('bien', '+'), variantId: 'pec-deck' }]);
    expect(fixed[1]!.performances[0]?.feeling).toBe('moyen');
    expect(fixed[0]!.updatedAt).toBe(0);
    // Données d'origine intactes.
    expect(sessions[1]!.performances[0]?.feeling).toBe('bien');
  });

  it('170. Profil recalculé : le chest press n’est plus compté vert, plus de +1 répétition', () => {
    const before = rebuildProfile(wrong(), SETTINGS);
    expect(before.profile.variants['chest-press']?.greenStreak).toBe(2);
    expect(before.profile.variants['chest-press']?.recommendation).toMatchObject({ kind: 'reps_up', targetReps: 9 });
    const fixed = new Map(fixPlusEqualFeelings(wrong()).map((s) => [s.id, s]));
    const after = rebuildProfile(wrong().map((s) => fixed.get(s.id) ?? s), SETTINGS);
    expect(after.evaluations.filter((e) => e.variantId === 'chest-press').map((e) => e.status)).toEqual(['vert', 'orange']);
    expect(after.profile.variants['chest-press']?.greenStreak).toBe(0);
    expect(after.profile.variants['chest-press']?.recommendation).toMatchObject({ kind: 'keep', targetReps: 8 });
    expect(after.profile.variants['chest-press']?.palier).toEqual({ weightKg: 52, targetReps: 8 });
  });

  it('171. Migration de la base appliquée une seule fois, en une transaction', async () => {
    const repo = new Repository(await openAppDb('test-plus-equal'));
    for (const s of wrong()) await repo.putSession(s);
    expect(await repo.ensurePlusEqualFix()).toBe(1);
    const sessions = await repo.loadSessions();
    expect(sessions.find((s) => s.id === 's2')?.performances[0]).toEqual(chest('moyen', '+='));
    expect(sessions.find((s) => s.id === 's1')).toEqual(wrong()[0]);
    expect(sessions.find((s) => s.id === 's2')?.performances[1]).toEqual({ ...chest('bien', '+'), variantId: 'pec-deck' });

    // Une seule fois : un second lancement ne relit ni ne réécrit rien.
    await repo.putSession(done('s9', '2026-10-19', [chest('bien', '+=')]));
    expect(await repo.ensurePlusEqualFix()).toBe(0);
    expect((await repo.loadSessions()).find((s) => s.id === 's9')?.performances[0]?.feeling).toBe('bien');
    repo.close();
  });

  it('172. Une sauvegarde contenant un « += » enregistré avec « Bien » est restaurée corrigée', () => {
    const text = JSON.stringify(buildBackup({ sessions: wrong(), exercises: LIB }, Date.UTC(2026, 9, 18)));
    const parsed = parseJsonImport(text, LIB, TODAY);
    if (parsed.kind !== 'backup') throw new Error(parsed.kind);
    expect(parsed.backup.sessions.find((s) => s.id === 's2')?.performances[0]).toEqual(chest('moyen', '+='));
    expect(parsed.backup.sessions.find((s) => s.id === 's1')).toEqual(wrong()[0]);
  });
});
