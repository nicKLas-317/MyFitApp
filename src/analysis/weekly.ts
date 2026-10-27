/**
 * Récapitulatif hebdomadaire de l'accueil (§19.6) : quels groupes ont été travaillés cette semaine.
 * Calcul pur, jamais stocké : il est refait à partir des séances enregistrées à chaque affichage.
 * Aucun effet sur le moteur de progression. Le cardio n'entre dans aucun groupe : seul son total figure dans l'en-tête.
 * Une séance compte 1 pour un groupe travaillé en groupe principal, ½ pour un groupe seulement secondaire (travail indirect).
 * Une activité habituelle confirmée (badminton…) compte ½ pour chacun de ses groupes, comme un travail indirect.
 * Une séance à la maison (version 1.26.1) compte ½ pour le groupe principal de chacun de ses exercices (« +1 maison ») ;
 * ses groupes secondaires ne comptent pas.
 */
import type { Exercise, MuscleGroup, Session } from '../domain/types';
import { cardioMinutes, formatMinutes } from '../cardio/model';
import { activityEnd, activityStart, doneActivities, type ActivityRecord } from '../activities/model';

export type RecapColor = 'vert' | 'orange' | 'rouge';
export type Recency = 'today' | 'yesterday' | null;

export interface WeeklyRecapSettings {
  /** Groupes affichés, dans l'ordre de référence. */
  groups: MuscleGroup[];
  /** Nombre de séances à partir duquel un groupe est rouge. */
  redThreshold: number;
}

export const DEFAULT_RECAP_SETTINGS: WeeklyRecapSettings = {
  groups: ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes'],
  redThreshold: 2,
};

/** Sous-groupes des jambes : comptés pour « jambes » quand ils ne sont pas affichés eux-mêmes. */
const PARENT_GROUP: Partial<Record<MuscleGroup, MuscleGroup>> = {
  quadriceps: 'jambes',
  'ischio-jambiers': 'jambes',
  mollets: 'jambes',
  fessiers: 'jambes',
  adducteurs: 'jambes',
};

export interface RecapCell {
  group: MuscleGroup;
  /** Séances terminées de la semaine où le groupe a été travaillé en groupe principal (travail direct). */
  count: number;
  /** Séances de la semaine où le groupe n'a été travaillé qu'en groupe secondaire (travail indirect). */
  indirect: number;
  /** Séances à la maison de la semaine où le groupe est groupe principal d'un exercice ; absent s'il n'y en a pas. */
  home?: number;
  /**
   * Score de la semaine : 1 par séance directe, ½ par séance indirecte ou à la maison. Il détermine la couleur et le
   * tri : sous 1 (une seule séance indirecte ou à la maison), le groupe reste vert.
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

/** Lundi 0 h 00 de la semaine (heure locale) contenant `date`. */
export function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7; // lundi = 0 … dimanche = 6
  d.setDate(d.getDate() - offset);
  return d;
}

/** Début de la séance : heure de début si connue, sinon minuit (heure locale) de sa date. */
export function sessionStartTime(session: Session): number {
  if (session.startedAt !== null) return session.startedAt;
  const [y, m, d] = session.date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getTime();
}

/** Dernier moment où la séance a été pratiquée : fin si connue, sinon début. */
function sessionLastTime(session: Session): number {
  return session.endedAt ?? sessionStartTime(session);
}

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

function recencyOf(time: number, now: number): Recency {
  if (now - time >= 48 * 3600_000 || time > now) return null;
  if (dayKey(time) === dayKey(now)) return 'today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return dayKey(time) === dayKey(yesterday.getTime()) ? 'yesterday' : null;
}

const COLOR_RANK: Record<RecapColor, number> = { vert: 0, orange: 1, rouge: 2 };

export interface GroupWork {
  /** Séances de la période où le groupe est groupe principal d'au moins un exercice. */
  counts: Map<MuscleGroup, number>;
  /** Séances de la période où le groupe n'est que groupe secondaire, et activités habituelles qui le sollicitent. */
  indirects: Map<MuscleGroup, number>;
  /** Séances à la maison de la période où le groupe est groupe principal d'au moins un exercice (½ chacune). */
  homes: Map<MuscleGroup, number>;
  /** Dernier moment où le groupe a été travaillé, directement ou non, toutes séances terminées confondues. */
  last: Map<MuscleGroup, number>;
}

/**
 * Travail de chaque groupe affiché (§19.6), commun au récapitulatif et aux bilans de la semaine et du mois :
 * une séance compte 1 pour un groupe principal, ½ pour un groupe seulement secondaire, jamais plus de 1.
 * Une activité habituelle confirmée compte ½ (indirect) pour chacun de ses groupes, sans que le total du jour pour
 * un groupe dépasse 1 : après une séance où il était principal, elle n'ajoute rien ; après une séance où il n'était
 * que secondaire, elle ajoute ½. Elle compte toujours pour « hier » / « aujourd'hui ».
 * Une séance à la maison compte ½ (« maison ») pour le groupe principal de chacun de ses exercices, au plus ½ par
 * séance ; ses groupes secondaires ne comptent pas (ni score, ni « hier » / « aujourd'hui »).
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
  const recapGroup = (g: MuscleGroup | undefined): MuscleGroup | null => {
    if (!g) return null;
    if (shown.has(g)) return g;
    const parent = PARENT_GROUP[g];
    return parent && shown.has(parent) ? parent : null;
  };

  const counts = new Map<MuscleGroup, number>();
  const indirects = new Map<MuscleGroup, number>();
  const homes = new Map<MuscleGroup, number>();
  const last = new Map<MuscleGroup, number>();
  /** Travail compté par jour et par groupe (1 ou ½ par séance), pour plafonner les activités. */
  const daily = new Map<string, number>();
  const add = (day: string, g: MuscleGroup, value: number) => daily.set(`${day}|${g}`, (daily.get(`${day}|${g}`) ?? 0) + value);
  for (const s of sessions) {
    if (s.state !== 'done') continue;
    const counted = inPeriod(sessionStartTime(s));
    // Un groupe travaillé deux fois dans la même séance compte pour une ; principal dans un exercice et
    // secondaire dans un autre, il compte comme principal (jamais plus de 1 par séance).
    const direct = new Set<MuscleGroup>();
    const secondary = new Set<MuscleGroup>();
    for (const p of s.performances) {
      const e = exerciseOfVariant.get(p.variantId);
      if (!e) continue;
      const g = recapGroup(e.primaryGroup);
      if (g) direct.add(g);
      for (const sg of e.secondaryGroups) {
        const r = recapGroup(sg);
        if (r) secondary.add(r);
      }
    }
    for (const g of direct) secondary.delete(g);
    // À la maison : ½ pour les groupes principaux seulement.
    const home = s.location === 'maison';
    const tallies = home
      ? ([[direct, homes, 0.5]] as const)
      : ([[direct, counts, 1], [secondary, indirects, 0.5]] as const);
    for (const [found, tally, value] of tallies) {
      for (const g of found) {
        if (counted) {
          tally.set(g, (tally.get(g) ?? 0) + 1);
          add(dayKey(sessionStartTime(s)), g, value);
        }
        last.set(g, Math.max(last.get(g) ?? 0, sessionLastTime(s)));
      }
    }
  }
  for (const a of [...doneActivities(activities)].sort((x, y) => activityStart(x) - activityStart(y))) {
    const counted = inPeriod(activityStart(a));
    const day = dayKey(activityStart(a));
    const found = new Set(a.groups.map(recapGroup).filter((g): g is MuscleGroup => g !== null));
    for (const g of found) {
      if (counted && (daily.get(`${day}|${g}`) ?? 0) + 0.5 <= 1) {
        indirects.set(g, (indirects.get(g) ?? 0) + 1);
        add(day, g, 0.5);
      }
      last.set(g, Math.max(last.get(g) ?? 0, activityEnd(a)));
    }
  }
  return { counts, indirects, homes, last };
}

export function weeklyRecap(
  sessions: readonly Session[],
  exercises: readonly Exercise[],
  now: number,
  settings: WeeklyRecapSettings = DEFAULT_RECAP_SETTINGS,
  activities: readonly ActivityRecord[] = [],
): WeeklyRecap {
  const start = weekStart(new Date(now));
  const next = new Date(start);
  next.setDate(next.getDate() + 7);
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

  const cells: RecapCell[] = settings.groups.map((group) => {
    const count = counts.get(group) ?? 0;
    const indirect = indirects.get(group) ?? 0;
    const home = homes.get(group) ?? 0;
    const score = count + indirect / 2 + home / 2;
    const color: RecapColor = score < 1 ? 'vert' : score >= settings.redThreshold ? 'rouge' : 'orange';
    const time = last.get(group);
    return { group, count, indirect, ...(home > 0 ? { home } : {}), score, color, recency: time === undefined ? null : recencyOf(time, now) };
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

/**
 * Nombre de séances d'une case, sans fraction : « 1× », « 1× · +1 indirect », « +2 indirect », « +1 maison ».
 * Vide sans aucun travail cette semaine ; une case verte peut afficher « +1 indirect ».
 */
export function recapCountLabel(cell: RecapCell): string {
  return workParts(cell, '\u00a0').join(' · ');
}

/** Parties du travail d'un groupe : « 1× », « +1 indirect », « +1 maison » (récapitulatif et bilans). */
export function workParts(w: { count: number; indirect: number; home?: number }, space = ' '): string[] {
  return [
    ...(w.count > 0 ? [`${w.count}×`] : []),
    ...(w.indirect > 0 ? [`+${w.indirect}${space}indirect`] : []),
    ...(w.home ? [`+${w.home}${space}maison`] : []),
  ];
}

/** Réglage lu en base ou importé : valeurs inconnues écartées, défaut si invalide. */
export function sanitizeRecapSettings(value: unknown): WeeklyRecapSettings {
  if (typeof value !== 'object' || value === null) return DEFAULT_RECAP_SETTINGS;
  const v = value as Record<string, unknown>;
  const known: MuscleGroup[] = [
    'pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'quadriceps', 'ischio-jambiers', 'mollets', 'fessiers', 'adducteurs', 'abdominaux',
  ];
  const groups = Array.isArray(v.groups) ? known.filter((g) => (v.groups as unknown[]).includes(g)) : DEFAULT_RECAP_SETTINGS.groups;
  const t = v.redThreshold;
  const redThreshold = Number.isInteger(t) && (t as number) >= 2 && (t as number) <= 7 ? (t as number) : DEFAULT_RECAP_SETTINGS.redThreshold;
  return { groups: groups.length > 0 ? groups : DEFAULT_RECAP_SETTINGS.groups, redThreshold };
}

const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric' });
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'short' });

/**
 * « Semaine du lun. 12 au dim. 18 oct. : 2 séances » (mois répété si la semaine change de mois),
 * suivi de « · dont 1 maison », « · 1 activité » et « · 45 min de cardio » quand la semaine en contient.
 */
export function recapTitle(recap: WeeklyRecap): string {
  const { start, end, sessionCount, homeCount, activityCount, cardioMinutes: minutes } = recap;
  const sameMonth = start.getMonth() === end.getMonth();
  // Espaces insécables : « 2 séances » ou « dim. 18 oct. » ne sont jamais coupés en fin de ligne.
  const nb = '\u00a0';
  const from = `lun.${nb}${DAY.format(start)}${sameMonth ? '' : `${nb}${MONTH.format(start)}`}`;
  const to = `dim.${nb}${DAY.format(end)}${nb}${MONTH.format(end)}`;
  const cardio = minutes > 0 ? ` · ${formatMinutes(minutes).replace(/ /g, nb)}${nb}de cardio` : '';
  const activities = activityCount > 0 ? ` · ${activityCount}${nb}activité${activityCount > 1 ? 's' : ''}` : '';
  const home = homeCount ? ` · dont${nb}${homeCount}${nb}maison` : '';
  return `Semaine du ${from} au ${to}${nb}: ${sessionCount}${nb}séance${sessionCount > 1 ? 's' : ''}${home}${activities}${cardio}`;
}
