import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE_SETTINGS, rebuildProfile } from '../../engine';
import { green, history, orange, partial, red, V } from '../../engine/__tests__/helpers';
import { analyzeProgress, chartSeries, recentChanges } from '../progress';

const W = 'curl-biceps-halteres';
const analyze = (steps: Parameters<typeof history>[0]) => {
  const sessions = history(steps);
  const r = rebuildProfile(sessions, DEFAULT_ENGINE_SETTINGS);
  return { sessions, r, progress: analyzeProgress(r.evaluations, r.profile) };
};
const category = (steps: Parameters<typeof history>[0], variantId = V) =>
  analyze(steps).progress.find((p) => p.variantId === variantId)?.category;

describe('Bilan synthétique (§19.3)', () => {
  it('progresse : au moins un palier validé sur les 6 dernières séances', () => {
    expect(category([green(45, 8), green(45, 8), green(45, 9)])).toBe('progressing');
  });

  it('stable : aucun palier validé sur les 6 dernières séances, sans rouges répétées', () => {
    expect(category([green(45, 8), orange(45, 8), green(45, 8), orange(45, 8)])).toBe('stable');
    // Le palier validé il y a plus de 6 séances ne compte plus.
    const old = [green(45, 8), green(45, 8), ...Array.from({ length: 6 }, () => orange(45, 9))];
    expect(category(old)).toBe('stable');
  });

  it('en difficulté : au moins 2 rouges consécutives en cours ; jamais sur une seule séance difficile', () => {
    expect(category([green(45, 8), red(45, 8), red(45, 8)])).toBe('difficulty');
    expect(category([green(45, 8), green(45, 8), red(45, 9)])).toBe('progressing');
    expect(category([orange(45, 8), red(45, 8)])).toBe('stable');
    expect(category([red(45, 8)])).toBe('new');
  });

  it('les variantes sont analysées séparément ; une performance partielle ne compte pas', () => {
    const { progress } = analyze([[green(45, 8), red(12, 8, W)], [green(45, 8), red(12, 8, W)], [partial(50)]]);
    expect(progress.find((p) => p.variantId === V)).toMatchObject({ category: 'progressing', sessions: 2, validated: 1 });
    expect(progress.find((p) => p.variantId === W)).toMatchObject({ category: 'difficulty', redStreak: 2 });
  });

  it('dernières évolutions de charge et de cible, de la plus récente à la plus ancienne', () => {
    const { sessions, r } = analyze([green(45, 12), green(45, 12), green(50, 8), green(50, 8), green(50, 9)]);
    const changes = recentChanges(r.evaluations, sessions);
    expect(changes.map((c) => [c.date, c.from, c.to])).toEqual([
      [sessions[4]!.date, { weightKg: 50, targetReps: 8 }, { weightKg: 50, targetReps: 9 }],
      [sessions[2]!.date, { weightKg: 45, targetReps: 12 }, { weightKg: 50, targetReps: 8 }],
    ]);
  });
});

describe('Graphique d’évolution (§19.2)', () => {
  it('un point par séance de la variante, sans mélanger les variantes', () => {
    const sessions = history([[green(45, 8), green(12, 8, W)], green(47.5, 8), partial(50)]);
    const r = rebuildProfile(sessions, DEFAULT_ENGINE_SETTINGS);
    const points = chartSeries(V, sessions, r.evaluations);
    expect(points.map((p) => [p.weightKg, p.avgReps, p.status])).toEqual([
      [45, 8, 'vert'],
      [47.5, 8, 'vert'],
      [50, null, null],
    ]);
    expect(chartSeries(W, sessions, r.evaluations)).toHaveLength(1);
  });
});
