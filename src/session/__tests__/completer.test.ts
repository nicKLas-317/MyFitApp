import { describe, expect, it } from 'vitest';
import type { CardioBlock, Exercise, Session } from '../../domain/types';
import { DEFAULT_VARIANT_CONFIG, rebuildProfile } from '../../engine';
import { buildEngineSettings } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { addCardio } from '../../cardio/model';
import { addPlanCardio, addToPlan, newPlan, plannedNotDone, sessionSteps, startFromPlan, unfinishedStep } from '../../plan/model';
import { buildReport, periodContaining } from '../../analysis/report';
import { buildBackup, parseJsonImport } from '../../transfer/backup';
import {
  addExercise,
  canComplete,
  cancelAdditions,
  cancelLoss,
  completableSession,
  completeLabel,
  elapsedMs,
  finishSession,
  isForgotten,
  missingFeelings,
  recordRemainingSets,
  recordSet,
  reopenSession,
  setFeeling,
  startSession,
  type VariantContext,
} from '../ops';

const LIB: Exercise[] = [...SEED_EXERCISES];
const settings = buildEngineSettings(LIB);
const NEW: VariantContext = { state: undefined, cfg: DEFAULT_VARIANT_CONFIG };
const BW: VariantContext = { state: undefined, cfg: { ...DEFAULT_VARIANT_CONFIG, bodyweight: true, minReps: 10, maxReps: 40, sets: 2 } };
const at = (h: number, m = 0, d = 27) => new Date(2026, 9, d, h, m).getTime();
const MIN = 60_000;
const TAPIS: CardioBlock = { id: 'tapis', machineId: 'tapis', machine: 'Tapis de marche', minutes: 15, incline: 'neutre' };

/** Séance du matin, à la salle : 8 h 00 – 8 h 45, développé incliné fait (ressenti inconnu) et 15 min de tapis. */
function morning(home = false): Session {
  let s = addExercise(startSession(at(8), 'matin', home), 'developpe-incline', NEW, at(8, 5), 40).session;
  s = recordRemainingSets(s, 'developpe-incline', at(8, 20));
  s = addCardio(s, TAPIS, at(8, 30));
  return finishSession(s, at(8, 45)).session;
}

describe('Compléter une séance terminée le même jour (version 1.28.0)', () => {
  it('265. Rouverte : pause retirée de la durée, ce qui était fait fermé, ajouts annulables ; terminée : une seule séance', () => {
    const done = morning();
    // Seulement une séance du jour, saisie dans l'appli, avec ses heures.
    expect(canComplete(done, at(19))).toBe(true);
    expect(canComplete(done, at(9, 0, 28))).toBe(false);
    expect(canComplete({ ...done, origin: 'import' }, at(19))).toBe(false);
    expect(canComplete({ ...done, state: 'active', endedAt: null }, at(19))).toBe(false);
    // La dernière terminée du jour ; libellé selon l'heure de début.
    const noon = { ...morning(), id: 'midi', startedAt: at(13), endedAt: at(13, 30) };
    expect(completableSession([done, noon, { ...done, id: 'hier', date: '2026-10-26' }], at(19))?.id).toBe('midi');
    expect(completableSession([{ ...done, id: 'hier', date: '2026-10-26' }], at(19))).toBeUndefined();
    expect(completeLabel(done)).toBe('Compléter la séance de ce matin');
    expect(completeLabel(noon)).toBe('Compléter la séance de cet après-midi');
    expect(completeLabel({ ...done, startedAt: at(19) })).toBe('Compléter la séance de ce soir');

    // Rouverte à 18 h : en cours, durée reprise à 45 min (pause de 9 h 15 retirée), pas une séance oubliée.
    let s = reopenSession(done, at(18));
    expect(s).toMatchObject({
      state: 'active', endedAt: null, pauseMs: 555 * MIN,
      locked: { variantIds: ['developpe-incline'], cardioIds: ['tapis'], endedAt: at(8, 45), pauseMs: 0 },
    });
    expect(elapsedMs(s, at(18))).toBe(45 * MIN);
    expect(isForgotten(s, at(18, 10))).toBe(false);
    // Ce qui était fait est fermé : jamais « à finir », ni ressenti demandé.
    expect(sessionSteps(s).map((st) => [st.key, st.locked, unfinishedStep(st)])).toEqual([
      ['developpe-incline', true, false],
      ['cardio:tapis', true, false],
    ]);
    expect(missingFeelings(s)).toEqual([]);
    expect(cancelLoss(s)).toBe('Rien n’a été saisi.');

    // Ajout : pompes, 2 séries ; « Annuler les ajouts » ne parle que d'elles et rend la séance du matin à l'identique.
    s = addExercise(s, 'pompes', BW, at(18, 5)).session;
    s = recordSet(recordSet(s, 'pompes', 10, at(18, 10)), 'pompes', 10, at(18, 12));
    expect(cancelLoss(s)).toBe('2 séries seront perdues.');
    expect(missingFeelings(s).map((p) => p.variantId)).toEqual(['pompes']);
    expect(cancelAdditions(s, at(18, 13))).toEqual({ ...done, updatedAt: at(18, 13) });

    // Terminée à 18 h 20 : une seule séance, durée 45 + 20 min, partie fermée retirée ; le moteur la rejoue une fois.
    s = setFeeling(s, 'pompes', 'bien', at(18, 15));
    const finished = finishSession(s, at(18, 20)).session;
    expect(finished).not.toHaveProperty('locked');
    expect(finished).toMatchObject({ id: 'matin', state: 'done', startedAt: at(8), endedAt: at(18, 20), pauseMs: 555 * MIN });
    expect(finished.performances.map((p) => p.variantId)).toEqual(['developpe-incline', 'pompes']);
    expect(elapsedMs(finished, at(23))).toBe(65 * MIN);
    const replay = rebuildProfile([finished], settings);
    expect(replay.evaluations.map((e) => [e.sessionId, e.variantId])).toEqual([['matin', 'developpe-incline'], ['matin', 'pompes']]);
    // Bilan : une séance, durée en salle 1 h 05.
    const report = buildReport(periodContaining('week', at(23)), { sessions: [finished], exercises: LIB, evaluations: replay.evaluations, settings, groups: ['pectoraux'], weighIns: [], now: at(23) });
    expect(report.totals).toMatchObject({ sessionCount: 1, durationMs: 65 * MIN, unknownDuration: 0 });
    // Complétée une deuxième fois le soir : les pauses s'additionnent ; annuler ces ajouts garde la première pause.
    const again = reopenSession(finished, at(21));
    expect(again.pauseMs).toBe((555 + 160) * MIN);
    expect(elapsedMs(again, at(21))).toBe(65 * MIN);
    expect(cancelAdditions(again, at(21, 1))).toEqual({ ...finished, updatedAt: at(21, 1) });

    // Sauvegarde au format 7 : pause et partie fermée (séance en cours) gardées ; le format 6 est lu tel quel.
    const backup = buildBackup({ sessions: [finished, { ...again, id: 'en-cours' }], exercises: LIB }, at(22));
    expect(backup.schemaVersion).toBe(7);
    const parsed = parseJsonImport(JSON.stringify(backup), LIB, '2026-10-27');
    expect(parsed.kind === 'backup' && parsed.backup.sessions).toEqual([finished, { ...again, id: 'en-cours' }]);
    expect(parseJsonImport(JSON.stringify({ ...backup, schemaVersion: 6, sessions: [done] }), LIB, '2026-10-27').kind).toBe('backup');
    for (const [bad, error] of [
      [{ ...finished, pauseMs: -1 }, 'sessions[0].pauseMs invalide.'],
      [{ ...finished, locked: again.locked }, 'sessions[0].locked invalide.'],
      [{ ...again, locked: { ...again.locked, variantIds: [3] } }, 'sessions[0].locked invalide.'],
    ] as const) {
      const result = parseJsonImport(JSON.stringify({ ...backup, sessions: [bad] }), LIB, '2026-10-27');
      expect(result.kind === 'error' && result.details).toContain(error);
    }
  });

  it('265. Séance prévue complétée : le cardio prévu non fait n’est plus proposé ; à la maison, le lieu est gardé', () => {
    let plan = newPlan(at(7), 'plan');
    plan = addToPlan(plan, 'pec-deck', at(7), 30);
    plan = addPlanCardio(plan, TAPIS, at(7));
    let s = startFromPlan(plan, () => NEW, () => true, at(8), 'prevue');
    s = recordRemainingSets(s, 'pec-deck', at(8, 20));
    const done = finishSession(s, at(8, 40)).session;
    const reopened = reopenSession(done, at(17));
    expect(sessionSteps(reopened).map((st) => st.key)).toEqual(['pec-deck']);
    expect(plannedNotDone(reopened)).toEqual({ exercises: [], cardio: [] });

    const home = reopenSession(morning(true), at(17));
    expect(home).toMatchObject({ state: 'active', location: 'maison' });
    expect(finishSession(home, at(17, 20)).session.location).toBe('maison');
  });
});
