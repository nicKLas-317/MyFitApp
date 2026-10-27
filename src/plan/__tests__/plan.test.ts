import { describe, expect, it } from 'vitest';
import type { CardioBlock, Exercise, Performance, Session, SessionPlan } from '../../domain/types';
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
  itemKey,
  legacyPlanErrors,
  mergePlan,
  migratePlan,
  movePlanItem,
  newPlan,
  pendingPlanCardio,
  planCardio,
  planErrors,
  planExercises,
  plannedNotDone,
  plannedPerformance,
  removeFromPlan,
  removePlanCardio,
  sanitizePlan,
  sessionSteps,
  startFromPlan,
  unfinishedStep,
  updatePlanCardio,
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
    plan = movePlanItem(plan, 'leg-curl', -1, at(20, 9));
    expect(planExercises(plan).map((e) => e.variantId)).toEqual(['pec-deck', 'leg-curl', 'chest-press']);
    expect(movePlanItem(plan, 'pec-deck', -1, at(20, 9))).toBe(plan);
    // Un seul ordre, musculation et cardio mêlés : le cardio ajouté en dernier remonte entre deux exercices, puis en tête.
    plan = addPlanCardio(plan, TAPIS, at(20, 9));
    expect(plan.items.map(itemKey)).toEqual(['pec-deck', 'leg-curl', 'chest-press', 'cardio:prevu-tapis']);
    expect(movePlanItem(plan, 'cardio:prevu-tapis', 1, at(20, 9))).toBe(plan);
    plan = movePlanItem(plan, 'cardio:prevu-tapis', -1, at(20, 9));
    expect(plan.items.map(itemKey)).toEqual(['pec-deck', 'leg-curl', 'cardio:prevu-tapis', 'chest-press']);
    plan = movePlanItem(movePlanItem(plan, 'cardio:prevu-tapis', -1, at(20, 9)), 'cardio:prevu-tapis', -1, at(20, 9));
    expect(plan.items.map(itemKey)).toEqual(['cardio:prevu-tapis', 'pec-deck', 'leg-curl', 'chest-press']);
    // Corrigé, le bloc garde sa place ; un exercice déplacé passe par-dessus le cardio.
    expect(updatePlanCardio(plan, { ...TAPIS, minutes: 20 }, at(20, 9)).items.map(itemKey)).toEqual(plan.items.map(itemKey));
    expect(movePlanItem(plan, 'pec-deck', -1, at(20, 9)).items.map(itemKey)).toEqual(['pec-deck', 'cardio:prevu-tapis', 'leg-curl', 'chest-press']);
    expect(planCardio(plan)).toEqual([TAPIS]);

    // À la préparation : ce que le moteur donne aujourd'hui, avec la même mention que la carte en séance.
    const now = contexts(history);
    const [pec, legCurl, chest] = planExercises(plan);
    expect(shown(pec!, now)).toBe('3 × 8 à 35 kg = même cible');
    expect(shown(legCurl!, now)).toBe('3 × 8 à 20 kg départ');
    expect(shown(chest!, now)).toBe('3 × 12 à 40 kg ↑ Poids supérieur → 3 × 8');

    // Séance libre entre-temps : le pec deck reçoit sa deuxième verte. Le plan reste intact.
    const free = done(21, [perf('pec-deck', 35, 8)]);
    const after = [...history, free];
    expect(currentPlan(plan, after)).toBe(plan);
    const later = contexts(after);
    expect(shown(pec!, later)).toBe('3 × 9 à 35 kg ↑ +1 rép.');

    // Démarrage 3 jours plus tard : charge et cible recalculées maintenant, séries préremplies, ordre du plan.
    const session = startFromPlan(plan, later, () => true, at(23, 18), 'seance-prevue');
    expect(session.state).toBe('active');
    expect(session.date).toBe('2026-10-23');
    expect(session.performances.map((p) => [p.variantId, p.weightKg, p.targetReps, p.plannedSets, p.reps.length])).toEqual([
      ['pec-deck', 35, 9, 3, 0],
      ['leg-curl', 20, 8, 3, 0],
      ['chest-press', 40, 12, 3, 0],
    ]);
    expect(session.fromPlan).toEqual({
      planId: 'plan-1',
      variantIds: ['pec-deck', 'leg-curl', 'chest-press'],
      cardio: [TAPIS],
      order: [
        { kind: 'cardio', id: 'prevu-tapis' },
        { kind: 'exercise', variantId: 'pec-deck' },
        { kind: 'exercise', variantId: 'leg-curl' },
        { kind: 'exercise', variantId: 'chest-press' },
      ],
    });
    expect(session.cardio).toBeUndefined();
    // À la salle : l'ordre du plan, le cardio placé en tête d'abord, pas encore validé.
    expect(sessionSteps(session).map((st) => [st.key, st.kind === 'cardio' && st.pending])).toEqual([
      ['cardio:prevu-tapis', true],
      ['pec-deck', false],
      ['leg-curl', false],
      ['chest-press', false],
    ]);
    // Un exercice archivé ou supprimé depuis la préparation est ignoré, et absent de l'ordre.
    const without = startFromPlan(plan, later, (id) => id !== 'leg-curl', at(23), 'x');
    expect(without.performances.map((p) => p.variantId)).toEqual(['pec-deck', 'chest-press']);
    expect(sessionSteps(without).map((st) => st.key)).toEqual(['cardio:prevu-tapis', 'pec-deck', 'chest-press']);
  });

  it('242. À la salle : un seul ordre, cardio compris ; validé, le cardio reste à sa place ; ajouts en séance à la fin', () => {
    const ctxFor = contexts([done(12, [perf('pec-deck', 35, 8), perf('leg-curl', 20, 8)])]);
    let plan = newPlan(at(20, 9), 'plan-ordre');
    plan = addToPlan(plan, 'pec-deck', at(20, 9));
    plan = addPlanCardio(plan, TAPIS, at(20, 9));
    plan = addToPlan(plan, 'leg-curl', at(20, 9));
    let s = startFromPlan(plan, ctxFor, () => true, at(23), 'ordre');
    const keys = () => sessionSteps(s).map((st) => st.key);
    const pendingKeys = () => sessionSteps(s).filter(unfinishedStep).map((st) => st.key);
    expect(keys()).toEqual(['pec-deck', 'cardio:prevu-tapis', 'leg-curl']);
    expect(pendingKeys()).toEqual(['pec-deck', 'cardio:prevu-tapis', 'leg-curl']);
    // Séries faites sans ressenti : pas terminé ; avec le ressenti : terminé.
    s = recordRemainingSets(s, 'pec-deck', at(23, 18));
    expect(pendingKeys()).toEqual(['pec-deck', 'cardio:prevu-tapis', 'leg-curl']);
    s = setFeeling(s, 'pec-deck', 'bien', at(23, 18));
    expect(pendingKeys()).toEqual(['cardio:prevu-tapis', 'leg-curl']);
    // Cardio prévu validé : à sa place, plus « prévu » ; retiré, il le redevient.
    s = addCardio(s, TAPIS, at(23, 18));
    expect(sessionSteps(s)[1]).toEqual({ kind: 'cardio', key: 'cardio:prevu-tapis', block: TAPIS, pending: false });
    expect(pendingKeys()).toEqual(['leg-curl']);
    // Ajoutés en séance : exercices puis cardio, après le plan.
    const velo: CardioBlock = { id: 'velo-libre', machineId: 'velo', machine: 'Vélo', minutes: 5 };
    s = addCardio({ ...s, performances: [...s.performances, { ...perf('chest-press', 30, 8), reps: [] }] }, velo, at(23, 18));
    expect(keys()).toEqual(['pec-deck', 'cardio:prevu-tapis', 'leg-curl', 'chest-press', 'cardio:velo-libre']);
    // Exercice retiré : il disparaît de l'ordre.
    expect(sessionSteps(removeExercise(s, 'leg-curl', at(23, 18))).map((st) => st.key)).toEqual(['pec-deck', 'cardio:prevu-tapis', 'chest-press', 'cardio:velo-libre']);
    // Séance libre : exercices dans l'ordre d'ajout, puis le cardio.
    const { fromPlan: _f, ...free } = s;
    expect(sessionSteps(free).map((st) => st.key)).toEqual(['pec-deck', 'leg-curl', 'chest-press', 'cardio:prevu-tapis', 'cardio:velo-libre']);
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
    const emptied = removePlanCardio(removeFromPlan(removeFromPlan(removeFromPlan(plan, 'pec-deck', 1), 'chest-press', 1), 'leg-extension', 1), TAPIS.id, 1);
    expect(emptied.items).toEqual([]);
  });

  it('243. Contrôle, export et import : plan dans la sauvegarde, fusion (celui de l’appareil gardé), plan inconnu ou invalide refusé', () => {
    let plan = addToPlan(newPlan(at(20, 9), 'plan-3'), 'pec-deck', at(20, 9));
    plan = addPlanCardio(addToPlan(plan, 'leg-curl', at(20, 9), 20), TAPIS, at(20, 9));
    expect(planErrors(plan)).toEqual([]);
    expect(sanitizePlan(plan)).toBe(plan);
    expect(sanitizePlan(undefined)).toBeNull();
    const pecDeck = { kind: 'exercise', variantId: 'pec-deck' } as const;
    expect(sanitizePlan({ ...plan, items: [pecDeck, pecDeck] })).toBeNull();
    expect(planErrors({ ...plan, items: [pecDeck, { kind: 'cardio', block: TAPIS }, { kind: 'cardio', block: TAPIS }] })).toEqual(['plan : bloc de cardio prévu deux fois.']);
    expect(planErrors({ ...plan, items: [{ kind: 'exercise', variantId: 'leg-curl', startWeightKg: 0 }] })).toEqual(['plan.items[0].startWeightKg invalide.']);
    expect(planErrors({ ...plan, items: [{ kind: 'cardio', block: { ...TAPIS, minutes: 0 } }] })).toEqual(['plan.items[0].block.minutes invalide.']);
    expect(planErrors({ ...plan, items: [{ variantId: 'pec-deck' }] })).toEqual(['plan.items[0] invalide.']);

    // Export puis import : le plan revient à l'identique ; une séance démarrée à partir de lui garde son origine.
    const started = startFromPlan(plan, contexts([]), () => true, at(23), 'en-cours');
    const backup = buildBackup({ sessions: [started], exercises: LIB, plan }, at(23));
    const parsed = parseJsonImport(JSON.stringify(backup), LIB, '2026-10-23');
    expect(parsed.kind).toBe('backup');
    if (parsed.kind !== 'backup') return;
    expect(parsed.backup.plan).toEqual(plan);
    expect(parsed.backup.sessions[0]!.fromPlan).toEqual(started.fromPlan);
    expect(parsed.backup.schemaVersion).toBe(5);
    // Sauvegarde antérieure (format 4 sans plan) : aucun plan.
    const { plan: _omit, ...older } = { ...buildBackup({ sessions: [], exercises: LIB }, at(23)), schemaVersion: 4 };
    const old = parseJsonImport(JSON.stringify(older), LIB, '2026-10-23');
    expect(old.kind === 'backup' && old.backup.plan).toBeNull();
    // Exercice inconnu, plan invalide, origine invalide : sauvegarde refusée.
    const unknown = parseJsonImport(JSON.stringify({ ...backup, plan: addToPlan(plan, 'inconnu', 1) }), LIB, '2026-10-23');
    expect(unknown.kind === 'error' && unknown.details).toContain('Séance prévue : exercice inconnu inconnu.');
    expect(parseJsonImport(JSON.stringify({ ...backup, plan: { ...plan, items: 'non' } }), LIB, '2026-10-23').kind).toBe('error');
    const badOrigin = { ...backup, sessions: [{ ...started, fromPlan: { planId: '', variantIds: [] } }] };
    expect(parseJsonImport(JSON.stringify(badOrigin), LIB, '2026-10-23').kind).toBe('error');
    // Ordre de l'origine qui ne reprend pas les mêmes exercices et blocs : refusé.
    const badOrder = { ...backup, sessions: [{ ...started, fromPlan: { ...started.fromPlan, order: [{ kind: 'exercise', variantId: 'leg-curl' }] } }] };
    const refused = parseJsonImport(JSON.stringify(badOrder), LIB, '2026-10-23');
    expect(refused.kind === 'error' && refused.details).toContain('sessions[0].fromPlan.order invalide.');

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

  it('246. Migration : un plan des versions 1.23.0–1.23.1 (exercices puis cardio) est gardé sans perte, cardio après la musculation ; sauvegardes du format 4 acceptées', () => {
    // Plan au format actuel du téléphone : deux listes, avec un cardio.
    const legacy = {
      id: 'plan-telephone',
      createdAt: at(18, 8),
      updatedAt: at(19, 8),
      exercises: [{ variantId: 'pec-deck' }, { variantId: 'leg-curl', startWeightKg: 20 }, { variantId: 'chest-press' }],
      cardio: [TAPIS, { id: 'prevu-velo', machineId: 'velo', machine: 'Vélo', minutes: 5, distanceKm: 2.5 }],
    };
    const copy = structuredClone(legacy);
    expect(legacyPlanErrors(legacy)).toEqual([]);
    expect(planErrors(legacy)).toEqual(['plan.items invalide.']);
    const expected: SessionPlan = {
      id: 'plan-telephone',
      createdAt: at(18, 8),
      updatedAt: at(19, 8),
      items: [
        { kind: 'exercise', variantId: 'pec-deck' },
        { kind: 'exercise', variantId: 'leg-curl', startWeightKg: 20 },
        { kind: 'exercise', variantId: 'chest-press' },
        { kind: 'cardio', block: TAPIS },
        { kind: 'cardio', block: { id: 'prevu-velo', machineId: 'velo', machine: 'Vélo', minutes: 5, distanceKm: 2.5 } },
      ],
    };
    // Lecture de la base : même identifiant, mêmes dates, mêmes exercices, poids de départ et blocs ; rien d'autre.
    const migrated = sanitizePlan(legacy);
    expect(migrated).toEqual(expected);
    expect(legacy).toEqual(copy); // l'enregistrement lu n'est pas modifié
    expect(migratePlan(migrated)).toBe(migrated); // déjà au format actuel : inchangé
    expect(planErrors(migrated)).toEqual([]);
    // Un plan ancien invalide reste refusé (aucun plan), comme avant.
    expect(migratePlan({ ...legacy, exercises: [{ variantId: 'pec-deck' }, { variantId: 'pec-deck' }] })).toBeNull();
    expect(migratePlan({ ...legacy, cardio: undefined })).toBeNull();

    // Le plan migré se modifie comme un autre : le cardio peut maintenant remonter en tête.
    const moved = [1, 2, 3].reduce((p) => movePlanItem(p, 'cardio:prevu-tapis', -1, at(20)), migrated!);
    expect(moved.items.map(itemKey)).toEqual(['cardio:prevu-tapis', 'pec-deck', 'leg-curl', 'chest-press', 'cardio:prevu-velo']);
    expect(moved).toMatchObject({ id: 'plan-telephone', createdAt: at(18, 8), updatedAt: at(20) });

    // Sauvegarde du format 4 (version 1.23.1) avec ce plan : acceptée et convertie ; le format 5 exige le nouveau plan.
    const v4 = { ...buildBackup({ sessions: [], exercises: LIB }, at(23)), schemaVersion: 4, plan: legacy };
    const parsed = parseJsonImport(JSON.stringify(v4), LIB, '2026-10-23');
    expect(parsed.kind).toBe('backup');
    if (parsed.kind !== 'backup') return;
    expect(parsed.backup.schemaVersion).toBe(5);
    expect(parsed.backup.plan).toEqual(expected);
    expect(parseJsonImport(JSON.stringify({ ...v4, schemaVersion: 5 }), LIB, '2026-10-23').kind).toBe('error');
    expect(parseJsonImport(JSON.stringify({ ...v4, plan: expected }), LIB, '2026-10-23').kind).toBe('error');
    const unknown = parseJsonImport(JSON.stringify({ ...v4, plan: { ...legacy, exercises: [{ variantId: 'inconnu' }] } }), LIB, '2026-10-23');
    expect(unknown.kind === 'error' && unknown.details).toContain('Séance prévue : exercice inconnu inconnu.');
    // Fusion : le plan migré de la sauvegarde est repris tel quel.
    expect(mergePlan(null, parsed.backup.plan, [])).toEqual({ plan: expected, added: true, keptLocal: false });

    // Séance démarrée en 1.23.1 (origine sans ordre) : les exercices, puis le cardio prévu, comme avant.
    const ctxFor = contexts([done(12, [perf('pec-deck', 35, 8), perf('chest-press', 40, 8)])]);
    const started = startFromPlan(migrated!, ctxFor, () => true, at(23), 'ancienne');
    const { order: _o, ...oldOrigin } = started.fromPlan!;
    const old: Session = { ...started, fromPlan: oldOrigin };
    expect(sessionSteps(old).map((st) => st.key)).toEqual(['pec-deck', 'leg-curl', 'chest-press', 'cardio:prevu-tapis', 'cardio:prevu-velo']);
    const withOld = parseJsonImport(JSON.stringify({ ...v4, sessions: [old] }), LIB, '2026-10-23');
    expect(withOld.kind === 'backup' && withOld.backup.sessions[0]!.fromPlan).toEqual(oldOrigin);
  });
});
