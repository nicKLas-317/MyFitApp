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

/** Nouvelle séance libre, à la salle par défaut ou à la maison (version 1.26.0). */
export function startSession(now: number, id: string = newId(), home = false): Session {
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
    ...(home ? { location: 'maison' as const } : {}),
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

/**
 * Exercices réalisés (au moins une série) sans ressenti, à signaler avant de terminer (§5.5). Ceux déjà faits d'une
 * séance complétée (version 1.28.0) sont fermés : ils ne sont pas relevés.
 */
export function missingFeelings(session: Session): Performance[] {
  const locked = new Set(session.locked?.variantIds);
  return session.performances.filter((p) => p.reps.length > 0 && p.feeling === 'inconnu' && !locked.has(p.variantId));
}

/** Retire l'exercice de la séance en cours, sans toucher à son historique (§13) ; il n'est plus « remis à plus tard ». */
export function removeExercise(session: Session, variantId: string, now: number): Session {
  const performances = session.performances.filter((p) => p.variantId !== variantId);
  if (performances.length === session.performances.length) return session;
  const { later: _later, ...rest } = session;
  const later = (session.later ?? []).filter((key) => key !== variantId);
  return { ...rest, performances, ...(later.length > 0 ? { later } : {}), updatedAt: now };
}

export interface RemovedPerformance {
  index: number;
  performance: Performance;
}

/**
 * Ce que l'annulation d'une séance en cours ferait perdre (version 1.27.0) : séries validées et blocs de cardio validés.
 * « Rien n'a été saisi. », « 4 séries et 1 cardio seront perdus. »
 */
export function cancelLoss(session: Pick<Session, 'performances' | 'cardio' | 'locked'>): string {
  // Séance complétée (version 1.28.0) : seuls les ajouts seraient perdus, la partie déjà terminée reste.
  const lockedExercises = new Set(session.locked?.variantIds);
  const lockedCardio = new Set(session.locked?.cardioIds);
  const sets = session.performances.filter((p) => !lockedExercises.has(p.variantId)).reduce((n, p) => n + p.reps.length, 0);
  const cardio = (session.cardio ?? []).filter((b) => !lockedCardio.has(b.id)).length;
  if (sets === 0 && cardio === 0) return 'Rien n’a été saisi.';
  const setsText = sets === 1 ? '1 série' : `${sets} séries`;
  const cardioText = cardio === 1 ? '1 cardio' : `${cardio} cardios`;
  if (cardio === 0) return `${setsText} ${sets === 1 ? 'sera perdue' : 'seront perdues'}.`;
  if (sets === 0) return `${cardioText} ${cardio === 1 ? 'sera perdu' : 'seront perdus'}.`;
  return `${setsText} et ${cardioText} seront perdus.`;
}

/**
 * Termine la séance (§5.6) : chronomètre arrêté, heure de fin enregistrée, exercices sans aucune série retirés
 * (toujours : version 1.28.0, plus d'« Annuler ») et renvoyés pour être signalés au récapitulatif. Une séance
 * complétée perd sa partie fermée : elle redevient une séance terminée comme une autre. Les exercices remis à plus
 * tard (version 1.29.0) sont enregistrés à leur place de fin de liste, dans l'ordre où ils ont été faits.
 */
export function finishSession(session: Session, endedAt: number): { session: Session; removed: RemovedPerformance[] } {
  const removed: RemovedPerformance[] = [];
  const kept: Performance[] = [];
  session.performances.forEach((performance, index) => {
    if (performance.reps.length === 0) removed.push({ index, performance });
    else kept.push(performance);
  });
  const later = new Map((session.later ?? []).map((key, i) => [key, i]));
  const ordered = [
    ...kept.filter((p) => !later.has(p.variantId)),
    ...kept.filter((p) => later.has(p.variantId)).sort((a, b) => later.get(a.variantId)! - later.get(b.variantId)!),
  ];
  const end = session.startedAt !== null ? Math.max(endedAt, session.startedAt) : endedAt;
  const { locked: _locked, later: _later, ...rest } = session;
  return {
    session: { ...rest, state: 'done', endedAt: end, performances: ordered, updatedAt: endedAt },
    removed,
  };
}

/**
 * Séance terminée qui peut être complétée (version 1.28.0) : saisie dans l'appli, avec ses heures, et du jour même.
 */
export function canComplete(session: Session, now: number): boolean {
  return (
    session.state === 'done' &&
    session.origin === 'app' &&
    session.startedAt !== null &&
    session.endedAt !== null &&
    session.date === localDate(now)
  );
}

/** La dernière séance terminée du jour qui peut être complétée, s'il y en a une. */
export function completableSession(sessions: readonly Session[], now: number): Session | undefined {
  return sessions.filter((s) => canComplete(s, now)).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0];
}

/** « Compléter la séance de ce matin » (avant midi), « de cet après-midi » (avant 18 h), « de ce soir ». */
export function completeLabel(session: Session): string {
  const hour = new Date(session.startedAt ?? 0).getHours();
  return `Compléter la séance ${hour < 12 ? 'de ce matin' : hour < 18 ? 'de cet après-midi' : 'de ce soir'}`;
}

/**
 * Rouvre une séance terminée du jour pour la compléter (version 1.28.0) : elle redevient la séance en cours, avec son
 * lieu ; la pause depuis sa fin est retirée de sa durée ; ses exercices et son cardio restent fermés.
 */
export function reopenSession(session: Session, now: number): Session {
  const endedAt = session.endedAt ?? now;
  const pauseMs = session.pauseMs ?? 0;
  return {
    ...session,
    state: 'active',
    endedAt: null,
    pauseMs: pauseMs + Math.max(0, now - endedAt),
    locked: {
      variantIds: session.performances.map((p) => p.variantId),
      cardioIds: (session.cardio ?? []).map((b) => b.id),
      endedAt,
      pauseMs,
    },
    updatedAt: now,
  };
}

/** « Annuler les ajouts » d'une séance complétée : elle redevient exactement la séance terminée d'avant. */
export function cancelAdditions(session: Session, now: number): Session {
  const { locked, pauseMs: _pause, later: _later, ...rest } = session;
  if (!locked) return session;
  const variantIds = new Set(locked.variantIds);
  const cardioIds = new Set(locked.cardioIds);
  const cardio = (session.cardio ?? []).filter((b) => cardioIds.has(b.id));
  const { cardio: _cardio, ...base } = rest;
  return {
    ...base,
    state: 'done',
    endedAt: locked.endedAt,
    performances: session.performances.filter((p) => variantIds.has(p.variantId)),
    ...(cardio.length > 0 ? { cardio } : {}),
    ...(locked.pauseMs > 0 ? { pauseMs: locked.pauseMs } : {}),
    updatedAt: now,
  };
}

/** Renomme la séance ; un nom vide rétablit le nom par défaut. */
export function renameSession(session: Session, name: string, now: number): Session {
  const trimmed = name.trim();
  const next = trimmed || (session.startedAt !== null ? defaultSessionName(session.startedAt) : session.name);
  return next === session.name ? session : { ...session, name: next, updatedAt: now };
}

/**
 * Temps écoulé calculé depuis l'horodatage de début, jamais par incrément (§6) ; une séance complétée ne compte pas
 * la pause entre ses périodes (version 1.28.0).
 */
export function elapsedMs(session: Session, now: number): number {
  if (session.startedAt === null) return 0;
  return Math.max(0, (session.endedAt ?? now) - session.startedAt - (session.pauseMs ?? 0));
}

export function isForgotten(session: Session, now: number): boolean {
  return session.state === 'active' && session.startedAt !== null && elapsedMs(session, now) > FORGOTTEN_AFTER_MS;
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
