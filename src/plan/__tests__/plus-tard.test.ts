import { describe, expect, it } from 'vitest';
import type { CardioBlock, Exercise, Session } from '../../domain/types';
import { DEFAULT_VARIANT_CONFIG, rebuildProfile } from '../../engine';
import { buildEngineSettings } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { addCardio } from '../../cardio/model';
import {
  addExercise,
  cancelAdditions,
  finishSession,
  recordRemainingSets,
  recordSet,
  removeExercise,
  reopenSession,
  startSession,
  type VariantContext,
} from '../../session/ops';
import { buildBackup, parseJsonImport } from '../../transfer/backup';
import { addPlanCardio, addToPlan, canPostpone, newPlan, nextUnfinished, postponeStep, sessionSteps, startFromPlan } from '../model';

const LIB: Exercise[] = [...SEED_EXERCISES];
const NEW: VariantContext = { state: undefined, cfg: DEFAULT_VARIANT_CONFIG };
const at = (h: number, m = 0) => new Date(2026, 9, 28, h, m).getTime();
const TAPIS: CardioBlock = { id: 'prevu-tapis', machineId: 'tapis', machine: 'Tapis de marche', incline: 'neutre', minutes: 15 };
const keys = (s: Session) => sessionSteps(s).map((st) => st.key);

/** Séance libre : pec deck, leg curl, chest press ajoutés dans cet ordre, aucune série faite. */
function free(): Session {
  let s = startSession(at(18), 'libre');
  for (const id of ['pec-deck', 'leg-curl', 'chest-press']) s = addExercise(s, id, NEW, at(18, 1), 30).session;
  return s;
}

describe('« Plus tard » en séance (version 1.29.0)', () => {
  it('267. L’élément passe en fin de liste, le suivant non terminé s’ouvre ; séance libre et prévue (plan intact) ; enregistré à sa place à la fin', () => {
    // Séance libre : « Plus tard » sur le premier → il passe en fin de liste, le leg curl (suivant) s'ouvre.
    let s = free();
    expect(canPostpone(sessionSteps(s), 'pec-deck')).toBe(true);
    expect(nextUnfinished(sessionSteps(s), 'pec-deck')?.key).toBe('leg-curl');
    s = postponeStep(s, 'pec-deck', at(18, 2));
    expect(s.later).toEqual(['pec-deck']);
    expect(keys(s)).toEqual(['leg-curl', 'chest-press', 'pec-deck']);
    // Le dernier de la liste remis à plus tard : le suivant non terminé est cherché depuis le début.
    expect(nextUnfinished(sessionSteps(s), 'pec-deck')?.key).toBe('leg-curl');
    // Deux remis à plus tard : dans l'ordre où ils l'ont été ; remis une seconde fois, il repasse dernier.
    s = postponeStep(s, 'leg-curl', at(18, 3));
    expect(keys(s)).toEqual(['chest-press', 'pec-deck', 'leg-curl']);
    s = postponeStep(s, 'pec-deck', at(18, 4));
    expect(keys(s)).toEqual(['chest-press', 'leg-curl', 'pec-deck']);
    // Un exercice ajouté ensuite vient avant ceux remis à plus tard, qui restent en fin de liste.
    s = addExercise(s, 'leg-extension', NEW, at(18, 5), 40).session;
    expect(keys(s)).toEqual(['chest-press', 'leg-extension', 'leg-curl', 'pec-deck']);
    // Commencé (1 série sur 3) : encore proposé ; toutes les séries faites (ressenti à donner) : plus proposé.
    s = recordSet(s, 'chest-press', 8, at(18, 6));
    expect(canPostpone(sessionSteps(s), 'chest-press')).toBe(true);
    s = recordRemainingSets(s, 'chest-press', at(18, 7));
    expect(canPostpone(sessionSteps(s), 'chest-press')).toBe(false);
    // Rien d'autre à faire : pas proposé (le seul exercice restant).
    const alone = addExercise(startSession(at(18), 'seul'), 'pec-deck', NEW, at(18), 30).session;
    expect(canPostpone(sessionSteps(alone), 'pec-deck')).toBe(false);
    // Retiré de la séance : il n'est plus « plus tard ».
    expect(removeExercise(s, 'pec-deck', at(18, 8)).later).toEqual(['leg-curl']);
    expect(removeExercise(postponeStep(alone, 'pec-deck', at(18)), 'pec-deck', at(18))).not.toHaveProperty('later');

    // Fin : exercices enregistrés à leur place (ceux remis à plus tard en dernier), sans trace de « plus tard » ; le
    // moteur ne voit que les performances.
    for (const id of ['leg-extension', 'leg-curl', 'pec-deck']) s = recordRemainingSets(s, id, at(18, 30));
    const { session: done } = finishSession(s, at(19));
    expect(done).not.toHaveProperty('later');
    expect(done.performances.map((p) => p.variantId)).toEqual(['chest-press', 'leg-extension', 'leg-curl', 'pec-deck']);
    const settings = buildEngineSettings(LIB);
    expect(rebuildProfile([done], settings).profile).toEqual(rebuildProfile([{ ...done, performances: [...done.performances].reverse() }], settings).profile);

    // Séance prévue : pec deck, cardio prévu, leg curl. Le cardio prévu se remet à plus tard ; le plan et l'origine
    // `fromPlan` ne changent pas.
    let plan = newPlan(at(9), 'plan');
    plan = addToPlan(plan, 'pec-deck', at(9), 30);
    plan = addPlanCardio(plan, TAPIS, at(9));
    plan = addToPlan(plan, 'leg-curl', at(9), 20);
    const planBefore = structuredClone(plan);
    let p = startFromPlan(plan, () => NEW, () => true, at(18), 'prevue');
    const origin = structuredClone(p.fromPlan);
    expect(keys(p)).toEqual(['pec-deck', 'cardio:prevu-tapis', 'leg-curl']);
    // Le premier exercice (ouvert) remis à plus tard : le cardio prévu s'ouvre.
    expect(nextUnfinished(sessionSteps(p), 'pec-deck')?.key).toBe('cardio:prevu-tapis');
    p = postponeStep(p, 'pec-deck', at(18, 1));
    expect(keys(p)).toEqual(['cardio:prevu-tapis', 'leg-curl', 'pec-deck']);
    expect(canPostpone(sessionSteps(p), 'cardio:prevu-tapis')).toBe(true);
    expect(nextUnfinished(sessionSteps(p), 'cardio:prevu-tapis')?.key).toBe('leg-curl');
    p = postponeStep(p, 'cardio:prevu-tapis', at(18, 2));
    expect(keys(p)).toEqual(['leg-curl', 'pec-deck', 'cardio:prevu-tapis']);
    expect(p.fromPlan).toEqual(origin);
    expect(plan).toEqual(planBefore);
    // Validé, le cardio reste à sa place (fin de liste) et n'est plus proposé à « Plus tard ».
    p = addCardio(p, TAPIS, at(18, 20));
    expect(sessionSteps(p).at(-1)).toMatchObject({ key: 'cardio:prevu-tapis', pending: false });
    expect(canPostpone(sessionSteps(p), 'cardio:prevu-tapis')).toBe(false);

    // Séance complétée : ce qui est déjà fait n'est jamais proposé ; « Annuler les ajouts » efface « plus tard ».
    let reopened = reopenSession(done, at(20));
    reopened = addExercise(addExercise(reopened, 'curl-biceps-halteres', NEW, at(20), 12).session, 'shrugs', NEW, at(20), 20).session;
    expect(canPostpone(sessionSteps(reopened), 'pec-deck')).toBe(false);
    expect(canPostpone(sessionSteps(reopened), 'curl-biceps-halteres')).toBe(true);
    reopened = postponeStep(reopened, 'curl-biceps-halteres', at(20, 1));
    expect(cancelAdditions(reopened, at(20, 2))).not.toHaveProperty('later');

    // Sauvegarde : « plus tard » gardé pour une séance en cours, refusé sur une séance terminée.
    const backup = buildBackup({ sessions: [p], exercises: LIB }, at(21));
    const parsed = parseJsonImport(JSON.stringify(backup), LIB, '2026-10-28');
    expect(parsed.kind === 'backup' && parsed.backup.sessions[0]?.later).toEqual(['pec-deck', 'cardio:prevu-tapis']);
    const bad = parseJsonImport(JSON.stringify({ ...backup, sessions: [{ ...done, later: ['pec-deck'] }] }), LIB, '2026-10-28');
    expect(bad.kind === 'error' && bad.details).toContain('sessions[0].later invalide.');
  });
});
