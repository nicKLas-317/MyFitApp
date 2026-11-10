/**
 * Récapitulatif hebdomadaire de l'accueil (§19.6) : quels groupes ont été travaillés cette semaine.
 * Calcul pur, jamais stocké : il est refait à partir des séances enregistrées à chaque affichage.
 * Aucun effet sur le moteur de progression.
 * Version 1.45.0 : le score d'un groupe est en séries, exactement comme le graphique « Séries par semaine » (§19.10) :
 * séries directes, plus les indirectes ÷ 2, salle et maison en entier ; plus 3 séries par activité confirmée
 * (badminton…) pour chacun de ses groupes, et 3 séries pour les jambes à partir de 45 min de cardio dans la semaine
 * (machines qui comptent pour les jambes : toutes sauf le rameur, par défaut). Ni plafond de la maison ni plafond par
 * jour. Vert sous 3 séries, orange jusqu'au seuil du rouge (10 par défaut, réglable de 6 à 20), rouge à partir du seuil.
 * Les séances, indirects et séries à la maison (`groupWork`) restent comptés pour le tableau des bilans.
 */
import type { CardioMachine, Exercise, MuscleGroup, Session } from '../domain/types';
import { localDate, sessionStartTime, weekBounds } from '../domain/calendar';
import { RECAP_GROUP_ORDER, recapGroupOf } from '../domain/muscleGroups';
import { countsAsWork } from '../domain/performance';
import { cardioMinutes, cardioOf, formatMinutes, machineCountsForLegs } from '../cardio/model';
import { formatDecimal, plural } from '../session/format';
import { activityEnd, activityStart, doneActivities, type ActivityRecord } from '../activities/model';

export type RecapColor = 'vert' | 'orange' | 'rouge';
export type Recency = 'today' | 'yesterday' | null;

export interface WeeklyRecapSettings {
  /** Groupes affichés, dans l'ordre de référence. */
  groups: MuscleGroup[];
  /** Séries de la semaine à partir desquelles un groupe est rouge (version 1.45.0 ; avant, `redThreshold` en séances). */
  redSets: number;
}

export const DEFAULT_RECAP_SETTINGS: WeeklyRecapSettings = {
  groups: ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes'],
  redSets: 10,
};

/** Seuil du rouge réglable, en séries (version 1.45.0). */
export const RED_SETS_MIN = 6;
export const RED_SETS_MAX = 20;
/** Séries à partir desquelles un groupe est orange (fixe) : un exercice de 3 séries. */
export const ORANGE_SETS = 3;
/** Séries comptées pour une activité confirmée, par groupe sollicité (version 1.45.0). */
export const ACTIVITY_SETS = 3;
/** Séries comptées pour les jambes quand le cardio des jambes atteint 45 min dans la semaine (version 1.45.0). */
export const LEG_CARDIO_SETS = 3;
/** Ancien seuil en séances (avant la version 1.45.0) converti en séries : 2 séances → 10 séries. */
export const SETS_PER_SESSION = 5;

export interface RecapCell {
  group: MuscleGroup;
  /** Séances terminées de la semaine où le groupe a été travaillé en groupe principal (travail direct). */
  count: number;
  /** Séances de la semaine où le groupe n'a été travaillé qu'en groupe secondaire (travail indirect). */
  indirect: number;
  /**
   * Séries validées à la maison dans la semaine sur des exercices dont le groupe est le groupe principal (version
   * 1.28.0) ; absent s'il n'y en a pas.
   */
  home?: number;
  /**
   * Jambes seulement (version 1.41.0) : minutes de cardio de la semaine qui comptent pour les jambes, quand elles
   * atteignent 45 min (« +62 min cardio ») ; absent sinon.
   */
  cardio?: number;
  /** Activités confirmées de la semaine qui sollicitent le groupe, dans l'ordre : « Badminton », « Futsal »… */
  activities: string[];
  /**
   * Score de la semaine, en séries (version 1.45.0) : séries comme le graphique « Séries par semaine » (directes, plus
   * indirectes ÷ 2, salle et maison en entier), plus 3 par activité confirmée et 3 pour 45 min de cardio (jambes). Il
   * détermine la couleur et le tri : vert sous 3, orange de 3 au seuil du rouge (exclu), rouge à partir du seuil.
   */
  score: number;
  color: RecapColor;
  /** Travaillé aujourd'hui ou hier (moins de 48 heures), directement ou indirectement. */
  recency: Recency;
}

export interface WeeklyRecap {
  /** Lundi 0 h 00 (heure locale) de la semaine en cours. */
  start: Date;
  /** Dimanche de la semaine en cours. */
  end: Date;
  /** Séances terminées de la semaine, y compris celles qui ne contiennent que du cardio. */
  sessionCount: number;
  /** Séances à la maison de la semaine (version 1.26.0), comprises dans `sessionCount` ; absent s'il n'y en a pas. */
  homeCount?: number;
  /** Activités habituelles confirmées de la semaine : ce ne sont pas des séances de salle. */
  activityCount: number;
  /** Total des blocs de cardio des séances de la semaine, en minutes. */
  cardioMinutes: number;
  cells: RecapCell[];
}

/** Dernier moment où la séance a été pratiquée : fin si connue, sinon début. */
function sessionLastTime(session: Session): number {
  return session.endedAt ?? sessionStartTime(session);
}

function recencyOf(time: number, now: number): Recency {
  if (now - time >= 48 * 3600_000 || time > now) return null;
  if (localDate(time) === localDate(now)) return 'today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return localDate(time) === localDate(yesterday.getTime()) ? 'yesterday' : null;
}

/** Cardio pour les jambes (version 1.41.0) : minutes de la semaine à atteindre (3 séries, version 1.45.0). */
export const LEG_CARDIO_MINUTES = 45;
/** Groupe qui reçoit le cardio. */
export const LEG_CARDIO_GROUP: MuscleGroup = 'jambes';

/**
 * Minutes de cardio qui comptent pour les jambes (version 1.41.0), dans les séances terminées dont le début est dans la
 * période, salle et maison confondues. Un bloc suit le réglage de sa machine dans la liste actuelle ; une machine
 * retirée de la liste depuis suit la règle par défaut (tout sauf le rameur).
 */
export function legCardioMinutes(sessions: readonly Session[], machines: readonly CardioMachine[], inPeriod: (time: number) => boolean): number {
  const byId = new Map(machines.map((m) => [m.id, m]));
  let total = 0;
  for (const s of sessions) {
    if (s.state !== 'done' || !inPeriod(sessionStartTime(s))) continue;
    for (const b of cardioOf(s)) if (machineCountsForLegs(byId.get(b.machineId) ?? { id: b.machineId })) total += b.minutes;
  }
  return total;
}

/** Minutes comptées pour les jambes sur une semaine : le total s'il atteint 45 min, sinon 0 (rien n'est affiché). */
export function legCardioWeek(sessions: readonly Session[], machines: readonly CardioMachine[], inWeek: (time: number) => boolean): number {
  const minutes = legCardioMinutes(sessions, machines, inWeek);
  return minutes >= LEG_CARDIO_MINUTES ? minutes : 0;
}

const COLOR_RANK: Record<RecapColor, number> = { vert: 0, orange: 1, rouge: 2 };

export interface GroupWork {
  /** Séances de la période où le groupe est groupe principal d'au moins un exercice. */
  counts: Map<MuscleGroup, number>;
  /** Séances de la période où le groupe n'est que groupe secondaire, et activités confirmées qui le sollicitent. */
  indirects: Map<MuscleGroup, number>;
  /** Séries validées à la maison dans la période, sur des exercices dont le groupe est le groupe principal. */
  homes: Map<MuscleGroup, number>;
  /** Dernier moment où le groupe a été travaillé, directement ou non, toutes séances terminées confondues. */
  last: Map<MuscleGroup, number>;
}

/**
 * Travail de chaque groupe affiché (§19.6), pour le tableau des bilans (colonnes Séances / Indirect / Maison) et la
 * mention « hier » / « aujourd'hui » du récapitulatif : séances à la salle où le groupe est principal ; séances à la
 * salle où il n'est que secondaire, et activités confirmées qui le sollicitent (indirect) ; séries validées à la maison
 * des exercices dont il est le groupe principal. Une séance compte une fois par groupe (principal l'emporte sur
 * secondaire). Version 1.45.0 : plus de plafond par jour (tout est compté en séries, `groupSeries`) ; les groupes
 * secondaires d'une séance à la maison n'entrent dans aucune colonne (leurs séries comptent pour moitié dans
 * `groupSeries`), mais comptent pour « hier » / « aujourd'hui ».
 * Un exercice sans aucune série (resté dans une séance terminée) ne compte jamais ; une performance partielle
 * importée (poids sans répétitions) compte.
 * Les sous-groupes des jambes comptent pour « jambes » quand ils ne sont pas affichés eux-mêmes.
 * `inPeriod` reçoit le début d'une séance ou d'une activité.
 */
export function groupWork(
  sessions: readonly Session[],
  exercises: readonly Exercise[],
  groups: readonly MuscleGroup[],
  inPeriod: (time: number) => boolean,
  activities: readonly ActivityRecord[] = [],
): GroupWork {
  const exerciseOfVariant = new Map<string, Exercise>();
  for (const e of exercises) for (const v of e.variants) exerciseOfVariant.set(v.id, e);
  const shown = new Set(groups);
  const recapGroup = (g: MuscleGroup | undefined) => recapGroupOf(g, shown);

  const counts = new Map<MuscleGroup, number>();
  const indirects = new Map<MuscleGroup, number>();
  const homes = new Map<MuscleGroup, number>();
  const last = new Map<MuscleGroup, number>();
  const seen = (g: MuscleGroup, time: number) => last.set(g, Math.max(last.get(g) ?? 0, time));
  for (const s of sessions) {
    if (s.state !== 'done') continue;
    const counted = inPeriod(sessionStartTime(s));
    const direct = new Set<MuscleGroup>();
    const secondary = new Set<MuscleGroup>();
    /** À la maison : séries validées par groupe principal. */
    const homeSets = new Map<MuscleGroup, number>();
    for (const p of s.performances) {
      const e = exerciseOfVariant.get(p.variantId);
      if (!e || !countsAsWork(p)) continue;
      const g = recapGroup(e.primaryGroup);
      if (g) {
        direct.add(g);
        homeSets.set(g, (homeSets.get(g) ?? 0) + p.reps.length);
      }
      for (const sg of e.secondaryGroups) {
        const r = recapGroup(sg);
        if (r) secondary.add(r);
      }
    }
    for (const g of direct) secondary.delete(g);
    if (s.location === 'maison') {
      for (const g of direct) {
        const sets = homeSets.get(g) ?? 0;
        if (counted && sets > 0) homes.set(g, (homes.get(g) ?? 0) + sets);
        seen(g, sessionLastTime(s));
      }
      // Version 1.45.0 : ses groupes secondaires comptent pour moitié dans les séries, donc pour « hier » aussi.
      for (const g of secondary) seen(g, sessionLastTime(s));
      continue;
    }
    for (const [found, tally] of [[direct, counts], [secondary, indirects]] as const) {
      for (const g of found) {
        if (counted) tally.set(g, (tally.get(g) ?? 0) + 1);
        seen(g, sessionLastTime(s));
      }
    }
  }
  for (const a of doneActivities(activities)) {
    const counted = inPeriod(activityStart(a));
    for (const g of new Set(a.groups.map(recapGroup).filter((x): x is MuscleGroup => x !== null))) {
      if (counted) indirects.set(g, (indirects.get(g) ?? 0) + 1);
      seen(g, activityEnd(a));
    }
  }
  return { counts, indirects, homes, last };
}

export interface GroupSeries {
  /** Séries comme le graphique « Séries par semaine » (§19.10) : directes + indirectes ÷ 2, salle et maison. */
  sets: Map<MuscleGroup, number>;
  /** Activités confirmées de la période qui sollicitent le groupe (noms, dans l'ordre chronologique). */
  activities: Map<MuscleGroup, string[]>;
}

/**
 * Séries de chaque groupe affiché sur une période (version 1.45.0), exactement comme le graphique « Séries par
 * semaine » (`groupWeeklySets`) : séries enregistrées des exercices dont le groupe est le groupe principal, plus la
 * moitié de celles où il n'est que secondaire, salle et maison en entier, sans les performances partielles. Plus les
 * activités confirmées de la période qui le sollicitent. Ni plafond par jour ni plafond de la maison.
 */
export function groupSeries(
  sessions: readonly Session[],
  exercises: readonly Exercise[],
  groups: readonly MuscleGroup[],
  inPeriod: (time: number) => boolean,
  activities: readonly ActivityRecord[] = [],
): GroupSeries {
  const exerciseOfVariant = new Map<string, Exercise>();
  for (const e of exercises) for (const v of e.variants) exerciseOfVariant.set(v.id, e);
  const shown = new Set(groups);
  const sets = new Map<MuscleGroup, number>();
  for (const s of sessions) {
    if (s.state !== 'done' || !inPeriod(sessionStartTime(s))) continue;
    for (const p of s.performances) {
      const e = exerciseOfVariant.get(p.variantId);
      if (!e || p.partial) continue;
      const primary = recapGroupOf(e.primaryGroup, shown);
      if (primary) sets.set(primary, (sets.get(primary) ?? 0) + p.reps.length);
      for (const g of new Set(e.secondaryGroups.map((sg) => recapGroupOf(sg, shown)))) {
        if (g && g !== primary) sets.set(g, (sets.get(g) ?? 0) + p.reps.length / 2);
      }
    }
  }
  const named = new Map<MuscleGroup, string[]>();
  for (const a of [...doneActivities(activities)].sort((x, y) => activityStart(x) - activityStart(y))) {
    if (!inPeriod(activityStart(a))) continue;
    for (const g of new Set(a.groups.map((x) => recapGroupOf(x, shown)))) if (g) named.set(g, [...(named.get(g) ?? []), a.name]);
  }
  return { sets, activities: named };
}

/**
 * Score d'un groupe, en séries (version 1.45.0, une seule définition) : séries (graphique « Séries par semaine »),
 * 3 par activité confirmée, 3 par semaine à 45 min de cardio ou plus (jambes). Récapitulatif (couleur, tri), bâtons des
 * bilans (§19.7) et séance pour compléter la semaine (§5.15).
 */
export function groupScore(parts: { sets: number; activities: number; cardioWeeks: number }): number {
  return parts.sets + ACTIVITY_SETS * parts.activities + LEG_CARDIO_SETS * parts.cardioWeeks;
}

/** Couleur d'un score en séries : vert sous 3, orange jusqu'au seuil du rouge (exclu), rouge à partir du seuil. */
export function recapColor(score: number, redSets: number): RecapColor {
  return score < ORANGE_SETS ? 'vert' : score >= redSets ? 'rouge' : 'orange';
}

export function weeklyRecap(
  sessions: readonly Session[],
  exercises: readonly Exercise[],
  now: number,
  settings: WeeklyRecapSettings = DEFAULT_RECAP_SETTINGS,
  activities: readonly ActivityRecord[] = [],
  machines: readonly CardioMachine[] = [],
): WeeklyRecap {
  const { start, next } = weekBounds(now);
  const end = new Date(next);
  end.setDate(end.getDate() - 1);

  const inWeek = (t: number) => t >= start.getTime() && t < next.getTime();
  let sessionCount = 0;
  let homeCount = 0;
  let cardio = 0;
  for (const s of sessions) {
    if (s.state !== 'done' || !inWeek(sessionStartTime(s))) continue;
    sessionCount++;
    if (s.location === 'maison') homeCount++;
    cardio += cardioMinutes(s);
  }
  const activityCount = doneActivities(activities).filter((a) => inWeek(activityStart(a))).length;
  const { counts, indirects, homes, last } = groupWork(sessions, exercises, settings.groups, inWeek, activities);
  const series = groupSeries(sessions, exercises, settings.groups, inWeek, activities);
  const legCardio = legCardioWeek(sessions, machines, inWeek);

  const cells: RecapCell[] = settings.groups.map((group) => {
    const count = counts.get(group) ?? 0;
    const indirect = indirects.get(group) ?? 0;
    const home = homes.get(group) ?? 0;
    const cardio = group === LEG_CARDIO_GROUP ? legCardio : 0;
    const named = series.activities.get(group) ?? [];
    // En séries (version 1.45.0) : la maison en entier, ni plafond de ½ ni plafond de 1 par jour.
    const score = groupScore({ sets: series.sets.get(group) ?? 0, activities: named.length, cardioWeeks: cardio > 0 ? 1 : 0 });
    const time = last.get(group);
    return {
      group,
      count,
      indirect,
      ...(home > 0 ? { home } : {}),
      ...(cardio > 0 ? { cardio } : {}),
      activities: named,
      score,
      color: recapColor(score, settings.redSets),
      recency: time === undefined ? null : recencyOf(time, now),
    };
  });
  // Vert en haut, puis orange, puis rouge ; à couleur égale, les groupes travaillés hier ou aujourd'hui en dernier,
  // puis score croissant (un vert avec de l'indirect après un vert sans rien).
  const order = new Map(settings.groups.map((g, i) => [g, i]));
  cells.sort(
    (a, b) =>
      COLOR_RANK[a.color] - COLOR_RANK[b.color] ||
      Number(a.recency !== null) - Number(b.recency !== null) ||
      a.score - b.score ||
      order.get(a.group)! - order.get(b.group)!,
  );
  return { start, end, sessionCount, ...(homeCount > 0 ? { homeCount } : {}), activityCount, cardioMinutes: cardio, cells };
}

/** « 15 séries », « 1,5 série » (singulier sous 2, comme l'alerte), « 0 série ». */
export function setsLabel(n: number, space = ' '): string {
  return `${formatDecimal(n)}${space}${n >= 2 ? 'séries' : 'série'}`;
}

/** « badminton », « badminton ×2 · futsal » : activités d'une case, en minuscules, par ordre d'apparition. */
export function activityMentions(names: readonly string[], space = ' '): string[] {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n.toLowerCase(), (counts.get(n.toLowerCase()) ?? 0) + 1);
  return [...counts].map(([n, c]) => (c > 1 ? `${n}${space}×${c}` : n));
}

/**
 * Texte d'une case (version 1.45.0) : le score en séries (« 15 séries »), puis les activités (« badminton ») et le
 * cardio des jambes (« +50 min cardio »), séparés par « · ». Vide sans aucun travail cette semaine.
 */
export function recapCountLabel(cell: RecapCell, withCardio = true): string {
  const nb = '\u00a0';
  if (cell.score === 0) return '';
  return [setsLabel(cell.score, nb), ...activityMentions(cell.activities, nb), ...(cell.cardio && withCardio ? [`+${cell.cardio}${nb}min${nb}cardio`] : [])].join(' · ');
}

/**
 * Parties du travail d'un groupe (bilans, texte du mail) : « 1 séance », « +1 indirect », « +5 séries maison »,
 * « +62 min cardio » (sur un mois, le bilan ajoute « sur 2 semaines »).
 */
export function workParts(w: { count: number; indirect: number; home?: number; cardio?: number }, space = ' '): string[] {
  return [
    ...(w.count > 0 ? [plural(w.count, 'séance', 'séances', space)] : []),
    ...(w.indirect > 0 ? [`+${w.indirect}${space}indirect`] : []),
    ...(w.home ? [`+${w.home}${space}${w.home > 1 ? 'séries' : 'série'}${space}maison`] : []),
    ...(w.cardio ? [`+${w.cardio}${space}min${space}cardio`] : []),
  ];
}

/** Réglage lu en base ou importé : valeurs inconnues écartées, défaut si invalide. */
export function sanitizeRecapSettings(value: unknown): WeeklyRecapSettings {
  if (typeof value !== 'object' || value === null) return DEFAULT_RECAP_SETTINGS;
  const v = value as Record<string, unknown>;
  const groups = Array.isArray(v.groups) ? RECAP_GROUP_ORDER.filter((g) => (v.groups as unknown[]).includes(g)) : DEFAULT_RECAP_SETTINGS.groups;
  const isInt = (x: unknown, min: number, max: number): x is number => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;
  // Version 1.45.0 : seuil en séries ; un ancien seuil en séances (2 à 7) est converti, 5 séries par séance.
  const redSets = isInt(v.redSets, RED_SETS_MIN, RED_SETS_MAX)
    ? v.redSets
    : isInt(v.redThreshold, 2, 7)
      ? Math.min(RED_SETS_MAX, v.redThreshold * SETS_PER_SESSION)
      : DEFAULT_RECAP_SETTINGS.redSets;
  return { groups: groups.length > 0 ? groups : DEFAULT_RECAP_SETTINGS.groups, redSets };
}

const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric' });
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'short' });

/**
 * Formes du titre, de la plus complète à la plus courte (version 1.41.1) : l'accueil prend une forme raccourcie
 * seulement quand « Démarrer » ne tiendrait pas au-dessus de la barre d'onglets.
 * - `full` : tout ;
 * - `noCardio` : sans « · 45 min de cardio » (le cardio des jambes reste visible dans la case Jambes) ;
 * - `short` : sans le cardio ni les noms de jours (« Semaine du 9 au 15 nov. ») ;
 * - `compact` (version 1.45.0) : le titre `short`, et la case Jambes sans « +50 min cardio » (ses séries le comptent
 *   toujours) : seulement si même `short` ne laisse pas « Démarrer » à l'écran (320 px, accueil le plus chargé).
 */
export type RecapTitleForm = 'full' | 'noCardio' | 'short' | 'compact';
export const RECAP_TITLE_FORMS: readonly RecapTitleForm[] = ['full', 'noCardio', 'short', 'compact'];

/**
 * « Semaine du lun. 12 au dim. 18 oct. : 2 séances » (mois répété si la semaine change de mois),
 * suivi de « · dont 1 maison », « · 1 activité » et « · 45 min de cardio » quand la semaine en contient.
 * Formes raccourcies : voir `RecapTitleForm`.
 */
export function recapTitle(recap: WeeklyRecap, form: RecapTitleForm = 'full'): string {
  const { start, end, sessionCount, homeCount, activityCount, cardioMinutes: minutes } = recap;
  const sameMonth = start.getMonth() === end.getMonth();
  // Espaces insécables : « 2 séances » ou « dim. 18 oct. » ne sont jamais coupés en fin de ligne.
  const nb = '\u00a0';
  const days = form !== 'short' && form !== 'compact';
  const from = `${days ? `lun.${nb}` : ''}${DAY.format(start)}${sameMonth ? '' : `${nb}${MONTH.format(start)}`}`;
  const to = `${days ? `dim.${nb}` : ''}${DAY.format(end)}${nb}${MONTH.format(end)}`;
  const cardio = minutes > 0 && form === 'full' ? ` · ${formatMinutes(minutes).replace(/ /g, nb)}${nb}de cardio` : '';
  const activities = activityCount > 0 ? ` · ${activityCount}${nb}activité${activityCount > 1 ? 's' : ''}` : '';
  const home = homeCount ? ` · dont${nb}${homeCount}${nb}maison` : '';
  return `Semaine du ${from} au ${to}${nb}: ${sessionCount}${nb}séance${sessionCount > 1 ? 's' : ''}${home}${activities}${cardio}`;
}
