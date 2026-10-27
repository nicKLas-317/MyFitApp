/**
 * Opérations sur une séance : fonctions pures qui renvoient une nouvelle séance.
 * L'heure courante est toujours passée en paramètre.
 */
import type { Feeling, Performance, Session, VariantConfig } from '../domain/types';
import { clampReps, expectedTarget, type ProgressState } from '../engine';
import { defaultSessionName, localDate } from './format';

/** Au-delà, une séance encore ouverte à la réouverture est considérée comme oubliée (§6). */
export const FORGOTTEN_AFTER_MS = 4 * 60 * 60 * 1000;
/** Écart relatif au-delà duquel un nouveau poids demande confirmation (§5.3). */
export const WEIGHT_CONFIRM_RATIO = 0.5;
export const MAX_PLANNED_SETS = 10;

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function startSession(now: number, id: string = newId()): Session {
  return {
    id,
    name: defaultSessionName(now),
    date: localDate(now),
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
    origin: 'app',
    state: 'active',
    performances: [],
  };
}

export function findPerformance(session: Session, variantId: string): Performance | undefined {
  return session.performances.find((p) => p.variantId === variantId);
}

function updatePerformance(
  session: Session,
  variantId: string,
  now: number,
  update: (p: Performance) => Performance,
): Session {
  let changed = false;
  const performances = session.performances.map((p) => {
    if (p.variantId !== variantId) return p;
    const next = update(p);
    if (next !== p) changed = true;
    return next;
  });
  return changed ? { ...session, performances, updatedAt: now } : session;
}

/** Contexte moteur d'un exercice-variante : état de progression et réglages. */
export interface VariantContext {
  state: ProgressState | undefined;
  cfg: VariantConfig;
}

/**
 * Exercice prérempli d'après le moteur : charge du palier actuel (ou poids de départ pour un exercice jamais réalisé),
 * cible attendue et séries standard, aucune série faite. Null sans charge connue.
 */
export function newPerformance(variantId: string, ctx: VariantContext, startWeightKg?: number): Performance | null {
  // Poids du corps : pas de charge (0), rien à demander.
  const weightKg = ctx.cfg.bodyweight ? 0 : (ctx.state?.palier.weightKg ?? startWeightKg);
  if (weightKg === undefined || !(weightKg > 0 || ctx.cfg.bodyweight)) return null;
  return {
    variantId,
    weightKg,
    targetReps: expectedTarget(ctx.state, weightKg, ctx.cfg),
    plannedSets: ctx.cfg.sets,
    reps: [],
    feeling: 'inconnu',
  };
}

/**
 * Ajoute un exercice-variante à la séance (§5.2), prérempli avec le dernier poids et la cible du moteur.
 * S'il est déjà présent, la séance est renvoyée inchangée (`added: false`) : on ouvre l'existant.
 * Pour un exercice jamais réalisé, le poids de départ est obligatoire.
 */
export function addExercise(
  session: Session,
  variantId: string,
  ctx: VariantContext,
  now: number,
  startWeightKg?: number,
): { session: Session; added: boolean } {
  if (findPerformance(session, variantId)) return { session, added: false };
  const performance = newPerformance(variantId, ctx, startWeightKg);
  if (!performance) throw new Error('Poids de départ requis');
  return {
    session: { ...session, performances: [...session.performances, performance], updatedAt: now },
    added: true,
  };
}

/**
 * Change la charge. Tant qu'aucune série n'est enregistrée, la cible suit la charge saisie
 * (§7.7, §7.11 A) ; ensuite elle n'est plus modifiée automatiquement.
 */
export function setWeight(
  session: Session,
  variantId: string,
  weightKg: number,
  ctx: VariantContext,
  now: number,
): Session {
  if (!(weightKg > 0)) throw new Error('Poids invalide');
  return updatePerformance(session, variantId, now, (p) => ({
    ...p,
    weightKg,
    targetReps: p.reps.length === 0 ? expectedTarget(ctx.state, weightKg, ctx.cfg) : p.targetReps,
  }));
}

/** Ajustement ponctuel de la cible : jamais sous une série déjà enregistrée. */
export function setTarget(session: Session, variantId: string, targetReps: number, now: number): Session {
  return updatePerformance(session, variantId, now, (p) => {
    const min = Math.max(1, ...p.reps);
    return { ...p, targetReps: Math.max(min, Math.round(targetReps)) };
  });
}

/** Ajustement ponctuel du nombre de séries : jamais sous le nombre de séries déjà enregistrées. */
export function setPlannedSets(session: Session, variantId: string, plannedSets: number, now: number): Session {
  return updatePerformance(session, variantId, now, (p) => ({
    ...p,
    plannedSets: Math.min(MAX_PLANNED_SETS, Math.max(1, p.reps.length, Math.round(plannedSets))),
  }));
}

/** Enregistre la série suivante, bornée à la cible (§5.4). */
export function recordSet(session: Session, variantId: string, reps: number, now: number): Session {
  return updatePerformance(session, variantId, now, (p) => {
    if (p.targetReps === null || p.plannedSets === null || p.reps.length >= p.plannedSets) return p;
    return { ...p, reps: [...p.reps, clampReps(reps, p.targetReps)] };
  });
}

/**
 * « Valider les 3 séries » : enregistre d'un coup toutes les séries restantes à la cible (séries préremplies conformes
 * à ce qui a été fait). Il ne reste que le ressenti.
 */
export function recordRemainingSets(session: Session, variantId: string, now: number): Session {
  return updatePerformance(session, variantId, now, (p) => {
    if (p.targetReps === null || p.plannedSets === null || p.reps.length >= p.plannedSets) return p;
    return { ...p, reps: [...p.reps, ...Array.from({ length: p.plannedSets - p.reps.length }, () => p.targetReps as number)] };
  });
}

/** Corrige une série déjà enregistrée. */
export function correctSet(session: Session, variantId: string, index: number, reps: number, now: number): Session {
  return updatePerformance(session, variantId, now, (p) => {
    if (p.targetReps === null || index < 0 || index >= p.reps.length) return p;
    const next = [...p.reps];
    next[index] = clampReps(reps, p.targetReps);
    return { ...p, reps: next };
  });
}

/** Supprime la dernière série enregistrée (série saisie par erreur). */
export function deleteLastSet(session: Session, variantId: string, now: number): Session {
  return updatePerformance(session, variantId, now, (p) =>
    p.reps.length === 0 ? p : { ...p, reps: p.reps.slice(0, -1) },
  );
}

/** Ressenti choisi par l'utilisateur : « inconnu » n'est jamais saisi, il correspond à l'absence de choix. */
export type RatedFeeling = Exclude<Feeling, 'inconnu'>;

/** Choisit ou remplace le ressenti global ; il ne peut pas être effacé (§5.5). */
export function setFeeling(session: Session, variantId: string, feeling: RatedFeeling, now: number): Session {
  return updatePerformance(session, variantId, now, (p) => (p.feeling === feeling ? p : { ...p, feeling }));
}

/** Exercices réalisés (au moins une série) sans ressenti, à signaler avant de terminer (§5.5). */
export function missingFeelings(session: Session): Performance[] {
  return session.performances.filter((p) => p.reps.length > 0 && p.feeling === 'inconnu');
}

/** Retire l'exercice de la séance en cours, sans toucher à son historique (§13). */
export function removeExercise(session: Session, variantId: string, now: number): Session {
  const performances = session.performances.filter((p) => p.variantId !== variantId);
  return performances.length === session.performances.length ? session : { ...session, performances, updatedAt: now };
}

export interface RemovedPerformance {
  index: number;
  performance: Performance;
}

/**
 * Termine la séance (§5.6) : chronomètre arrêté, heure de fin enregistrée, exercices sans
 * aucune série retirés et renvoyés pour permettre l'annulation.
 */
export function finishSession(session: Session, endedAt: number): { session: Session; removed: RemovedPerformance[] } {
  const removed: RemovedPerformance[] = [];
  const kept: Performance[] = [];
  session.performances.forEach((performance, index) => {
    if (performance.reps.length === 0) removed.push({ index, performance });
    else kept.push(performance);
  });
  const end = session.startedAt !== null ? Math.max(endedAt, session.startedAt) : endedAt;
  return {
    session: { ...session, state: 'done', endedAt: end, performances: kept, updatedAt: endedAt },
    removed,
  };
}

/** Annule le retrait automatique : les exercices reprennent leur place d'origine. */
export function restoreRemoved(session: Session, removed: readonly RemovedPerformance[], now: number): Session {
  if (removed.length === 0) return session;
  const performances = [...session.performances];
  for (const { index, performance } of [...removed].sort((a, b) => a.index - b.index)) {
    if (performances.some((p) => p.variantId === performance.variantId)) continue;
    performances.splice(Math.min(index, performances.length), 0, performance);
  }
  return { ...session, performances, updatedAt: now };
}

/** Renomme la séance ; un nom vide rétablit le nom par défaut. */
export function renameSession(session: Session, name: string, now: number): Session {
  const trimmed = name.trim();
  const next = trimmed || (session.startedAt !== null ? defaultSessionName(session.startedAt) : session.name);
  return next === session.name ? session : { ...session, name: next, updatedAt: now };
}

/** Temps écoulé calculé depuis l'horodatage de début, jamais par incrément (§6). */
export function elapsedMs(session: Session, now: number): number {
  if (session.startedAt === null) return 0;
  return Math.max(0, (session.endedAt ?? now) - session.startedAt);
}

export function isForgotten(session: Session, now: number): boolean {
  return session.state === 'active' && session.startedAt !== null && now - session.startedAt > FORGOTTEN_AFTER_MS;
}

/** Lit un poids saisi en français : « 52,5 », « 52.5 », « 52,5 kg ». */
export function parseWeight(input: string): number | null {
  const normalized = input.trim().toLowerCase().replace(/\s*kgs?$/, '').replace(',', '.').trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Math.round(Number(normalized) * 100) / 100;
  return value > 0 ? value : null;
}

export type WeightCheck =
  | { kind: 'invalid' }
  | { kind: 'confirm'; value: number; previous: number }
  | { kind: 'ok'; value: number };

/** Contrôle anti-faute de frappe (§5.3) : refus si nul, négatif ou non numérique ; confirmation au-delà de 50 %. */
export function checkWeight(input: string, previous: number | undefined): WeightCheck {
  const value = parseWeight(input);
  if (value === null) return { kind: 'invalid' };
  if (previous !== undefined && previous > 0 && Math.abs(value - previous) / previous > WEIGHT_CONFIRM_RATIO) {
    return { kind: 'confirm', value, previous };
  }
  return { kind: 'ok', value };
}
