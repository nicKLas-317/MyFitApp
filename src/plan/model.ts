/**
 * Séance prévue (§5.9) : préparée au calme, une seule à la fois, puis démarrée en un appui à la salle.
 * Le plan ne fige ni charge ni cible : le moteur les donne à la préparation et les recalcule au démarrage (une séance
 * faite entre-temps est prise en compte). Il reste proposé jusqu'à ce qu'une séance démarrée à partir de lui soit
 * terminée avec au moins une série ou un cardio ; une séance libre ne le touche pas. Fonctions pures.
 */
import type { CardioBlock, Performance, PlanCardio, PlanExercise, PlanItem, PlanOrigin, PlanStep, Session, SessionPlan } from '../domain/types';
import { cardioBlockErrors, cardioOf } from '../cardio/model';
import { newPerformance, startSession, type VariantContext } from '../session/ops';

export function newPlan(now: number, id: string): SessionPlan {
  return { id, createdAt: now, updatedAt: now, items: [] };
}

const isExercise = (item: PlanItem): item is PlanExercise => item.kind === 'exercise';
const isCardio = (item: PlanItem): item is PlanCardio => item.kind === 'cardio';

/** Exercices prévus, dans l'ordre du plan. */
export function planExercises(plan: SessionPlan): PlanExercise[] {
  return plan.items.filter(isExercise);
}

/** Cardio prévu, dans l'ordre du plan. */
export function planCardio(plan: SessionPlan): CardioBlock[] {
  return plan.items.filter(isCardio).map((c) => c.block);
}

/** Clé stable d'un élément du plan ou d'une étape de séance : l'exercice-variante, ou « cardio:<bloc> ». */
export function itemKey(item: PlanItem | PlanStep): string {
  if (item.kind === 'exercise') return item.variantId;
  return `cardio:${'block' in item ? item.block.id : item.id}`;
}

export function inPlan(plan: SessionPlan | null, variantId: string): boolean {
  return !!plan?.items.some((e) => isExercise(e) && e.variantId === variantId);
}

/** Ajoute un exercice à la fin du plan ; déjà prévu, le plan est inchangé. */
export function addToPlan(plan: SessionPlan, variantId: string, now: number, startWeightKg?: number): SessionPlan {
  if (inPlan(plan, variantId)) return plan;
  const item: PlanExercise = startWeightKg !== undefined ? { kind: 'exercise', variantId, startWeightKg } : { kind: 'exercise', variantId };
  return { ...plan, items: [...plan.items, item], updatedAt: now };
}

export function removeFromPlan(plan: SessionPlan, variantId: string, now: number): SessionPlan {
  const items = plan.items.filter((e) => !(isExercise(e) && e.variantId === variantId));
  return items.length === plan.items.length ? plan : { ...plan, items, updatedAt: now };
}

/** Déplace un élément (exercice ou cardio, désigné par sa clé) d'un rang vers le haut (−1) ou vers le bas (+1). */
export function movePlanItem(plan: SessionPlan, key: string, delta: -1 | 1, now: number): SessionPlan {
  const from = plan.items.findIndex((e) => itemKey(e) === key);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= plan.items.length) return plan;
  const items = [...plan.items];
  [items[from], items[to]] = [items[to]!, items[from]!];
  return { ...plan, items, updatedAt: now };
}

/** Ajoute un bloc de cardio à la fin du plan. */
export function addPlanCardio(plan: SessionPlan, block: CardioBlock, now: number): SessionPlan {
  return { ...plan, items: [...plan.items, { kind: 'cardio', block }], updatedAt: now };
}

/** Corrige un bloc de cardio prévu, à sa place. */
export function updatePlanCardio(plan: SessionPlan, block: CardioBlock, now: number): SessionPlan {
  return { ...plan, items: plan.items.map((e) => (isCardio(e) && e.block.id === block.id ? { kind: 'cardio', block } : e)), updatedAt: now };
}

export function removePlanCardio(plan: SessionPlan, id: string, now: number): SessionPlan {
  return { ...plan, items: plan.items.filter((e) => !(isCardio(e) && e.block.id === id)), updatedAt: now };
}

export function isEmptyPlan(plan: SessionPlan): boolean {
  return plan.items.length === 0;
}

/**
 * Exercice du plan tel qu'il sera prérempli au démarrage, d'après le moteur à cet instant : charge du palier (ou poids
 * de départ), cible attendue, séries standard. Null sans charge connue.
 */
export function plannedPerformance(item: Omit<PlanExercise, 'kind'>, ctx: VariantContext): Performance | null {
  return newPerformance(item.variantId, ctx, item.startWeightKg);
}

/**
 * Démarre la séance prévue : exercices dans l'ordre du plan, charge et cible recalculées par le moteur maintenant,
 * séries préremplies. Un exercice supprimé ou archivé depuis la préparation est ignoré. Le cardio prévu reste à
 * valider pendant la séance ; l'ordre du plan (musculation et cardio mêlés) est gardé dans l'origine de la séance.
 */
export function startFromPlan(
  plan: SessionPlan,
  ctxFor: (variantId: string) => VariantContext,
  available: (variantId: string) => boolean,
  now: number,
  id: string,
): Session {
  const performances = planExercises(plan)
    .filter((e) => available(e.variantId))
    .map((e) => plannedPerformance(e, ctxFor(e.variantId)))
    .filter((p): p is Performance => p !== null);
  const started = new Set(performances.map((p) => p.variantId));
  const cardio = planCardio(plan);
  const order: PlanStep[] = plan.items.flatMap((e): PlanStep[] =>
    isCardio(e) ? [{ kind: 'cardio', id: e.block.id }] : started.has(e.variantId) ? [{ kind: 'exercise', variantId: e.variantId }] : [],
  );
  const session = startSession(now, id);
  return {
    ...session,
    performances,
    fromPlan: {
      planId: plan.id,
      variantIds: performances.map((p) => p.variantId),
      ...(cardio.length > 0 ? { cardio: cardio.map((b) => ({ ...b })) } : {}),
      order,
    },
  };
}

/** Élément affiché dans la séance : un exercice, ou un bloc de cardio (enregistré, ou prévu et pas encore validé). */
/** `locked` : déjà fait dans une séance complétée (version 1.28.0), fermé, corrigé depuis l'historique. */
export type SessionStep =
  | { kind: 'exercise'; key: string; performance: Performance; locked: boolean }
  | { kind: 'cardio'; key: string; block: CardioBlock; pending: boolean; locked: boolean };

/** Ordre prévu d'une séance démarrée à partir du plan ; une séance antérieure à la version 1.23.2 : exercices, puis cardio. */
function originOrder(origin: PlanOrigin): PlanStep[] {
  return (
    origin.order ?? [
      ...origin.variantIds.map((variantId): PlanStep => ({ kind: 'exercise', variantId })),
      ...(origin.cardio ?? []).map((b): PlanStep => ({ kind: 'cardio', id: b.id })),
    ]
  );
}

/**
 * Ordre d'affichage de la séance. Séance prévue : l'ordre du plan, musculation et cardio mêlés (un cardio prévu validé
 * reste à sa place, retiré il redevient « prévu »), puis ce qui a été ajouté en séance (exercices dans l'ordre d'ajout,
 * puis cardio). Séance libre : les exercices dans l'ordre d'ajout, puis le cardio. Séance complétée : ce qui était
 * fait est fermé, et le cardio prévu non fait n'est plus proposé.
 */
export function sessionSteps(session: Session): SessionStep[] {
  const lockedExercises = new Set(session.locked?.variantIds);
  const lockedCardio = new Set(session.locked?.cardioIds);
  const exercise = (performance: Performance): SessionStep => ({
    kind: 'exercise', key: performance.variantId, performance, locked: lockedExercises.has(performance.variantId),
  });
  const cardio = (block: CardioBlock, pending: boolean): SessionStep => ({
    kind: 'cardio', key: `cardio:${block.id}`, block, pending, locked: lockedCardio.has(block.id),
  });
  const blocks = cardioOf(session);
  if (!session.fromPlan) return [...session.performances.map(exercise), ...blocks.map((b) => cardio(b, false))];
  const planned = new Map((session.fromPlan.cardio ?? []).map((b) => [b.id, b]));
  const steps: SessionStep[] = [];
  for (const step of originOrder(session.fromPlan)) {
    if (step.kind === 'exercise') {
      const p = session.performances.find((x) => x.variantId === step.variantId);
      if (p) steps.push(exercise(p));
    } else {
      const doneBlock = blocks.find((b) => b.id === step.id);
      const plannedBlock = planned.get(step.id);
      if (doneBlock) steps.push(cardio(doneBlock, false));
      else if (plannedBlock && !session.locked) steps.push(cardio(plannedBlock, true));
    }
  }
  const shown = new Set(steps.map((s) => s.key));
  return [
    ...steps,
    ...session.performances.filter((p) => !shown.has(p.variantId)).map(exercise),
    ...blocks.filter((b) => !shown.has(`cardio:${b.id}`)).map((b) => cardio(b, false)),
  ];
}

/** Élément pas encore terminé : exercice aux séries incomplètes ou sans ressenti, cardio prévu pas encore validé. */
export function unfinishedStep(step: SessionStep): boolean {
  if (step.locked) return false;
  if (step.kind === 'cardio') return step.pending;
  const p = step.performance;
  return p.plannedSets === null || p.reps.length < p.plannedSets || p.feeling === 'inconnu';
}

/** Cardio prévu pas encore validé dans la séance (aucun dans une séance complétée : il n'a pas été fait). */
export function pendingPlanCardio(session: Session): CardioBlock[] {
  if (session.locked) return [];
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

function planExerciseErrors(item: Record<string, unknown> | null, path: string): string[] {
  if (typeof item !== 'object' || item === null || typeof item.variantId !== 'string' || !item.variantId) return [`${path} invalide.`];
  if (item.startWeightKg !== undefined && !(isNum(item.startWeightKg) && item.startWeightKg > 0)) return [`${path}.startWeightKg invalide.`];
  return [];
}

function planHeaderErrors(o: Record<string, unknown>, path: string): string[] {
  const errors: string[] = [];
  if (typeof o.id !== 'string' || !o.id) errors.push(`${path}.id manquant.`);
  if (!isNum(o.createdAt)) errors.push(`${path}.createdAt invalide.`);
  if (!isNum(o.updatedAt)) errors.push(`${path}.updatedAt invalide.`);
  return errors;
}

function duplicateErrors(variantIds: unknown[], cardioIds: unknown[], path: string): string[] {
  const errors: string[] = [];
  if (new Set(variantIds).size !== variantIds.length) errors.push(`${path} : exercice prévu deux fois.`);
  if (new Set(cardioIds).size !== cardioIds.length) errors.push(`${path} : bloc de cardio prévu deux fois.`);
  return errors;
}

/** Contrôle d'un plan enregistré ou importé, au format actuel (`items`). Liste vide = valide. */
export function planErrors(value: unknown, path = 'plan'): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path} invalide.`];
  const o = value as Record<string, unknown>;
  const errors = planHeaderErrors(o, path);
  if (!Array.isArray(o.items)) return [...errors, `${path}.items invalide.`];
  const variantIds: unknown[] = [];
  const cardioIds: unknown[] = [];
  o.items.forEach((e, i) => {
    const item = e as Record<string, unknown> | null;
    const at = `${path}.items[${i}]`;
    if (item?.kind === 'exercise') {
      errors.push(...planExerciseErrors(item, at));
      variantIds.push(item.variantId);
    } else if (item?.kind === 'cardio') {
      errors.push(...cardioBlockErrors(item.block, `${at}.block`));
      cardioIds.push((item.block as { id?: unknown } | null)?.id);
    } else errors.push(`${at} invalide.`);
  });
  return [...errors, ...duplicateErrors(variantIds, cardioIds, path)];
}

/**
 * Contrôle d'un plan au format des versions 1.23.0 et 1.23.1 (sauvegarde `schemaVersion` 4, base pas encore
 * réenregistrée) : `exercises` puis `cardio`, en deux listes. Liste vide = valide.
 */
export function legacyPlanErrors(value: unknown, path = 'plan'): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path} invalide.`];
  const o = value as Record<string, unknown>;
  const errors = planHeaderErrors(o, path);
  if (!Array.isArray(o.exercises)) errors.push(`${path}.exercises invalide.`);
  else o.exercises.forEach((e, i) => errors.push(...planExerciseErrors(e as Record<string, unknown> | null, `${path}.exercises[${i}]`)));
  if (!Array.isArray(o.cardio)) errors.push(`${path}.cardio invalide.`);
  else o.cardio.forEach((b, i) => errors.push(...cardioBlockErrors(b, `${path}.cardio[${i}]`)));
  if (errors.length > 0) return errors;
  const ids = (list: unknown[], field: string) => list.map((x) => (x as Record<string, unknown>)[field]);
  return duplicateErrors(ids(o.exercises as unknown[], 'variantId'), ids(o.cardio as unknown[], 'id'), path);
}

interface LegacyPlan {
  id: string;
  createdAt: number;
  updatedAt: number;
  exercises: { variantId: string; startWeightKg?: number }[];
  cardio: CardioBlock[];
}

/**
 * Plan lu dans la base ou dans une sauvegarde, au format actuel. Un plan des versions 1.23.0 et 1.23.1 est converti
 * sans rien perdre ni changer : mêmes identifiant, dates, exercices, poids de départ et blocs, la musculation d'abord
 * puis le cardio, comme ils étaient affichés. Invalide ou absent → aucun plan.
 */
export function migratePlan(value: unknown): SessionPlan | null {
  if (value === null || value === undefined) return null;
  if (planErrors(value).length === 0) return value as SessionPlan;
  if (legacyPlanErrors(value).length > 0) return null;
  const { id, createdAt, updatedAt, exercises, cardio } = value as LegacyPlan;
  return {
    id,
    createdAt,
    updatedAt,
    items: [
      ...exercises.map(({ variantId, startWeightKg }): PlanItem =>
        startWeightKg !== undefined ? { kind: 'exercise', variantId, startWeightKg } : { kind: 'exercise', variantId },
      ),
      ...cardio.map((block): PlanItem => ({ kind: 'cardio', block })),
    ],
  };
}

/** Plan lu dans la base : converti s'il date d'une version antérieure ; invalide ou absent → aucun plan. */
export const sanitizePlan = migratePlan;

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
  if (o.order !== undefined && errors.length === 0) {
    // Les mêmes exercices et blocs que `variantIds` et `cardio`, chacun une fois.
    const expected = [
      ...(o.variantIds as string[]).map((v) => `e:${v}`),
      ...((o.cardio ?? []) as { id: string }[]).map((b) => `c:${b.id}`),
    ].sort();
    const steps = Array.isArray(o.order) ? (o.order as unknown[]) : null;
    const keys = steps?.map((x) => {
      const step = x as Record<string, unknown> | null;
      if (step?.kind === 'exercise' && typeof step.variantId === 'string') return `e:${step.variantId}`;
      if (step?.kind === 'cardio' && typeof step.id === 'string') return `c:${step.id}`;
      return null;
    });
    if (!keys || keys.includes(null) || JSON.stringify(keys.sort()) !== JSON.stringify(expected)) errors.push(`${path}.order invalide.`);
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
