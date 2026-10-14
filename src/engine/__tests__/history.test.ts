import { describe, expect, it } from 'vitest';
import type { Session } from '../../domain/types';
import { DEFAULT_ENGINE_SETTINGS, type EngineSettings } from '../config';
import { appendSession, EMPTY_PROFILE, rebuildProfile, type Profile } from '../replay';
import { createSessionFromTemplate } from '../session';
import { deepFreeze, green, history, orange, perf, red, replay, session, V } from './helpers';

const S = DEFAULT_ENGINE_SETTINGS;
const W = 'curl-haltères';

describe('§15 Cohérence de l’historique', () => {
  it('24. Deux variantes non comparables ont des compteurs indépendants', () => {
    const result = replay([
      [green(18, 8, V), red(12, 8, W)],
      [green(18, 8, V), red(12, 8, W)],
      [red(12, 8, W)],
      [red(12, 8, W)],
    ]);
    const a = result.profile.variants[V];
    const b = result.profile.variants[W];
    expect(a?.greenStreak).toBe(2);
    expect(a?.redStreak).toBe(0);
    expect(a?.recommendation.kind).toBe('reps_up');
    expect(b?.greenStreak).toBe(0);
    expect(b?.redStreak).toBe(4);
    expect(b?.recommendation.kind).toBe('weight_down');
  });

  it('25. Une séance non standard ne valide pas un palier', () => {
    // 4 séries au lieu de 3 : verte mais non standard.
    const fourSets = perf(45, 8, [8, 8, 8, 8], 'bien', { plannedSets: 4 });
    const result = replay([green(45, 8), fourSets]);
    expect(result.evaluations[1]?.status).toBe('vert');
    expect(result.evaluations[1]?.standard).toBe(false);
    expect(result.evaluations[1]?.validation).toBe(false);
    expect(result.profile.variants[V]?.greenStreak).toBe(1);
    expect(result.profile.variants[V]?.recommendation.kind).toBe('keep');

    // Avec un réglage spécifique à 4 séries, c'est l'inverse.
    const settings: EngineSettings = { ...S, overrides: { [V]: { sets: 4 } } };
    const custom = replay([fourSets, green(45, 8)], settings);
    expect(custom.evaluations.map((e) => e.validation)).toEqual([true, false]);
  });

  it('26. Une séance ne peut pas être comptée deux fois', () => {
    const s1 = session('s1', '2026-01-01', [green(45, 8)]);
    // Même séance présente deux fois (par exemple après un import).
    const twice = rebuildProfile([s1, s1, { ...s1 }], S);
    expect(twice.evaluations).toHaveLength(1);
    expect(twice.profile.variants[V]?.greenStreak).toBe(1);
    expect(twice.profile.appliedSessionIds).toEqual(['s1']);

    // Un même exercice-variante en double dans une séance n'est compté qu'une fois.
    const dup = rebuildProfile([session('s2', '2026-01-02', [green(45, 8), green(45, 8)])], S);
    expect(dup.evaluations).toHaveLength(1);
    expect(dup.ignored[0]?.reasons).toEqual(['duplicate_variant']);

    // Le cache refuse de réappliquer une séance déjà comptée.
    expect(appendSession(twice.profile, s1, S)).toBeNull();
  });

  it('27. La modification d’une séance passée recalcule les recommandations', () => {
    const sessions = history([green(45, 8), green(45, 8)]);
    expect(rebuildProfile(sessions, S).profile.variants[V]?.recommendation.kind).toBe('reps_up');

    const edited = sessions.map((s) =>
      s.id === 's1' ? { ...s, performances: [orange(45, 8)] } : s,
    );
    const after = rebuildProfile(edited, S);
    expect(after.evaluations[0]?.status).toBe('orange');
    expect(after.profile.variants[V]?.recommendation).toEqual({ kind: 'keep', targetReps: 8, plannedSets: 3 });
  });

  it('28. Une séance réutilisée comme modèle ne modifie jamais la séance originale', () => {
    const sessions = history([[green(45, 8), red(12, 10, W)], [green(45, 8)]]);
    const template = deepFreeze(sessions[0] as Session);
    const snapshot = structuredClone(template);
    const { profile } = rebuildProfile(sessions, S);

    const { session: created, planned } = createSessionFromTemplate(template, profile, S, {
      id: 'nouvelle',
      name: 'Nouvelle séance',
      date: '2026-01-10',
      now: 1_000,
    });

    expect(template).toEqual(snapshot);
    expect(created.id).toBe('nouvelle');
    expect(created.state).toBe('active');
    expect(created.origin).toBe('app');
    // Poids et cibles recalculés depuis le profil actuel, pas copiés du modèle.
    expect(created.performances.map((p) => [p.variantId, p.weightKg, p.targetReps, p.reps])).toEqual([
      [V, 45, 9, []],
      [W, 12, 10, []],
    ]);
    expect(planned[0]?.recommendation.kind).toBe('reps_up');

    // L'ancienne séance n'est jamais comptée une deuxième fois.
    const withNew = rebuildProfile([...sessions, created], S);
    expect(withNew.evaluations).toHaveLength(3);
    const finished: Session = { ...created, state: 'done', performances: [green(45, 9), red(12, 10, W)] };
    const done = rebuildProfile([...sessions, finished], S);
    expect(done.evaluations.filter((e) => e.sessionId === 's1')).toHaveLength(2);
    expect(done.profile.variants[V]?.palier).toEqual({ weightKg: 45, targetReps: 9 });
    expect(done.profile.variants[V]?.greenStreak).toBe(1);
  });

  it('29. Un palier choisi manuellement démarre avec un compteur à zéro', () => {
    const result = replay([green(45, 8), green(45, 8), green(50, 8)]);
    const manual = result.evaluations.at(-1);
    expect(manual?.decision).toBe('manual_weight');
    expect(manual?.palier).toEqual({ weightKg: 50, targetReps: 8 });
    expect(manual?.greenStreak).toBe(0);
    expect(manual?.recommendation.kind).toBe('keep');
  });

  it('30. Le recalcul complet donne le même résultat que l’état mis en cache', () => {
    const sessions = history([
      [green(45, 8), red(12, 10, W)],
      [green(45, 8), red(12, 10, W)],
      [perf(45, 9, [9, 9, 8], 'bien'), red(12, 10, W)],
      [green(45, 9), red(12, 10, W)],
      [green(50, 9), green(10, 10, W)],
    ]);
    let cache: Profile = EMPTY_PROFILE;
    for (const s of sessions) {
      const step = appendSession(cache, s, S);
      if (!step) throw new Error('ajout incrémental refusé');
      // Le cache est persisté puis relu (IndexedDB) : aller-retour JSON.
      cache = JSON.parse(JSON.stringify(step.profile)) as Profile;
    }
    expect(cache).toEqual(rebuildProfile(sessions, S).profile);

    // Une séance antérieure à la dernière ne peut pas être ajoutée au cache : il faut tout rejouer.
    expect(appendSession(cache, session('ancienne', '2025-12-01', [green(45, 8)]), S)).toBeNull();
    // Une séance en cours ne fait pas partie du profil.
    expect(appendSession(cache, session('en-cours', '2026-02-01', [green(45, 8)], { state: 'active' }), S)).toBeNull();
  });
});

describe('§15 Robustesse (moteur)', () => {
  it('59. Deux séances le même jour sont toujours rejouées dans le même ordre', () => {
    const morning = session('b-matin', '2026-01-05', [green(45, 8)], { startedAt: 1000, createdAt: 9000 });
    const evening = session('a-soir', '2026-01-05', [orange(45, 8)], { startedAt: 5000, createdAt: 1 });
    const noTime1 = session('c', '2026-01-05', [green(45, 8)], { createdAt: 100 });
    const noTime2 = session('d', '2026-01-05', [green(45, 8)], { createdAt: 100 });
    const all = [morning, evening, noTime1, noTime2];
    const orders = [all, [...all].reverse(), [noTime2, evening, noTime1, morning]];
    const results = orders.map((o) => rebuildProfile(o, S));
    for (const r of results) {
      expect(r.evaluations.map((e) => e.sessionId)).toEqual(['b-matin', 'a-soir', 'c', 'd']);
      expect(r).toEqual(results[0]);
    }
  });

  it('60. La suppression d’une séance passée recalcule le profil', () => {
    const sessions = history([green(45, 8), orange(45, 8), green(45, 8)]);
    expect(rebuildProfile(sessions, S).profile.variants[V]?.recommendation.kind).toBe('keep');
    const withoutOrange = sessions.filter((s) => s.id !== 's2');
    expect(rebuildProfile(withoutOrange, S).profile.variants[V]?.recommendation.kind).toBe('reps_up');
  });
});
