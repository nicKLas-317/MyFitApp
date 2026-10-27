import { describe, expect, it } from 'vitest';
import type { Session } from '../../domain/types';
import { DEFAULT_ENGINE_SETTINGS, DEFAULT_VARIANT_CONFIG, rebuildProfile } from '../../engine';
import { green, history, V } from '../../engine/__tests__/helpers';
import { defaultSessionName, formatDuration } from '../format';
import {
  addExercise,
  checkWeight,
  correctSet,
  deleteLastSet,
  elapsedMs,
  finishSession,
  isForgotten,
  missingFeelings,
  parseWeight,
  recordSet,
  removeExercise,
  renameSession,
  setFeeling,
  setPlannedSets,
  setTarget,
  setWeight,
  startSession,
  type VariantContext,
} from '../ops';

const cfg = DEFAULT_VARIANT_CONFIG;
const NEW: VariantContext = { state: undefined, cfg };
const T0 = new Date(2026, 9, 12, 15, 45).getTime();
const W = 'curl-biceps-halteres';

function withExercise(ctx: VariantContext = NEW, weight = 45): Session {
  return addExercise(startSession(T0, 's'), V, ctx, T0, weight).session;
}

describe('Séance : démarrage et chronomètre (§5.1, §6)', () => {
  it('crée une séance active avec début horodaté et nom par défaut', () => {
    const s = startSession(T0, 'id-1');
    expect(s).toMatchObject({ id: 'id-1', state: 'active', startedAt: T0, endedAt: null, date: '2026-10-12' });
    expect(s.name).toBe('Séance du 12 octobre 2026 — 15 h 45');
    expect(defaultSessionName(new Date(2026, 0, 3, 9, 5).getTime())).toBe('Séance du 3 janvier 2026 — 9 h 05');
  });

  it('le temps écoulé est calculé depuis l’horodatage de début, puis figé à la fin', () => {
    const s = withExercise();
    expect(elapsedMs(s, T0 + 90_000)).toBe(90_000);
    expect(formatDuration(elapsedMs(s, T0 + 3_723_000))).toBe('1:02:03');
    const done = finishSession(recordSet(s, V, 8, T0), T0 + 600_000).session;
    expect(elapsedMs(done, T0 + 99_999_999)).toBe(600_000);
  });

  it('61. Une séance ouverte depuis plus de 4 heures est signalée, sans être terminée', () => {
    const s = withExercise();
    expect(isForgotten(s, T0 + 4 * 3600_000)).toBe(false);
    expect(isForgotten(s, T0 + 4 * 3600_000 + 1)).toBe(true);
    // La détection ne modifie rien.
    expect(s.state).toBe('active');
    const done = finishSession(s, T0 + 1000).session;
    expect(isForgotten(done, T0 + 10 * 3600_000)).toBe(false);
  });
});

describe('Séance : exercices et séries (§5.2 à §5.5)', () => {
  it('57. Un même exercice-variante ne peut pas être ajouté deux fois', () => {
    const s = withExercise();
    const again = addExercise(s, V, NEW, T0 + 1, 50);
    expect(again.added).toBe(false);
    expect(again.session).toBe(s);
    expect(again.session.performances).toHaveLength(1);
  });

  it('exercices conservés dans l’ordre d’ajout', () => {
    let s = withExercise();
    s = addExercise(s, W, NEW, T0, 10).session;
    s = addExercise(s, 'leg-curl', NEW, T0, 30).session;
    expect(s.performances.map((p) => p.variantId)).toEqual([V, W, 'leg-curl']);
  });

  it('nouvel exercice : poids de départ obligatoire, cible 3×8', () => {
    expect(() => addExercise(startSession(T0), V, NEW, T0)).toThrow();
    const p = withExercise(NEW, 20).performances[0];
    expect(p).toMatchObject({ weightKg: 20, targetReps: 8, plannedSets: 3, reps: [], feeling: 'inconnu' });
  });

  it('exercice connu : dernier poids et cible du moteur préremplis', () => {
    const { profile } = rebuildProfile(history([green(45, 8), green(45, 8)]), DEFAULT_ENGINE_SETTINGS);
    const ctx = { state: profile.variants[V], cfg };
    const p = addExercise(startSession(T0), V, ctx, T0, 999).session.performances[0];
    expect(p).toMatchObject({ weightKg: 45, targetReps: 9 });
  });

  it('la cible suit la charge saisie tant qu’aucune série n’est enregistrée', () => {
    const { profile } = rebuildProfile(history([green(45, 12), green(45, 12)]), DEFAULT_ENGINE_SETTINGS);
    const ctx = { state: profile.variants[V], cfg };
    let s = addExercise(startSession(T0), V, ctx, T0).session;
    expect(s.performances[0]?.targetReps).toBe(12);
    s = setWeight(s, V, 50, ctx, T0);
    expect(s.performances[0]).toMatchObject({ weightKg: 50, targetReps: 8 });
    s = recordSet(s, V, 8, T0);
    s = setWeight(s, V, 45, ctx, T0);
    expect(s.performances[0]).toMatchObject({ weightKg: 45, targetReps: 8 });
  });

  it('7. Une série ne dépasse jamais la cible ; la cible ne descend pas sous une série enregistrée', () => {
    let s = recordSet(withExercise(), V, 12, T0);
    expect(s.performances[0]?.reps).toEqual([8]);
    s = correctSet(s, V, 0, 9, T0);
    expect(s.performances[0]?.reps).toEqual([8]);
    s = setTarget(s, V, 6, T0);
    expect(s.performances[0]?.targetReps).toBe(8);
  });

  it('pas plus de séries que prévu ; le nombre de séries ne descend pas sous les séries faites', () => {
    let s = withExercise();
    for (let i = 0; i < 5; i++) s = recordSet(s, V, 8, T0);
    expect(s.performances[0]?.reps).toEqual([8, 8, 8]);
    s = setPlannedSets(s, V, 2, T0);
    expect(s.performances[0]?.plannedSets).toBe(3);
    s = setPlannedSets(s, V, 4, T0);
    s = recordSet(s, V, 7, T0);
    expect(s.performances[0]?.reps).toEqual([8, 8, 8, 7]);
  });

  it('51. Les corrections de séries mettent à jour les données', () => {
    let s = withExercise();
    s = recordSet(s, V, 8, T0);
    s = recordSet(s, V, 8, T0 + 1);
    s = correctSet(s, V, 1, 6, T0 + 2);
    expect(s.performances[0]?.reps).toEqual([8, 6]);
    expect(s.updatedAt).toBe(T0 + 2);
    s = deleteLastSet(s, V, T0 + 3);
    expect(s.performances[0]?.reps).toEqual([8]);
  });

  it('ressenti global enregistré ; retrait d’un exercice de la séance', () => {
    let s = setFeeling(withExercise(), V, 'tres_bien', T0);
    expect(s.performances[0]?.feeling).toBe('tres_bien');
    s = removeExercise(s, V, T0);
    expect(s.performances).toEqual([]);
  });

  it('les opérations ne modifient jamais la séance d’origine', () => {
    const s = Object.freeze(withExercise());
    const copy = structuredClone(s);
    recordSet(s, V, 8, T0);
    setFeeling(s, V, 'bien', T0);
    removeExercise(s, V, T0);
    finishSession(s, T0);
    expect(s).toEqual(copy);
  });
});

describe('Ressenti global (§5.5)', () => {
  it('75. Le ressenti se remplace par un autre niveau mais ne s’efface pas', () => {
    const s = setFeeling(withExercise(), V, 'bien', T0);
    // Même niveau : aucune modification.
    expect(setFeeling(s, V, 'bien', T0 + 1)).toBe(s);
    expect(setFeeling(s, V, 'tres_bien', T0 + 1).performances[0]?.feeling).toBe('tres_bien');
    // « inconnu » n'est pas un ressenti saisissable.
    // @ts-expect-error — le type RatedFeeling exclut « inconnu »
    setFeeling(s, V, 'inconnu', T0);
  });

  it('76. Exercices réalisés sans ressenti relevés avant la fin', () => {
    let s = withExercise();
    s = addExercise(s, W, NEW, T0, 10).session;
    s = addExercise(s, 'leg-curl', NEW, T0, 30).session;
    s = recordSet(s, V, 8, T0);
    s = recordSet(s, W, 8, T0);
    s = setFeeling(s, W, 'bien', T0);
    // leg-curl n'a aucune série : il sera retiré, inutile de demander son ressenti.
    expect(missingFeelings(s).map((p) => p.variantId)).toEqual([V]);
    s = setFeeling(s, V, 'moyen', T0);
    expect(missingFeelings(s)).toEqual([]);
  });
});

describe('Séance : fin et nom (§5.6)', () => {
  it('74. Exercice sans série toujours retiré à la fin (plus d’« Annuler », version 1.28.0) ; resté en base, il ne compte jamais', () => {
    // Historique : une validation verte au palier 45 kg / 3×8.
    const past = history([green(45, 8)]);
    const { profile } = rebuildProfile(past, DEFAULT_ENGINE_SETTINGS);
    const ctx = { state: profile.variants[V], cfg };

    let s = addExercise(startSession(T0, 'today'), W, NEW, T0, 10).session;
    s = addExercise(s, V, ctx, T0).session; // ajouté mais aucune série
    s = addExercise(s, 'leg-curl', NEW, T0, 30).session;
    s = recordSet(s, W, 8, T0);
    s = recordSet(s, 'leg-curl', 8, T0);
    s = { ...s, date: '2026-02-01' };

    const { session: done, removed } = finishSession(s, T0 + 3600_000);
    expect(done.state).toBe('done');
    expect(done.endedAt).toBe(T0 + 3600_000);
    expect(done.performances.map((p) => p.variantId)).toEqual([W, 'leg-curl']);
    expect(removed.map((r) => r.performance.variantId)).toEqual([V]);

    // Sans effet sur le moteur : le compteur reste à 1.
    const after = rebuildProfile([...past, done], DEFAULT_ENGINE_SETTINGS);
    expect(after.profile.variants[V]?.greenStreak).toBe(1);

    // Une séance terminée qui l'aurait gardé (« Annuler » des versions précédentes) : ignoré par le moteur, comme si
    // l'exercice n'y était pas (pas de séance incomplète, compteur toujours à 1).
    const kept = { ...done, performances: [done.performances[0]!, { ...s.performances[1]!, reps: [] }, done.performances[1]!] };
    const replayed = rebuildProfile([...past, kept], DEFAULT_ENGINE_SETTINGS);
    expect(replayed.evaluations.find((e) => e.sessionId === 'today' && e.variantId === V)).toBeUndefined();
    expect(replayed.ignored).toContainEqual({ sessionId: 'today', variantId: V, reasons: ['no_sets'] });
    expect(replayed.profile).toEqual(after.profile);
  });

  it('l’heure de fin ne peut pas précéder le début', () => {
    expect(finishSession(withExercise(), T0 - 5000).session.endedAt).toBe(T0);
  });

  it('renommer ; un nom vide rétablit le nom par défaut', () => {
    const s = renameSession(withExercise(), '  Haut du corps ', T0);
    expect(s.name).toBe('Haut du corps');
    expect(renameSession(s, '   ', T0).name).toBe('Séance du 12 octobre 2026 — 15 h 45');
  });
});

describe('Saisie du poids (§5.3)', () => {
  it('lit les écritures françaises', () => {
    expect(parseWeight('52,5')).toBe(52.5);
    expect(parseWeight('52.5 kg')).toBe(52.5);
    expect(parseWeight(' 40 kgs')).toBe(40);
    expect(parseWeight('abc')).toBeNull();
    expect(parseWeight('')).toBeNull();
  });

  it('58. Plus de 50 % d’écart : confirmation ; nul, négatif ou non numérique : refusé', () => {
    expect(checkWeight('520', 52)).toEqual({ kind: 'confirm', value: 520, previous: 52 });
    expect(checkWeight('20', 52)).toEqual({ kind: 'confirm', value: 20, previous: 52 });
    expect(checkWeight('78', 52)).toEqual({ kind: 'ok', value: 78 });
    expect(checkWeight('55', 52)).toEqual({ kind: 'ok', value: 55 });
    expect(checkWeight('0', 52)).toEqual({ kind: 'invalid' });
    expect(checkWeight('-5', 52)).toEqual({ kind: 'invalid' });
    expect(checkWeight('douze', 52)).toEqual({ kind: 'invalid' });
    expect(checkWeight('500', undefined)).toEqual({ kind: 'ok', value: 500 });
  });
});
