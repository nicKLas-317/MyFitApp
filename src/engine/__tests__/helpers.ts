import type { Feeling, Performance, Session } from '../../domain/types';
import { DEFAULT_ENGINE_SETTINGS, type EngineSettings } from '../config';
import { rebuildProfile, type ReplayResult } from '../replay';

export const V = 'tirage-vertical';

export function perf(
  weightKg: number,
  targetReps: number,
  reps: number[],
  feeling: Feeling,
  opts: { variantId?: string; plannedSets?: number } = {},
): Performance {
  return {
    variantId: opts.variantId ?? V,
    weightKg,
    targetReps,
    plannedSets: opts.plannedSets ?? 3,
    reps,
    feeling,
  };
}

/** Performances types à 3 séries. */
export const green = (w: number, t: number, variantId?: string) =>
  perf(w, t, [t, t, t], 'bien', { variantId });
export const orange = (w: number, t: number, variantId?: string) =>
  perf(w, t, [t, t, t], 'moyen', { variantId });
export const red = (w: number, t: number, variantId?: string) =>
  perf(w, t, [t, t - 1, t - 1], 'moyen', { variantId });
export const incomplete = (w: number, t: number, variantId?: string) =>
  perf(w, t, [t, t], 'bien', { variantId });
export const partial = (w: number, variantId?: string): Performance => ({
  variantId: variantId ?? V,
  weightKg: w,
  targetReps: null,
  plannedSets: null,
  reps: [],
  feeling: 'inconnu',
  partial: true,
});

/** Date du n-ième jour (1 = 2026-01-01). */
export function day(n: number): string {
  const d = new Date(Date.UTC(2026, 0, n));
  return d.toISOString().slice(0, 10);
}

export function session(
  id: string,
  date: string,
  performances: Performance[],
  extra: Partial<Session> = {},
): Session {
  return {
    id,
    name: id,
    date,
    startedAt: null,
    endedAt: null,
    createdAt: 0,
    updatedAt: 0,
    origin: 'app',
    state: 'done',
    performances,
    ...extra,
  };
}

/** Une séance terminée par jour, dans l'ordre donné. Chaque élément peut regrouper plusieurs performances. */
export function history(steps: Array<Performance | Performance[]>): Session[] {
  return steps.map((step, i) =>
    session(`s${i + 1}`, day(i + 1), Array.isArray(step) ? step : [step]),
  );
}

export function replay(
  steps: Array<Performance | Performance[]>,
  settings: EngineSettings = DEFAULT_ENGINE_SETTINGS,
): ReplayResult {
  return rebuildProfile(history(steps), settings);
}

/** État final d'un exercice-variante après rejeu ; échoue s'il n'existe pas. */
export function finalState(steps: Array<Performance | Performance[]>, variantId = V, settings?: EngineSettings) {
  const state = replay(steps, settings).profile.variants[variantId];
  if (!state) throw new Error(`Aucun état pour ${variantId}`);
  return state;
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
