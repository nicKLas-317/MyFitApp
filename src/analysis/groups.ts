/**
 * Bilan par groupe musculaire (§19.10) : indice de progression (base 100) et séries par semaine. Calcul pur, refait à
 * chaque affichage à partir des séances terminées ; jamais stocké, aucun effet sur le moteur de progression.
 * Les charges brutes de deux exercices différents ne sont jamais additionnées ni moyennées : chaque exercice-variante
 * est rapporté à sa propre première séance, et seuls ces indices sont moyennés. Ni cardio ni activités habituelles.
 */
import { sortWeighIns, type WeighIn } from '../body/model';
import type { Exercise, MuscleGroup, Performance, Session } from '../domain/types';
import { resolveConfig, sortSessions, type EngineSettings } from '../engine';
import { localDate } from '../session/format';
import { sessionStartTime, weekStart } from './weekly';

/** Groupes proposés par le sélecteur ; les abdominaux depuis la version 1.33.0. */
export const GROUP_VIEW_GROUPS: readonly MuscleGroup[] = ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux'];

/**
 * Groupes sans indice (version 1.33.0) : leurs exercices se font sans charge (poids du corps, durée), l'indice ne se
 * calcule pas ; seules les séries par semaine sont affichées.
 */
export const SETS_ONLY_GROUPS: readonly MuscleGroup[] = ['abdominaux'];

/** Seuils d'affichage : indice = 6 séances sur 3 semaines différentes ; séries = 3 semaines avec des séries. */
export const INDEX_MIN_SESSIONS = 6;
export const INDEX_MIN_WEEKS = 3;
export const SETS_MIN_WEEKS = 3;
/**
 * Semaines affichées au plus pour les séries, semaine en cours comprise ; depuis la semaine de la première séance
 * (version 1.34.0), jamais avant.
 */
export const SETS_WEEKS = 12;

const LEG_SUBGROUPS: readonly MuscleGroup[] = ['quadriceps', 'ischio-jambiers', 'mollets', 'fessiers', 'adducteurs'];

/** Groupe du sélecteur d'un groupe musculaire : les sous-groupes des jambes comptent dans « jambes ». */
function viewGroup(group: MuscleGroup): MuscleGroup {
  return LEG_SUBGROUPS.includes(group) ? 'jambes' : group;
}

/** Force estimée (formule d'Epley) sur la moins bonne série : charge × (1 + répétitions / 30). */
export function epley(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

const worstSet = (p: Performance) => Math.min(...p.reps);

/**
 * Performance exploitable pour l'indice : au moins une série enregistrée, avec une charge, pas d'historique partiel, et
 * toutes les séries prévues faites (version 1.33.0, comme pour les records) : une séance incomplète n'entre ni dans le
 * calcul, ni dans la base, ni dans le seuil des 6 séances ; ses séries restent comptées dans les séries par semaine.
 * Une performance sous la cible compte (série la moins bonne).
 */
function usable(p: Performance): boolean {
  return !p.partial && p.reps.length > 0 && p.weightKg > 0 && (p.plannedSets === null || p.reps.length >= p.plannedSets);
}

/**
 * Poids du corps (kg) à une date « YYYY-MM-DD », d'après les pesées : interpolation linéaire entre les deux pesées qui
 * l'encadrent ; avant la première pesée, la première ; après la dernière, la dernière ; une seule pesée : ce poids.
 * Null sans pesée.
 */
export function bodyWeightAt(weighIns: readonly WeighIn[], date: string): number | null {
  const sorted = sortWeighIns(weighIns);
  const first = sorted[0];
  const last = sorted.at(-1);
  if (!first || !last) return null;
  if (date <= first.date) return first.weightKg;
  if (date >= last.date) return last.weightKg;
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
  const after = sorted.findIndex((w) => w.date >= date);
  const [a, b] = [sorted[after - 1]!, sorted[after]!];
  return a.weightKg + ((b.weightKg - a.weightKg) * (day(date) - day(a.date))) / (day(b.date) - day(a.date));
}

/** Poids du corps à la date de la performance et à celle de la première séance de l'exercice-variante. */
export interface BodyWeights {
  current: number;
  first: number;
}

/**
 * Indice d'une performance par rapport à la première séance de son exercice-variante (= 100).
 * Exercice assisté (§7.12) : la charge est une aide, et moins d'aide est plus dur.
 * - Avec une pesée (`body`) : charge réelle = poids du corps (interpolé entre les pesées) − aide, puis
 *   Epley comme pour un exercice classique. Une aide au moins égale au poids du corps à la première séance n'a pas de
 *   sens physique : on revient alors à la méthode sans pesée.
 * - Sans pesée : la variation relative de l'aide est inversée : 30 → 25 kg d'aide (−17 %) donne +17 %, comme
 *   30 → 35 kg pour un exercice classique ; l'effet des répétitions (Epley) reste le même.
 * L'indice ne descend pas sous 0.
 */
export function performanceIndex(p: Performance, first: Performance, assisted: boolean, body?: BodyWeights): number {
  if (!assisted) return 100 * (epley(p.weightKg, worstSet(p)) / epley(first.weightKg, worstSet(first)));
  if (body && body.first > first.weightKg) {
    return 100 * (epley(Math.max(0, body.current - p.weightKg), worstSet(p)) / epley(body.first - first.weightKg, worstSet(first)));
  }
  const repsFactor = epley(1, worstSet(p)) / epley(1, worstSet(first));
  return 100 * Math.max(0, 2 - p.weightKg / first.weightKg) * repsFactor;
}

export interface IndexPoint {
  /** Date de la séance, « YYYY-MM-DD ». */
  date: string;
  value: number;
}

export interface GroupIndex {
  /** Indice du groupe après chaque séance qui l'a travaillé en groupe principal. */
  points: IndexPoint[];
  /** Exercices-variantes pris en compte (groupe principal), dans l'ordre de leur première séance. */
  variantIds: string[];
  /** Séances où le groupe est groupe principal d'au moins un exercice. */
  sessionCount: number;
  /** Semaines (lundi–dimanche) différentes de ces séances. */
  weekCount: number;
  enough: boolean;
  /** Méthode appliquée aux exercices assistés du groupe : charge réelle (pesées) ou aide inversée ; null sans assisté. */
  assistedMethod: 'bodyWeight' | 'inverseAid' | null;
}

/**
 * Indice de progression d'un groupe : moyenne des indices de ses exercices-variantes (groupe principal seulement),
 * chacun gardant sa dernière valeur connue. Un point par date de séance. Les pesées de « Mon poids » servent aux
 * exercices assistés (charge réelle = poids du corps − aide) ; sans pesée, l'aide est inversée. Les séances à la maison
 * n'y entrent pas (charges non comparables, version 1.26.0) ; leurs séries comptent dans les séries par semaine.
 */
export function groupIndex(
  sessions: readonly Session[],
  exercises: readonly Exercise[],
  settings: EngineSettings,
  group: MuscleGroup,
  weighIns: readonly WeighIn[] = [],
): GroupIndex {
  const primary = new Map<string, MuscleGroup>();
  for (const e of exercises) for (const v of e.variants) primary.set(v.id, viewGroup(e.primaryGroup));
  const first = new Map<string, { perf: Performance; date: string }>();
  const last = new Map<string, number>();
  const points: IndexPoint[] = [];
  const weeks = new Set<string>();
  let sessionCount = 0;
  let hasAssisted = false;
  for (const s of sortSessions(sessions.filter((x) => x.state === 'done' && x.location !== 'maison'))) {
    const perfs = s.performances.filter((p) => primary.get(p.variantId) === group && usable(p));
    if (perfs.length === 0) continue;
    sessionCount++;
    weeks.add(localDate(weekStart(new Date(sessionStartTime(s))).getTime()));
    for (const p of perfs) {
      if (!first.has(p.variantId)) first.set(p.variantId, { perf: p, date: s.date });
      const base = first.get(p.variantId)!;
      const assisted = resolveConfig(settings, p.variantId).assisted;
      hasAssisted ||= assisted;
      const current = assisted ? bodyWeightAt(weighIns, s.date) : null;
      const body = current === null ? undefined : { current, first: bodyWeightAt(weighIns, base.date)! };
      last.set(p.variantId, performanceIndex(p, base.perf, assisted, body));
    }
    const value = [...last.values()].reduce((a, b) => a + b, 0) / last.size;
    // Deux séances le même jour : un seul point, après la seconde.
    if (points.at(-1)?.date === s.date) points[points.length - 1] = { date: s.date, value };
    else points.push({ date: s.date, value });
  }
  return {
    points,
    variantIds: [...first.keys()],
    sessionCount,
    weekCount: weeks.size,
    enough: sessionCount >= INDEX_MIN_SESSIONS && weeks.size >= INDEX_MIN_WEEKS,
    assistedMethod: hasAssisted ? (weighIns.length > 0 ? 'bodyWeight' : 'inverseAid') : null,
  };
}

export interface WeekSets {
  /** Lundi de la semaine, « YYYY-MM-DD ». */
  start: string;
  /** Séries des exercices dont le groupe est le groupe principal. */
  direct: number;
  /** Séries des exercices où il n'est que groupe secondaire (comptées pour moitié dans `total`). */
  indirect: number;
  /** direct + indirect ÷ 2. */
  total: number;
}

export interface GroupSets {
  /**
   * De la semaine de la première séance terminée (tous groupes, salle ou maison) à la semaine en cours, les 12
   * dernières au plus ; semaines vides comprises.
   */
  weeks: WeekSets[];
  /** Semaines avec au moins une série sur ce groupe. */
  activeWeeks: number;
  enough: boolean;
  /**
   * Moyenne des totaux hebdomadaires (version 1.34.0), de la première semaine affichée où le groupe a des séries à la
   * dernière semaine terminée, semaines vides comprises : la semaine en cours n'y entre pas. Null sous le seuil.
   */
  average: number | null;
}

/**
 * Séries effectuées sur un groupe, semaine par semaine (lundi 0 h 00 – dimanche, heure locale), depuis la semaine de
 * la première séance terminée (version 1.34.0 : plus de semaines vides avant elle).
 */
export function groupWeeklySets(sessions: readonly Session[], exercises: readonly Exercise[], group: MuscleGroup, now: number, count = SETS_WEEKS): GroupSets {
  const byVariant = new Map<string, Exercise>();
  for (const e of exercises) for (const v of e.variants) byVariant.set(v.id, e);
  const current = weekStart(new Date(now));
  const weeks: (WeekSets & { from: number; to: number })[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const from = new Date(current);
    from.setDate(from.getDate() - 7 * i);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    weeks.push({ start: localDate(from.getTime()), direct: 0, indirect: 0, total: 0, from: from.getTime(), to: to.getTime() });
  }
  const done = sessions.filter((s) => s.state === 'done');
  // Pas de semaine avant celle de la première séance ; la semaine en cours reste toujours affichée.
  const first = done.length > 0 ? Math.min(current.getTime(), weekStart(new Date(Math.min(...done.map(sessionStartTime)))).getTime()) : current.getTime();
  weeks.splice(0, weeks.findIndex((w) => w.from >= first));
  for (const s of done) {
    const t = sessionStartTime(s);
    const week = weeks.find((w) => t >= w.from && t < w.to);
    if (!week) continue;
    for (const p of s.performances) {
      const e = byVariant.get(p.variantId);
      if (!e || p.partial) continue;
      if (viewGroup(e.primaryGroup) === group) week.direct += p.reps.length;
      else if (e.secondaryGroups.some((g) => viewGroup(g) === group)) week.indirect += p.reps.length;
    }
  }
  const result = weeks.map(({ start, direct, indirect }) => ({ start, direct, indirect, total: direct + indirect / 2 }));
  const activeWeeks = result.filter((w) => w.direct + w.indirect > 0).length;
  const enough = activeWeeks >= SETS_MIN_WEEKS;
  // La dernière semaine est la semaine en cours : elle n'entre dans la moyenne qu'une fois terminée.
  const finished = result.slice(Math.max(0, result.findIndex((w) => w.direct + w.indirect > 0)), -1);
  const average = enough && finished.length > 0 ? finished.reduce((a, w) => a + w.total, 0) / finished.length : null;
  return { weeks: result, activeWeeks, enough, average };
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** « Pas encore assez de données pour analyser ta progression : 3 séances sur 6 nécessaires. » */
export function notEnoughForIndex(index: GroupIndex): string {
  const missing = [
    ...(index.sessionCount < INDEX_MIN_SESSIONS ? [`${plural(index.sessionCount, 'séance')} sur ${INDEX_MIN_SESSIONS}`] : []),
    ...(index.weekCount < INDEX_MIN_WEEKS ? [`${plural(index.weekCount, 'semaine')} sur ${INDEX_MIN_WEEKS}`] : []),
  ];
  return `Pas encore assez de données pour analyser ta progression : ${missing.join(' et ')} nécessaires.`;
}

/** « Pas encore assez de données pour analyser ta progression : 2 semaines sur 3 nécessaires. » */
export function notEnoughForSets(sets: GroupSets): string {
  return `Pas encore assez de données pour analyser ta progression : ${plural(sets.activeWeeks, 'semaine')} sur ${SETS_MIN_WEEKS} nécessaires.`;
}
