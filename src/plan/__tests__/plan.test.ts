import { describe, expect, it } from 'vitest';
import type { CardioBlock, Exercise, Performance, Session } from '../../domain/types';
import { rebuildProfile, resolveConfig } from '../../engine';
import { buildEngineSettings } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { addCardio } from '../../cardio/model';
import { finishSession, recordRemainingSets, recordSet, removeExercise, setFeeling, setWeight, type VariantContext } from '../../session/ops';
import { buildBackup, parseJsonImport } from '../../transfer/backup';
import { cardHint } from '../../ui/TargetSummary';
import {
  addPlanCardio,
  addToPlan,
  consumesPlan,
  currentPlan,
  mergePlan,
  movePlanExercise,
  newPlan,
  pendingPlanCardio,
  planErrors,
  plannedNotDone,
  plannedPerformance,
  removeFromPlan,
  sanitizePlan,
  startFromPlan,
} from '../model';

const LIB: Exercise[] = [...SEED_EXERCISES];
const SETTINGS = buildEngineSettings(LIB);
/** Heure locale, octobre 2026. */
const at = (d: number, h = 18) => new Date(2026, 9, d, h).getTime();
const TAPIS: CardioBlock = { id: 'prevu-tapis', machineId: 'tapis', machine: 'Tapis de marche', incline: 'neutre', minutes: 15 };

let n = 0;
function done(day: number, perfs: Performance[], extra: Partial<Session> = {}): Session {
  const t = at(day);
  return {
    id: `s${++n}`, name: 'Séance', date: `2026-10-${String(day).padStart(2, '0')}`, startedAt: t, endedAt: t + 3_600_000,
    createdAt: t, updatedAt: t, origin: 'app', state: 'done', performances: perfs, ...extra,
  };
}
const perf = (variantId: string, weightKg: number, target: number, feeling: Performance['feeling'] = 'bien'): Performance => ({
  variantId, weightKg, targetReps: target, plannedSets: 3, reps: [target, target, target], feeling,
});

function contexts(sessions: Session[]): (id: string) => VariantContext {
  const { profile } = rebuildProfile(sessions, SETTINGS);
  return (id) => ({ state: profile.variants[id], cfg: resolveConfig(SETTINGS, id) });
}

/** Ligne de cible et mention, comme la carte en séance : « 3 × 9 à 35 kg », « ↑ +1 rép. ». */
function shown(item: { variantId: string; startWeightKg?: number }, ctxFor: (id: string) => VariantContext): string {
  const ctx = ctxFor(item.variantId);
  const p = plannedPerformance(item, ctx)!;
  const { hint } = cardHint(ctx.state, ctx.cfg.assisted, p);
  const label = !hint ? '' : hint.kind === 'change' ? ` ${hint.arrow} ${hint.label}${hint.detail ? ` ${hint.detail}` : ''}` : hint.kind === 'same' ? ' = même cible' : ' départ';
  return `${p.plannedSets} × ${p.targetReps} à ${p.weightKg} kg${label}`;
}

describe('Séance prévue (§5.9)', () => {
  it('242. Préparation : ordre, sans doublon, réordonnée ; charge et cible du moteur comme la carte en séance, puis recalculées au démarrage', () => {
    // Historique : pec deck une verte à 3×8 (35 kg), chest press deux vertes à 3×12 (40 kg).
    const history = [done(12, [perf('pec-deck', 35, 8), perf('chest-press', 40, 12)]), done(15, [perf('chest-press', 40, 12)])];
    let plan = newPlan(at(20, 9), 'plan-1');
    plan = addToPlan(plan, 'pec-deck', at(20, 9));
    plan = addToPlan(plan, 'chest-press', at(20, 9));
    plan = addToPlan(plan, 'leg-curl', at(20, 9), 20);
    expect(addToPlan(plan, 'pec-deck', at(20, 9))).toBe(plan);
    plan = movePlanExercise(plan, 'leg-curl', -1, at(20, 9));
    expect(plan.exercises.map((e) => e.variantId)).toEqual(['pec-deck', 'leg-curl', 'chest-press']);
    expect(movePlanExercise(plan, 'pec-deck', -1, at(20, 9))).toBe(plan);
    plan = addPlanCardio(plan, TAPIS, at(20, 9));

    // À la préparation : ce que le moteur donne aujourd'hui, avec la même mention que la carte en séance.
    const now = contexts(history);
    expect(shown(plan.exercises[0]!, now)).toBe('3 × 8 à 35 kg = même cible');
    expect(shown(plan.exercises[1]!, now)).toBe('3 × 8 à 20 kg départ');
    expect(shown(plan.exercises[2]!, now)).toBe('3 × 12 à 40 kg ↑ Poids supérieur → 3 × 8');

    // Séance libre entre-temps : le pec deck reçoit sa deuxième verte. Le plan reste intact.
    const free = done(21, [perf('pec-deck', 35, 8)]);
    const after = [...history, free];
    expect(currentPlan(plan, after)).toBe(plan);
    const later = contexts(after);
    expect(shown(plan.exercises[0]!, later)).toBe('3 × 9 à 35 kg ↑ +1 rép.');

    // Démarrage 3 jours plus tard : charge et cible recalculées maintenant, séries préremplies, ordre du plan.
    const session = startFromPlan(plan, later, () => true, at(23, 18), 'seance-prevue');
    expect(session.state).toBe('active');
    expect(session.date).toBe('2026-10-23');
    expect(session.performances.map((p) => [p.variantId, p.weightKg, p.targetReps, p.plannedSets, p.reps.length])).toEqual([
      ['pec-deck', 35, 9, 3, 0],
      ['leg-curl', 20, 8, 3, 0],
      ['chest-press', 40, 12, 3, 0],
    ]);
    expect(session.fromPlan).toEqual({ planId: 'plan-1', variantIds: ['pec-deck', 'leg-curl', 'chest-press'], cardio: [TAPIS] });
    expect(session.cardio).toBeUndefined();
    // Un exercice archivé ou supprimé depuis la préparation est ignoré.
    expect(startFromPlan(plan, later, (id) => id !== 'leg-curl', at(23), 'x').performances.map((p) => p.variantId)).toEqual(['pec-deck', 'chest-press']);
  });

  it('243. Réalisé (3 jours plus tard, modifié à la salle) : non faits signalés et pas enregistrés, plan consommé ; séance libre ou vide : plan gardé', () => {
    const history = [done(12, [perf('pec-deck', 35, 8)]), done(15, [perf('pec-deck', 35, 8)])];
    let plan = newPlan(at(20, 9), 'plan-2');
    for (const id of ['pec-deck', 'chest-press', 'leg-extension']) plan = addToPlan(plan, id, at(20, 9), 30);
    plan = addPlanCardio(plan, TAPIS, at(20, 9));
    const ctxFor = contexts(history);
    let s = startFromPlan(plan, ctxFor, () => true, at(23), 'reel');

    // « Valider les 3 séries » : tout d'un coup, à la cible ; il ne reste que le ressenti.
    s = recordRemainingSets(s, 'pec-deck', at(23, 18));
    expect(s.performances[0]!.reps).toEqual([9, 9, 9]);
    expect(recordRemainingSets(s, 'pec-deck', at(23, 18))).toBe(s);
    s = setFeeling(s, 'pec-deck', 'bien', at(23, 18));
    // Modifié à la salle : autre charge pour le chest press (série par série), leg extension retiré, curl ajouté.
    s = setWeight(s, 'chest-press', 32.5, ctxFor('chest-press'), at(23, 18));
    s = recordSet(s, 'chest-press', 8, at(23, 18));
    s = recordSet(s, 'chest-press', 8, at(23, 18));
    s = recordSet(s, 'chest-press', 7, at(23, 18));
    s = removeExercise(s, 'leg-extension', at(23, 18));
    s = { ...s, performances: [...s.performances, { ...perf('curl-biceps-halteres', 10, 8), reps: [] }] };
    expect(pendingPlanCardio(s)).toEqual([TAPIS]);
    expect(plannedNotDone(s)).toEqual({ exercises: [], cardio: [TAPIS] });

    // Autre déroulé : le leg extension prévu n'est pas fait.
    const kept = startFromPlan(plan, ctxFor, () => true, at(23), 'reel-2');
    const partial = addCardio(recordRemainingSets(kept, 'pec-deck', at(23, 18)), TAPIS, at(23, 18));
    expect(pendingPlanCardio(partial)).toEqual([]);
    expect(plannedNotDone(partial).exercises.map((p) => p.variantId)).toEqual(['chest-press', 'leg-extension']);
    expect(currentPlan(plan, [...history, partial])).toBe(plan); // en cours : toujours proposé
    const { session: finished, removed } = finishSession(partial, at(23, 19));
    expect(removed.map((r) => r.performance.variantId)).toEqual(['chest-press', 'leg-extension']);
    expect(finished.performances.map((p) => p.variantId)).toEqual(['pec-deck']);
    expect(finished.cardio).toEqual([TAPIS]);
    expect(consumesPlan(finished, plan.id)).toBe(true);
    expect(currentPlan(plan, [...history, finished])).toBeNull();

    // Séance libre terminée : le plan reste ; séance prévue terminée sans rien de fait : le plan reste aussi.
    const free = done(21, [perf('pec-deck', 35, 9)]);
    expect(currentPlan(plan, [...history, free])).toBe(plan);
    const empty = finishSession(startFromPlan(plan, ctxFor, () => true, at(24), 'vide'), at(24, 19)).session;
    expect(consumesPlan(empty, plan.id)).toBe(false);
    expect(currentPlan(plan, [...history, empty])).toBe(plan);
    // Retrait : le plan vidé n'a plus d'exercice.
    expect(removeFromPlan(removeFromPlan(removeFromPlan(plan, 'pec-deck', 1), 'chest-press', 1), 'leg-extension', 1).exercises).toEqual([]);
  });

  it('243. Contrôle, export et import : plan dans la sauvegarde, fusion (celui de l’appareil gardé), plan inconnu ou invalide refusé', () => {
    let plan = addToPlan(newPlan(at(20, 9), 'plan-3'), 'pec-deck', at(20, 9));
    plan = addPlanCardio(addToPlan(plan, 'leg-curl', at(20, 9), 20), TAPIS, at(20, 9));
    expect(planErrors(plan)).toEqual([]);
    expect(sanitizePlan(plan)).toBe(plan);
    expect(sanitizePlan(undefined)).toBeNull();
    expect(sanitizePlan({ ...plan, exercises: [{ variantId: 'pec-deck' }, { variantId: 'pec-deck' }] })).toBeNull();
    expect(planErrors({ ...plan, exercises: [{ variantId: 'leg-curl', startWeightKg: 0 }] })).toEqual(['plan.exercises[0].startWeightKg invalide.']);
    expect(planErrors({ ...plan, cardio: [{ ...TAPIS, minutes: 0 }] })).toEqual(['plan.cardio[0].minutes invalide.']);

    // Export puis import : le plan revient à l'identique ; une séance démarrée à partir de lui garde son origine.
    const started = startFromPlan(plan, contexts([]), () => true, at(23), 'en-cours');
    const backup = buildBackup({ sessions: [started], exercises: LIB, plan }, at(23));
    const parsed = parseJsonImport(JSON.stringify(backup), LIB, '2026-10-23');
    expect(parsed.kind).toBe('backup');
    if (parsed.kind !== 'backup') return;
    expect(parsed.backup.plan).toEqual(plan);
    expect(parsed.backup.sessions[0]!.fromPlan).toEqual(started.fromPlan);
    // Sauvegarde antérieure (format 4 sans plan) : aucun plan.
    const { plan: _omit, ...older } = buildBackup({ sessions: [], exercises: LIB }, at(23));
    const old = parseJsonImport(JSON.stringify(older), LIB, '2026-10-23');
    expect(old.kind === 'backup' && old.backup.plan).toBeNull();
    // Exercice inconnu, plan invalide, origine invalide : sauvegarde refusée.
    const unknown = parseJsonImport(JSON.stringify({ ...backup, plan: addToPlan(plan, 'inconnu', 1) }), LIB, '2026-10-23');
    expect(unknown.kind === 'error' && unknown.details).toContain('Séance prévue : exercice inconnu inconnu.');
    expect(parseJsonImport(JSON.stringify({ ...backup, plan: { ...plan, cardio: 'non' } }), LIB, '2026-10-23').kind).toBe('error');
    const badOrigin = { ...backup, sessions: [{ ...started, fromPlan: { planId: '', variantIds: [] } }] };
    expect(parseJsonImport(JSON.stringify(badOrigin), LIB, '2026-10-23').kind).toBe('error');

    // Fusion : le plan de l'appareil est gardé (écart signalé) ; sans plan ici, celui de la sauvegarde est repris,
    // sauf s'il a déjà été réalisé.
    const local = addToPlan(newPlan(at(21), 'plan-local'), 'chest-press', at(21));
    expect(mergePlan(local, plan, [])).toEqual({ plan: local, added: false, keptLocal: true });
    expect(mergePlan(local, null, [])).toEqual({ plan: local, added: false, keptLocal: false });
    expect(mergePlan(null, plan, [])).toEqual({ plan, added: true, keptLocal: false });
    // Sans historique ni poids de départ, le pec deck n'est pas prérempli : seul le leg curl (20 kg) est dans la séance.
    expect(started.performances.map((p) => p.variantId)).toEqual(['leg-curl']);
    const realised = finishSession(recordRemainingSets(started, 'leg-curl', at(23)), at(23, 19)).session;
    expect(mergePlan(null, plan, [realised])).toEqual({ plan: null, added: false, keptLocal: false });
  });
});
