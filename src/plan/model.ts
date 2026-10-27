/**
 * Séance prévue (§5.9) : préparée au calme, une seule à la fois, puis démarrée en un appui à la salle.
 * Le plan ne fige ni charge ni cible : le moteur les donne à la préparation et les recalcule au démarrage (une séance
 * faite entre-temps est prise en compte). Il reste proposé jusqu'à ce qu'une séance démarrée à partir de lui soit
 * terminée avec au moins une série ou un cardio ; une séance libre ne le touche pas. Fonctions pures.
 */
import type { CardioBlock, Performance, PlanItem, Session, SessionPlan } from '../domain/types';
import { cardioBlockErrors, cardioOf } from '../cardio/model';
import { newPerformance, startSession, type VariantContext } from '../session/ops';

export function newPlan(now: number, id: string): SessionPlan {
  return { id, createdAt: now, updatedAt: now, exercises: [], cardio: [] };
}

export function inPlan(plan: SessionPlan | null, variantId: string): boolean {
  return !!plan?.exercises.some((e) => e.variantId === variantId);
}

/** Ajoute un exercice à la fin du plan ; déjà prévu, le plan est inchangé. */
export function addToPlan(plan: SessionPlan, variantId: string, now: number, startWeightKg?: number): SessionPlan {
  if (inPlan(plan, variantId)) return plan;
  const item: PlanItem = startWeightKg !== undefined ? { variantId, startWeightKg } : { variantId };
  return { ...plan, exercises: [...plan.exercises, item], updatedAt: now };
}

export function removeFromPlan(plan: SessionPlan, variantId: string, now: number): SessionPlan {
  const exercises = plan.exercises.filter((e) => e.variantId !== variantId);
  return exercises.length === plan.exercises.length ? plan : { ...plan, exercises, updatedAt: now };
}

/** Déplace un exercice d'un rang vers le haut (−1) ou vers le bas (+1). */
export function movePlanExercise(plan: SessionPlan, variantId: string, delta: -1 | 1, now: number): SessionPlan {
  const from = plan.exercises.findIndex((e) => e.variantId === variantId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= plan.exercises.length) return plan;
  const exercises = [...plan.exercises];
  [exercises[from], exercises[to]] = [exercises[to]!, exercises[from]!];
  return { ...plan, exercises, updatedAt: now };
}

export function addPlanCardio(plan: SessionPlan, block: CardioBlock, now: number): SessionPlan {
  return { ...plan, cardio: [...plan.cardio, block], updatedAt: now };
}

export function updatePlanCardio(plan: SessionPlan, block: CardioBlock, now: number): SessionPlan {
  return { ...plan, cardio: plan.cardio.map((b) => (b.id === block.id ? block : b)), updatedAt: now };
}

export function removePlanCardio(plan: SessionPlan, id: string, now: number): SessionPlan {
  return { ...plan, cardio: plan.cardio.filter((b) => b.id !== id), updatedAt: now };
}

export function isEmptyPlan(plan: SessionPlan): boolean {
  return plan.exercises.length === 0 && plan.cardio.length === 0;
}

/**
 * Exercice du plan tel qu'il sera prérempli au démarrage, d'après le moteur à cet instant : charge du palier (ou poids
 * de départ), cible attendue, séries standard. Null sans charge connue.
 */
export function plannedPerformance(item: PlanItem, ctx: VariantContext): Performance | null {
  return newPerformance(item.variantId, ctx, item.startWeightKg);
}

/**
 * Démarre la séance prévue : exercices dans l'ordre du plan, charge et cible recalculées par le moteur maintenant,
 * séries préremplies. Un exercice supprimé ou archivé depuis la préparation est ignoré. Le cardio prévu reste à
 * valider pendant la séance.
 */
export function startFromPlan(
  plan: SessionPlan,
  ctxFor: (variantId: string) => VariantContext,
  available: (variantId: string) => boolean,
  now: number,
  id: string,
): Session {
  const performances = plan.exercises
    .filter((e) => available(e.variantId))
    .map((e) => plannedPerformance(e, ctxFor(e.variantId)))
    .filter((p): p is Performance => p !== null);
  const session = startSession(now, id);
  return {
    ...session,
    performances,
    fromPlan: {
      planId: plan.id,
      variantIds: performances.map((p) => p.variantId),
      ...(plan.cardio.length > 0 ? { cardio: plan.cardio.map((b) => ({ ...b })) } : {}),
    },
  };
}

/** Cardio prévu pas encore validé dans la séance. */
export function pendingPlanCardio(session: Session): CardioBlock[] {
  const done = new Set(cardioOf(session).map((b) => b.id));
  return (session.fromPlan?.cardio ?? []).filter((b) => !done.has(b.id));
}

/**
 * Ce qui était prévu et n'a pas été fait, signalé (sans bloquer) au moment de terminer : exercices prévus sans aucune
 * série (retirés de la séance terminée, §5.6) et cardio prévu non validé (pas enregistré).
 */
export function plannedNotDone(session: Session): { exercises: Performance[]; cardio: CardioBlock[] } {
  const planned = new Set(session.fromPlan?.variantIds ?? []);
  return {
    exercises: session.performances.filter((p) => planned.has(p.variantId) && p.reps.length === 0),
    cardio: pendingPlanCardio(session),
  };
}

/** La séance, terminée avec au moins une série ou un cardio, a réalisé ce plan : il n'est plus proposé. */
export function consumesPlan(session: Session, planId: string): boolean {
  return (
    session.state === 'done' &&
    session.fromPlan?.planId === planId &&
    (session.performances.some((p) => p.reps.length > 0) || cardioOf(session).length > 0)
  );
}

/** Le plan enregistré, s'il n'a pas encore été réalisé. */
export function currentPlan(stored: SessionPlan | null, sessions: readonly Session[]): SessionPlan | null {
  return stored && !sessions.some((s) => consumesPlan(s, stored.id)) ? stored : null;
}

// ——— Contrôle (base, sauvegarde) ——————————————————————————————————————

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Contrôle d'un plan enregistré ou importé. Liste vide = valide. */
export function planErrors(value: unknown, path = 'plan'): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path} invalide.`];
  const o = value as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof o.id !== 'string' || !o.id) errors.push(`${path}.id manquant.`);
  if (!isNum(o.createdAt)) errors.push(`${path}.createdAt invalide.`);
  if (!isNum(o.updatedAt)) errors.push(`${path}.updatedAt invalide.`);
  if (!Array.isArray(o.exercises)) errors.push(`${path}.exercises invalide.`);
  else {
    o.exercises.forEach((e, i) => {
      const item = e as Record<string, unknown> | null;
      if (typeof item !== 'object' || item === null || typeof item.variantId !== 'string' || !item.variantId) {
        errors.push(`${path}.exercises[${i}] invalide.`);
      } else if (item.startWeightKg !== undefined && !(isNum(item.startWeightKg) && item.startWeightKg > 0)) {
        errors.push(`${path}.exercises[${i}].startWeightKg invalide.`);
      }
    });
    const ids = o.exercises.map((e) => (e as { variantId?: unknown } | null)?.variantId);
    if (new Set(ids).size !== ids.length) errors.push(`${path} : exercice prévu deux fois.`);
  }
  if (!Array.isArray(o.cardio)) errors.push(`${path}.cardio invalide.`);
  else {
    o.cardio.forEach((b, i) => errors.push(...cardioBlockErrors(b, `${path}.cardio[${i}]`)));
    const ids = o.cardio.map((b) => (b as { id?: unknown } | null)?.id);
    if (new Set(ids).size !== ids.length) errors.push(`${path} : bloc de cardio prévu deux fois.`);
  }
  return errors;
}

/** Plan lu dans la base : invalide ou absent → aucun plan. */
export function sanitizePlan(value: unknown): SessionPlan | null {
  return value !== null && value !== undefined && planErrors(value).length === 0 ? (value as SessionPlan) : null;
}

/** Contrôle de l'origine d'une séance démarrée à partir du plan. */
export function planOriginErrors(value: unknown, path: string): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path} invalide.`];
  const o = value as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof o.planId !== 'string' || !o.planId) errors.push(`${path}.planId manquant.`);
  if (!Array.isArray(o.variantIds) || !o.variantIds.every((v) => typeof v === 'string')) errors.push(`${path}.variantIds invalide.`);
  if (o.cardio !== undefined) {
    if (!Array.isArray(o.cardio)) errors.push(`${path}.cardio invalide.`);
    else o.cardio.forEach((b, i) => errors.push(...cardioBlockErrors(b, `${path}.cardio[${i}]`)));
  }
  return errors;
}

/**
 * Import en fusion (§11.10) : le plan de l'appareil est gardé ; sans plan ici, celui de la sauvegarde est repris s'il
 * n'a pas déjà été réalisé (séances après l'import).
 */
export function mergePlan(
  local: SessionPlan | null,
  imported: SessionPlan | null,
  sessions: readonly Session[],
): { plan: SessionPlan | null; added: boolean; keptLocal: boolean } {
  if (local) return { plan: local, added: false, keptLocal: !!imported && JSON.stringify(imported) !== JSON.stringify(local) };
  const plan = currentPlan(imported, sessions);
  return { plan, added: plan !== null, keptLocal: false };
}
