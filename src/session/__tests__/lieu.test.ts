import { describe, expect, it } from 'vitest';
import type { CardioBlock, Exercise, Performance, Session } from '../../domain/types';
import { rebuildProfile, resolveConfig, trackKey } from '../../engine';
import { buildEngineSettings } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { addCardio } from '../../cardio/model';
import { computeRecords } from '../../analysis/records';
import { weeklyRecap } from '../../analysis/weekly';
import { addToPlan, newPlan, startFromPlan } from '../../plan/model';
import { buildBackup, parseJsonImport } from '../../transfer/backup';
import {
  addExercise,
  canSwitchLocation,
  findPerformance,
  finishSession,
  needsStartWeight,
  recordRemainingSets,
  recordSet,
  reopenSession,
  setFeeling,
  setWeight,
  startSession,
  switchKept,
  switchLocation,
  type VariantContext,
} from '../ops';

const LIB: Exercise[] = [...SEED_EXERCISES];
const settings = buildEngineSettings(LIB);
const INCLINE = 'developpe-incline--halteres';
const at = (d: number, h = 18, m = 0) => new Date(2026, 9, d, h, m).getTime();
const TAPIS: CardioBlock = { id: 'tapis', machineId: 'tapis', machine: 'Tapis de marche', minutes: 15, incline: 'neutre' };

const perf = (weightKg: number, reps: number[]): Performance => ({
  variantId: INCLINE, weightKg, targetReps: 9, plannedSets: 3, reps, feeling: 'bien',
});
function done(id: string, d: number, performances: Performance[], home = false): Session {
  return {
    id, name: id, date: `2026-10-${d}`, startedAt: at(d), endedAt: at(d, 19), createdAt: at(d), updatedAt: at(d),
    origin: 'app', state: 'done', performances, ...(home ? { location: 'maison' as const } : {}),
  };
}
/** Développé incliné haltères : 22 kg à la salle (deux vertes à 3 × 9 : +1 rép.), 11,5 kg à la maison (une verte). */
const HISTORY = [done('s19', 19, [perf(22, [9, 9, 9])]), done('m21', 21, [perf(11.5, [9, 9, 9])], true), done('s22', 22, [perf(22, [9, 9, 9])])];
const replay = rebuildProfile(HISTORY, settings);
const ctxFor = (variantId: string, home: boolean): VariantContext => {
  const track = trackKey(settings, variantId, home);
  return { state: replay.profile.variants[track], cfg: resolveConfig(settings, track) };
};
const atHome = (id: string) => ctxFor(id, true);
const atGym = (id: string) => ctxFor(id, false);

describe('Changer le lieu d’une séance en cours (version 1.30.0)', () => {
  it('269. Exercices pas commencés recalculés avec le suivi du nouveau lieu, commencés gardés ; confirmation ; séance prévue et complétée exclues ; comptée au lieu final', () => {
    // Maison → Salle, aucune série : le développé passe de 11,5 kg 3 × 9 (maison) à 22 kg 3 × 10 (salle) ; les pompes
    // (poids du corps, un seul suivi) ne changent pas. Heure de début gardée ; aucune confirmation.
    let home = startSession(at(28), 'maison', true);
    home = addExercise(home, INCLINE, atHome(INCLINE), at(28, 18, 1)).session;
    home = addExercise(home, 'pompes', atHome('pompes'), at(28, 18, 2)).session;
    expect(home.performances.map((p) => [p.weightKg, p.targetReps, p.plannedSets])).toEqual([[11.5, 9, 3], [0, 10, 2]]);
    expect(canSwitchLocation(home)).toBe(true);
    expect(switchKept(home)).toBeNull();
    const gym = switchLocation(home, false, atGym, at(28, 18, 3));
    expect(gym).not.toHaveProperty('location');
    expect(gym).toMatchObject({ startedAt: at(28), updatedAt: at(28, 18, 3) });
    expect(gym.performances.map((p) => [p.weightKg, p.targetReps, p.plannedSets])).toEqual([[22, 10, 3], [0, 10, 2]]);
    // Même lieu : rien ne change ; aller-retour sans série : la séance d'origine.
    expect(switchLocation(gym, false, atGym, at(28, 18, 4))).toBe(gym);
    expect(switchLocation(gym, true, atHome, at(28, 18, 4))).toEqual({ ...home, updatedAt: at(28, 18, 4) });

    // Salle → Maison avec des séries : le développé commencé reste tel quel (22 kg, 10-10-10) ; le curl, jamais fait à
    // la maison, ne garde pas la charge de la salle (version 1.30.1) : poids de départ à saisir, cible au bas de la
    // plage (3 × 8).
    let s = addExercise(startSession(at(28), 'salle'), INCLINE, atGym(INCLINE), at(28, 18, 1)).session;
    s = addExercise(s, 'curl-biceps-halteres', atGym('curl-biceps-halteres'), at(28, 18, 2), 12).session;
    s = recordRemainingSets(s, INCLINE, at(28, 18, 10));
    s = setFeeling(s, INCLINE, 'bien', at(28, 18, 11));
    // Confirmation : ce qui reste tel quel (séries et cardio validés).
    expect(switchKept(recordSet(addExercise(startSession(at(28)), INCLINE, atGym(INCLINE), at(28)).session, INCLINE, 10, at(28)))).toBe(
      '1 série déjà faite restera telle quelle.',
    );
    expect(switchKept(s)).toBe('3 séries déjà faites resteront telles quelles.');
    expect(switchKept(addCardio(startSession(at(28)), TAPIS, at(28)))).toBe('1 cardio déjà fait restera tel quel.');
    expect(switchKept(addCardio(addCardio(startSession(at(28)), TAPIS, at(28)), { ...TAPIS, id: 't2' }, at(28)))).toBe(
      '2 cardios déjà faits resteront tels quels.',
    );
    s = addCardio(s, TAPIS, at(28, 18, 20));
    expect(switchKept(s)).toBe('3 séries et 1 cardio déjà faits resteront tels quels.');
    const moved = switchLocation(s, true, atHome, at(28, 18, 30));
    expect(moved.location).toBe('maison');
    expect(moved.performances).toEqual([s.performances[0], { ...s.performances[1], weightKg: 0, targetReps: 8 }]);
    expect(moved.cardio).toEqual(s.cardio);
    expect(needsStartWeight(moved.performances[1]!, atHome('curl-biceps-halteres').cfg)).toBe(true);
    expect(needsStartWeight(moved.performances[0]!, atHome(INCLINE).cfg)).toBe(false);
    expect(needsStartWeight(home.performances[1]!, atHome('pompes').cfg)).toBe(false);
    // Le poids de départ saisi : 3 × 8 à 6 kg (par haltère).
    expect(findPerformance(setWeight(moved, 'curl-biceps-halteres', 6, atHome('curl-biceps-halteres'), at(28, 18, 31)), 'curl-biceps-halteres')).toMatchObject({
      weightKg: 6, targetReps: 8, reps: [],
    });
    // Sauvegarde : la séance en cours avec un poids de départ à saisir est acceptée ; une charge nulle reste refusée
    // dans une séance terminée.
    const backup = buildBackup({ sessions: [moved], exercises: LIB }, at(28, 18, 32));
    const parsed = parseJsonImport(JSON.stringify(backup), LIB, '2026-10-28');
    expect(parsed.kind === 'backup' && parsed.backup.sessions[0]?.performances[1]?.weightKg).toBe(0);
    const doneZero = { ...moved, state: 'done' as const, endedAt: at(28, 19) };
    const refused = parseJsonImport(JSON.stringify({ ...backup, sessions: [doneZero] }), LIB, '2026-10-28');
    expect(refused.kind === 'error' && refused.details).toContain('Séance salle : charge invalide pour curl-biceps-halteres.');

    // Terminée : comptée au lieu final. Moteur : le développé entre dans le suivi de la maison, la salle est exactement
    // celle d'avant (3 × 10 recommandé) ; records de la salle inchangés ; récapitulatif en séries à la maison.
    const finished = finishSession(moved, at(28, 19)).session;
    const after = rebuildProfile([...HISTORY, finished], settings);
    expect(after.profile.variants[INCLINE]).toEqual(replay.profile.variants[INCLINE]);
    expect(after.profile.variants[`${INCLINE}@maison`]).not.toEqual(replay.profile.variants[`${INCLINE}@maison`]);
    expect(after.evaluations.find((e) => e.sessionId === finished.id)).toMatchObject({ home: true });
    expect(computeRecords([...HISTORY, finished], settings).current.get(INCLINE)).toEqual(computeRecords(HISTORY, settings).current.get(INCLINE));
    const recap = (list: Session[]) => weeklyRecap(list, LIB, at(28, 20)).cells.find((c) => c.group === 'pectoraux')!;
    expect(recap([finished])).toMatchObject({ count: 0, home: 3 });
    // Remise à la salle avant la fin : comptée à la salle, comme si elle n'avait jamais changé.
    const back = finishSession(switchLocation(moved, false, atGym, at(28, 18, 40)), at(28, 19)).session;
    expect(back.location).toBeUndefined();
    expect(back.performances[0]).toEqual(s.performances[0]);
    expect(recap([back])).toMatchObject({ count: 1 });
    expect(recap([back])).not.toHaveProperty('home');
    expect(rebuildProfile([...HISTORY, back], settings).evaluations.find((e) => e.sessionId === back.id)?.home).toBeFalsy();

    // Option absente : séance prévue (toujours à la salle), séance complétée, séance terminée.
    const planned = startFromPlan(addToPlan(newPlan(at(27), 'plan'), INCLINE, at(27)), atGym, () => true, at(28), 'prevue');
    expect(canSwitchLocation(planned)).toBe(false);
    expect(switchLocation(planned, true, atHome, at(28, 18, 5))).toBe(planned);
    const reopened = reopenSession(finished, at(28, 20));
    expect(canSwitchLocation(reopened)).toBe(false);
    expect(switchLocation(reopened, false, atGym, at(28, 20, 5))).toBe(reopened);
    expect(canSwitchLocation(finished)).toBe(false);
  });
});
