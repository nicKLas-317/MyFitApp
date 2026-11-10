/**
 * Séance pour compléter la semaine (version 1.39.0, §5.15) : à partir des séances terminées de la semaine (lundi –
 * dimanche), une séance à la salle qui vise les groupes du récapitulatif encore sous l'objectif (le seuil du rouge, en
 * séries depuis la version 1.45.0 : 10 par défaut), avec des exercices déjà faits. Calcul pur, refait à l'affichage
 * (donc après chaque séance), jamais stocké ; il ne remplace jamais la séance prévue : « En faire ma séance prévue »
 * la copie, « Démarrer cette séance » la déroule comme une séance prévue sans toucher au plan. Aucun effet sur le
 * moteur ni sur le récapitulatif.
 */
import type { CardioBlock, CardioMachine, Exercise, MuscleGroup, PlanItem, Session, SessionPlan } from '../domain/types';
import type { ActivityRecord } from '../activities/model';
import { compareSessions, resolveConfig, type EngineSettings } from '../engine';
import { weeklyRecap, type WeeklyRecapSettings } from '../analysis/weekly';
import { localDate, parseIsoDay, sessionStartTime, shiftIsoDay, weekBounds, weekStart } from '../domain/calendar';
import { recapGroupOf } from '../domain/muscleGroups';
import { countsAsWork } from '../domain/performance';
import { sessionSteps } from './model';

/** Exercices au plus, hors bonus abdos. */
export const SUGGEST_MAX = 6;
/**
 * Exercices au moins, hors bonus abdos : en dessous, un 2ᵉ exercice pour les groupes les plus en retrait, même déjà à
 * l'objectif avec le 1ᵉʳ (une séance à la salle de 2 ou 3 exercices ne vaut pas le déplacement).
 */
export const SUGGEST_MIN = 4;
/** Exercices au plus pour un même groupe. */
export const SUGGEST_PER_GROUP = 2;
/** Fenêtre des exercices « déjà faits » : 6 semaines. */
export const SUGGEST_WINDOW_DAYS = 42;
/** Les abdos : un exercice en bonus, en fin de séance, hors des 6. */
export const BONUS_GROUP: MuscleGroup = 'abdominaux';

/** Ordre de la séance : gros groupes d'abord, puis épaules et bras ; les abdos en bonus, à la fin. */
const SESSION_ORDER: readonly MuscleGroup[] = [
  'pectoraux', 'dos', 'jambes', 'quadriceps', 'ischio-jambiers', 'mollets', 'fessiers', 'adducteurs', 'epaules', 'triceps', 'biceps',
];

export interface SuggestedExercise {
  variantId: string;
  /** Groupe du récapitulatif visé (groupe principal de l'exercice). */
  group: MuscleGroup;
  /** 2ᵉ exercice du groupe : encore sous l'objectif avec le 1ᵉʳ, ou pour atteindre 4 exercices. */
  second: boolean;
  /** Bonus abdos, hors des 6 exercices. */
  bonus: boolean;
}

export type SkipReason = 'veille' | 'place' | 'aucun';

export interface WeekSuggestion {
  /** Jour de la séance proposée (« YYYY-MM-DD ») : aujourd'hui, ou demain après une séance à la salle aujourd'hui. */
  day: string;
  tomorrow: boolean;
  /** Échauffement : le premier cardio de la dernière séance à la salle qui en avait (identifiant à remplacer). */
  cardio: CardioBlock | null;
  /** Exercices dans l'ordre de la séance, le bonus abdos en dernier. */
  exercises: SuggestedExercise[];
  /**
   * Groupes complétés par le groupe secondaire d'un exercice proposé, sans exercice propre : les exercices déjà proposés
   * (et l'échauffement) les portent à l'objectif (version 1.45.0 : il leur manquait au plus la moitié des séries de cet
   * exercice, 1,5 série pour un tirage de 3 séries et le biceps).
   */
  covered: { group: MuscleGroup; by: string }[];
  /** Groupes sous l'objectif sans exercice : travaillés à la salle la veille, pas de place, aucun exercice déjà fait. */
  skipped: { group: MuscleGroup; reason: SkipReason }[];
  /** Groupes sous l'objectif qui l'atteignent avec cette séance, et ceux qui y restent, dans l'ordre du récapitulatif. */
  reached: MuscleGroup[];
  remaining: MuscleGroup[];
}

export interface SuggestionInput {
  sessions: readonly Session[];
  exercises: readonly Exercise[];
  settings: EngineSettings;
  recap: WeeklyRecapSettings;
  activities?: readonly ActivityRecord[];
  /** Machines de cardio des réglages : celles qui comptent pour les jambes (version 1.41.0). */
  machines?: readonly CardioMachine[];
  now: number;
}

const isGym = (s: Session) => s.location !== 'maison';
const done = (s: Session) => s.state === 'done';

/**
 * La suggestion, ou null quand elle n'est pas affichée : aucune séance terminée à la salle cette semaine, la séance
 * proposée tomberait la semaine suivante (dimanche après une séance), ou aucun groupe à compléter (hors abdos).
 *
 * Règle (choix validés par l'utilisateur ; en séries depuis la version 1.45.0) :
 * - objectif : le seuil du rouge du récapitulatif, en séries (10 par défaut) ; score de chaque groupe : celui du
 *   récapitulatif (séries, activités, cardio des jambes) ;
 * - groupes visés : ceux du récapitulatif sous l'objectif, sauf ceux travaillés en direct à la salle la veille de la
 *   séance proposée (la maison et les activités n'écartent rien) ;
 * - 1ᵉʳ passage, le plus en retrait d'abord (score croissant, puis l'ordre du récapitulatif) : un exercice par groupe,
 *   6 au plus ; un groupe que les exercices déjà proposés portent à l'objectif par leur groupe secondaire (il lui
 *   manquait au plus la moitié de leurs séries) est complété par eux, sans exercice propre ;
 * - 2ᵉ passage, dans le même ordre : un 2ᵉ exercice aux groupes encore sous l'objectif une fois le 1ᵉʳ compté (avec ses
 *   séries standard), tant qu'il reste de la place (6 au total, 2 par groupe au plus) ;
 * - moins de 4 exercices : un 2ᵉ exercice aux groupes les plus en retrait (2 par groupe au plus) ;
 * - les abdos, s'ils sont au récapitulatif et sous l'objectif : un exercice en bonus, en fin de séance, hors des 6 ;
 * - exercices déjà faits à la salle dans les 6 dernières semaines (au poids du corps : n'importe où, un seul suivi),
 *   non archivés ; préférés : aucun groupe secondaire travaillé la veille, pas encore fait cette semaine, le plus
 *   souvent fait, le plus récent ;
 * - ordre : pectoraux, dos, jambes, épaules, triceps, biceps, puis le bonus ; en tête, le cardio d'échauffement.
 */
export function weekSuggestion(input: SuggestionInput): WeekSuggestion | null {
  const { sessions, exercises, settings, recap, activities = [], machines = [], now } = input;
  const today = localDate(now);
  const finished = sessions.filter(done);
  const gymToday = finished.some((s) => isGym(s) && s.date === today);
  const day = gymToday ? shiftIsoDay(today, 1) : today;
  const { start: monday, next: nextMonday } = weekBounds(now);
  const week = monday.getTime();
  if (weekStart(parseIsoDay(day, 0, 12)).getTime() !== week) return null;
  const inWeek = (s: Session) => sessionStartTime(s) >= week && sessionStartTime(s) < nextMonday.getTime();
  if (!finished.some((s) => isGym(s) && inWeek(s))) return null;

  const shown = new Set(recap.groups);
  const recapGroup = (g: MuscleGroup) => recapGroupOf(g, shown);
  const byVariant = new Map<string, { exercise: Exercise; archived: boolean }>();
  for (const e of exercises) for (const v of e.variants) byVariant.set(v.id, { exercise: e, archived: e.archived || v.archived });
  const primaryOf = (id: string) => {
    const e = byVariant.get(id)?.exercise;
    return e ? recapGroup(e.primaryGroup) : null;
  };
  const secondariesOf = (id: string): MuscleGroup[] => {
    const e = byVariant.get(id)?.exercise;
    const primary = primaryOf(id);
    return e ? [...new Set(e.secondaryGroups.map(recapGroup))].filter((g): g is MuscleGroup => g !== null && g !== primary) : [];
  };

  // Scores de la semaine, comme le récapitulatif.
  const cells = weeklyRecap(sessions, exercises, now, recap, activities, machines).cells;
  const score = new Map(cells.map((c) => [c.group, c.score]));
  const objective = recap.redSets;
  const order = (g: MuscleGroup) => recap.groups.indexOf(g);
  const byNeed = (a: MuscleGroup, b: MuscleGroup) => (score.get(a) ?? 0) - (score.get(b) ?? 0) || order(a) - order(b);

  // La veille de la séance proposée : groupes travaillés en direct à la salle.
  const eve = shiftIsoDay(day, -1);
  const avoided = new Set<MuscleGroup>();
  for (const s of finished) {
    if (!isGym(s) || s.date !== eve) continue;
    for (const p of s.performances) {
      // Comme le récapitulatif : une performance partielle importée compte (version 1.41.3).
      const g = countsAsWork(p) ? primaryOf(p.variantId) : null;
      if (g) avoided.add(g);
    }
  }

  // Exercices déjà faits : à la salle dans les 6 dernières semaines (au poids du corps : n'importe où).
  const since = shiftIsoDay(today, -SUGGEST_WINDOW_DAYS);
  const freq = new Map<string, number>();
  const last = new Map<string, Session>();
  const thisWeek = new Set<string>();
  for (const s of finished) {
    if (s.date < since) continue;
    for (const p of s.performances) {
      const ref = byVariant.get(p.variantId);
      if (!ref || ref.archived || p.reps.length === 0) continue;
      if (!isGym(s) && !resolveConfig(settings, p.variantId).bodyweight) continue;
      freq.set(p.variantId, (freq.get(p.variantId) ?? 0) + 1);
      const prev = last.get(p.variantId);
      if (!prev || compareSessions(prev, s) < 0) last.set(p.variantId, s);
      if (inWeek(s)) thisWeek.add(p.variantId);
    }
  }
  const pick = (group: MuscleGroup, taken: readonly string[]): string | undefined =>
    [...freq.keys()]
      .filter((id) => primaryOf(id) === group && !taken.includes(id))
      .sort(
        (a, b) =>
          Number(secondariesOf(a).some((g) => avoided.has(g))) - Number(secondariesOf(b).some((g) => avoided.has(g))) ||
          Number(thisWeek.has(a)) - Number(thisWeek.has(b)) ||
          freq.get(b)! - freq.get(a)! ||
          compareSessions(last.get(b)!, last.get(a)!) ||
          (a < b ? -1 : 1),
      )[0];

  const under = recap.groups.filter((g) => g !== BONUS_GROUP && (score.get(g) ?? 0) < objective).sort(byNeed);
  const skipped: { group: MuscleGroup; reason: SkipReason }[] = [];
  const targets: MuscleGroup[] = [];
  for (const g of under) (avoided.has(g) ? skipped.push({ group: g, reason: 'veille' }) : targets.push(g));

  // Échauffement : le premier cardio de la dernière séance à la salle qui en avait. Il compte pour le cardio des jambes
  // dans la séance projetée.
  const withCardio = finished.filter((s) => isGym(s) && (s.cardio?.length ?? 0) > 0).sort(compareSessions).at(-1);
  const firstCardio = withCardio && sessionSteps(withCardio).find((st) => st.kind === 'cardio');
  const cardio: CardioBlock | null =
    firstCardio && firstCardio.kind === 'cardio'
      ? { id: 'echauffement', machineId: firstCardio.block.machineId, machine: firstCardio.block.machine, ...(firstCardio.block.incline ? { incline: firstCardio.block.incline } : {}), minutes: firstCardio.block.minutes }
      : null;

  /**
   * Scores du récapitulatif avec la séance proposée (version 1.45.0) : chaque exercice avec ses séries standard
   * (`resolveConfig`, 2 pour les pompes), et l'échauffement.
   */
  const at = parseIsoDay(day, 0, 12).getTime();
  const projectedScores = (ids: readonly string[]): Map<MuscleGroup, number> => {
    const projected: Session = {
      id: 'suggestion', name: '', date: day, startedAt: at, endedAt: at + 3_600_000, createdAt: at, updatedAt: at, origin: 'app', state: 'done',
      performances: ids.map((variantId) => {
        const cfg = resolveConfig(settings, variantId);
        return { variantId, weightKg: cfg.bodyweight ? 0 : 1, targetReps: cfg.minReps, plannedSets: cfg.sets, reps: Array<number>(cfg.sets).fill(cfg.minReps), feeling: 'bien' as const };
      }),
      ...(cardio ? { cardio: [cardio] } : {}),
    };
    return new Map(weeklyRecap([...sessions, projected], exercises, at, recap, activities, machines).cells.map((c) => [c.group, c.score]));
  };

  const chosen: SuggestedExercise[] = [];
  const covered: { group: MuscleGroup; by: string }[] = [];
  const chosenIds = () => chosen.map((c) => c.variantId);
  const countOf = (g: MuscleGroup) => chosen.filter((c) => c.group === g).length;
  const choose = (g: MuscleGroup, second = false): boolean => {
    const id = pick(g, chosenIds());
    if (!id) return false;
    chosen.push({ variantId: id, group: g, second, bonus: false });
    return true;
  };
  // 1ᵉʳ passage : un exercice par groupe, le plus en retrait d'abord ; un groupe que les exercices déjà proposés
  // portent à l'objectif par leur groupe secondaire est complété par eux (les moins en retrait passent en dernier).
  for (const g of targets) {
    const by = chosen.find((c) => secondariesOf(c.variantId).includes(g));
    if (by && (projectedScores(chosenIds()).get(g) ?? 0) >= objective) covered.push({ group: g, by: by.variantId });
    else if (chosen.length >= SUGGEST_MAX) skipped.push({ group: g, reason: 'place' });
    else if (!choose(g)) skipped.push({ group: g, reason: 'aucun' });
  }
  if (chosen.length === 0) return null;
  // 2ᵉ passage : un 2ᵉ exercice aux groupes encore sous l'objectif avec le 1ᵉʳ, tant qu'il reste de la place.
  for (const g of targets) {
    if (chosen.length >= SUGGEST_MAX) break;
    const count = countOf(g);
    if (count > 0 && count < SUGGEST_PER_GROUP && (projectedScores(chosenIds()).get(g) ?? 0) < objective) choose(g, true);
  }
  // Moins de 4 exercices : un 2ᵉ exercice aux groupes les plus en retrait, même déjà à l'objectif.
  for (const g of targets) {
    if (chosen.length >= SUGGEST_MIN) break;
    const count = countOf(g);
    if (count > 0 && count < SUGGEST_PER_GROUP) choose(g, true);
  }
  chosen.sort((a, b) => SESSION_ORDER.indexOf(a.group) - SESSION_ORDER.indexOf(b.group) || Number(a.second) - Number(b.second));

  if (shown.has(BONUS_GROUP) && (score.get(BONUS_GROUP) ?? 0) < objective) {
    const id = avoided.has(BONUS_GROUP) ? undefined : pick(BONUS_GROUP, []);
    if (id) chosen.push({ variantId: id, group: BONUS_GROUP, second: false, bonus: true });
    else skipped.push({ group: BONUS_GROUP, reason: avoided.has(BONUS_GROUP) ? 'veille' : 'aucun' });
  }

  const after = projectedScores(chosenIds());
  const below = recap.groups.filter((g) => (score.get(g) ?? 0) < objective);
  return {
    day,
    tomorrow: gymToday,
    cardio,
    exercises: chosen,
    covered,
    skipped: skipped.sort((a, b) => order(a.group) - order(b.group)),
    reached: below.filter((g) => (after.get(g) ?? 0) >= objective),
    remaining: below.filter((g) => (after.get(g) ?? 0) < objective),
  };
}

/**
 * Échéance affichée (version 1.40.1) : la séance n'impose pas de jour, seulement la fin de la semaine. « D'ici
 * dimanche », sauf le dimanche (la séance proposée est alors celle du jour, la dernière possible) : « Aujourd'hui ».
 */
export function suggestionDueToday(s: WeekSuggestion): boolean {
  return !s.tomorrow && parseIsoDay(s.day, 0, 12).getDay() === 0;
}

/** Éléments de la séance proposée : l'échauffement en tête, puis les exercices (identifiant du cardio fourni). */
export function suggestionItems(s: WeekSuggestion, newId: () => string): PlanItem[] {
  return [
    ...(s.cardio ? [{ kind: 'cardio' as const, block: { ...s.cardio, id: newId() } }] : []),
    ...s.exercises.map((e): PlanItem => ({ kind: 'exercise', variantId: e.variantId })),
  ];
}

/** La suggestion en séance prévue (« En faire ma séance prévue », ou pour la démarrer sans toucher au plan). */
export function suggestionPlan(s: WeekSuggestion, now: number, newId: () => string): SessionPlan {
  return { id: newId(), createdAt: now, updatedAt: now, items: suggestionItems(s, newId) };
}

/** La séance prévue reprend déjà les exercices de la suggestion (copiée) : la ligne de l'accueil n'est plus utile. */
export function planMatchesSuggestion(plan: SessionPlan | null, s: WeekSuggestion): boolean {
  if (!plan) return false;
  const planned = plan.items.flatMap((i) => (i.kind === 'exercise' ? [i.variantId] : [])).sort();
  const suggested = s.exercises.map((e) => e.variantId).sort();
  return planned.length === suggested.length && planned.every((id, i) => id === suggested[i]);
}
