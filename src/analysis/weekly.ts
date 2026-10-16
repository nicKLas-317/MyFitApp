/**
 * Récapitulatif hebdomadaire de l'accueil (§19.6) : quels groupes ont été travaillés cette semaine.
 * Calcul pur, jamais stocké : il est refait à partir des séances enregistrées à chaque affichage.
 * Aucun effet sur le moteur de progression. Le cardio n'entre dans aucun groupe : seul son total figure dans l'en-tête.
 */
import type { Exercise, MuscleGroup, Session } from '../domain/types';
import { cardioMinutes, formatMinutes } from '../cardio/model';

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
const PARENT_GROUP: Partial<Record<MuscleGroup, MuscleGroup>> = { quadriceps: 'jambes', 'ischio-jambiers': 'jambes' };

export interface RecapCell {
  group: MuscleGroup;
  /** Séances terminées de la semaine où le groupe a été travaillé (groupe principal uniquement). */
  count: number;
  color: RecapColor;
  /** Travaillé aujourd'hui ou hier (moins de 48 heures). */
  recency: Recency;
}

export interface WeeklyRecap {
  /** Lundi 0 h 00 (heure locale) de la semaine en cours. */
  start: Date;
  /** Dimanche de la semaine en cours. */
  end: Date;
  /** Séances terminées de la semaine, y compris celles qui ne contiennent que du cardio. */
  sessionCount: number;
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

export function weeklyRecap(
  sessions: readonly Session[],
  exercises: readonly Exercise[],
  now: number,
  settings: WeeklyRecapSettings = DEFAULT_RECAP_SETTINGS,
): WeeklyRecap {
  const start = weekStart(new Date(now));
  const next = new Date(start);
  next.setDate(next.getDate() + 7);
  const end = new Date(next);
  end.setDate(end.getDate() - 1);

  const groupOfVariant = new Map<string, MuscleGroup>();
  for (const e of exercises) for (const v of e.variants) groupOfVariant.set(v.id, e.primaryGroup);
  const shown = new Set(settings.groups);
  const recapGroup = (g: MuscleGroup | undefined): MuscleGroup | null => {
    if (!g) return null;
    if (shown.has(g)) return g;
    const parent = PARENT_GROUP[g];
    return parent && shown.has(parent) ? parent : null;
  };

  const counts = new Map<MuscleGroup, number>();
  const last = new Map<MuscleGroup, number>();
  let sessionCount = 0;
  let cardio = 0;
  for (const s of sessions) {
    if (s.state !== 'done') continue;
    const startTime = sessionStartTime(s);
    const inWeek = startTime >= start.getTime() && startTime < next.getTime();
    if (inWeek) {
      sessionCount++;
      cardio += cardioMinutes(s);
    }
    // Un groupe travaillé deux fois dans la même séance compte pour une.
    const groups = new Set(s.performances.map((p) => recapGroup(groupOfVariant.get(p.variantId))).filter((g): g is MuscleGroup => g !== null));
    for (const g of groups) {
      if (inWeek) counts.set(g, (counts.get(g) ?? 0) + 1);
      last.set(g, Math.max(last.get(g) ?? 0, sessionLastTime(s)));
    }
  }

  const cells: RecapCell[] = settings.groups.map((group) => {
    const count = counts.get(group) ?? 0;
    const color: RecapColor = count === 0 ? 'vert' : count >= settings.redThreshold ? 'rouge' : 'orange';
    const time = last.get(group);
    return { group, count, color, recency: time === undefined ? null : recencyOf(time, now) };
  });
  // Vert en haut, puis orange, puis rouge ; à couleur égale, les groupes travaillés hier ou aujourd'hui en dernier.
  const order = new Map(settings.groups.map((g, i) => [g, i]));
  cells.sort(
    (a, b) =>
      COLOR_RANK[a.color] - COLOR_RANK[b.color] ||
      Number(a.recency !== null) - Number(b.recency !== null) ||
      order.get(a.group)! - order.get(b.group)!,
  );
  return { start, end, sessionCount, cardioMinutes: cardio, cells };
}

/** Réglage lu en base ou importé : valeurs inconnues écartées, défaut si invalide. */
export function sanitizeRecapSettings(value: unknown): WeeklyRecapSettings {
  if (typeof value !== 'object' || value === null) return DEFAULT_RECAP_SETTINGS;
  const v = value as Record<string, unknown>;
  const known: MuscleGroup[] = ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'quadriceps', 'ischio-jambiers', 'abdominaux'];
  const groups = Array.isArray(v.groups) ? known.filter((g) => (v.groups as unknown[]).includes(g)) : DEFAULT_RECAP_SETTINGS.groups;
  const t = v.redThreshold;
  const redThreshold = Number.isInteger(t) && (t as number) >= 2 && (t as number) <= 7 ? (t as number) : DEFAULT_RECAP_SETTINGS.redThreshold;
  return { groups: groups.length > 0 ? groups : DEFAULT_RECAP_SETTINGS.groups, redThreshold };
}

const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric' });
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'short' });

/**
 * « Semaine du lun. 12 au dim. 18 oct. : 2 séances » (mois répété si la semaine change de mois),
 * suivi de « · 45 min de cardio » quand la semaine en contient.
 */
export function recapTitle(recap: WeeklyRecap): string {
  const { start, end, sessionCount, cardioMinutes: minutes } = recap;
  const sameMonth = start.getMonth() === end.getMonth();
  // Espaces insécables : « 2 séances » ou « dim. 18 oct. » ne sont jamais coupés en fin de ligne.
  const nb = '\u00a0';
  const from = `lun.${nb}${DAY.format(start)}${sameMonth ? '' : `${nb}${MONTH.format(start)}`}`;
  const to = `dim.${nb}${DAY.format(end)}${nb}${MONTH.format(end)}`;
  const cardio = minutes > 0 ? ` · ${formatMinutes(minutes).replace(/ /g, nb)}${nb}de cardio` : '';
  return `Semaine du ${from} au ${to}${nb}: ${sessionCount}${nb}séance${sessionCount > 1 ? 's' : ''}${cardio}`;
}
