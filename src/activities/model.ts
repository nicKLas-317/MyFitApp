/**
 * Activités habituelles hors salle (ex. badminton) : une habitude hebdomadaire (jour, heures, groupes sollicités)
 * que l'utilisateur confirme en un geste, « Oui » ou « Non », après l'heure de fin. Aucune saisie.
 * Activités ponctuelles (ex. futsal de temps en temps) : saisies à la main depuis l'accueil (« + Activité »), sans
 * question hebdomadaire ; elles comptent ensuite exactement comme une activité habituelle confirmée.
 * Une activité confirmée compte comme travail indirect au récapitulatif et figure dans l'historique et les bilans ;
 * ce n'est pas une séance de salle et elle n'a aucun effet sur le moteur de progression. Fonctions pures.
 */
import type { MuscleGroup } from '../domain/types';
import { slug, uniqueId } from '../library/edit';
import { normalizeName } from '../library/text';
import { formatDurationLong, isIsoDate, localDate } from '../session/format';

/** Jour de la semaine : 1 = lundi … 7 = dimanche. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Habit {
  /** Identifiant stable, indépendant du nom. */
  id: string;
  name: string;
  weekday: Weekday;
  /** Heure de début, « HH:MM ». */
  start: string;
  /** Heure de fin, « HH:MM », après le début (même jour). */
  end: string;
  groups: MuscleGroup[];
  /** Désactivée (vacances…) : plus aucune question. */
  enabled: boolean;
}

/**
 * Réponse à la question d'une habitude pour un jour donné. `done` : activité confirmée (« Oui ») ;
 * `declined` : « Non », ou activité supprimée ensuite de l'historique. Dans les deux cas, la question ne revient plus.
 * Nom, heures et groupes sont copiés de l'habitude au moment de la réponse : la modifier ensuite ne change pas l'historique.
 */
export interface ActivityRecord {
  /** `act-<habitude>-<date>` : une seule réponse par habitude et par jour. */
  id: string;
  habitId: string;
  date: string;
  name: string;
  start: string;
  end: string;
  groups: MuscleGroup[];
  status: 'done' | 'declined';
  answeredAt: number;
  /**
   * Activité ponctuelle saisie à la main : heures inconnues. Elle est rangée à 0 h 00 de sa date (comme une séance
   * importée sans heure) et `end` porte sa durée ; les heures ne sont jamais affichées.
   */
  oneOff?: true;
}

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: 'lundi',
  2: 'mardi',
  3: 'mercredi',
  4: 'jeudi',
  5: 'vendredi',
  6: 'samedi',
  7: 'dimanche',
};
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const satisfies readonly Weekday[];

/** Groupes proposés pour une habitude (sous-groupes des jambes inutiles ici). */
export const HABIT_GROUPS: readonly MuscleGroup[] = ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux'];

export const DEFAULT_HABITS: readonly Habit[] = [
  { id: 'badminton', name: 'Badminton', weekday: 1, start: '21:00', end: '22:30', groups: ['epaules', 'jambes'], enabled: true },
];

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutesOf = (time: string) => {
  const m = TIME.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export type HabitError = 'empty_name' | 'bad_time' | 'end_before_start' | 'duplicate_name';

export function habitErrors(habit: Habit, all: readonly Habit[] = [habit]): HabitError[] {
  const errors: HabitError[] = [];
  if (!habit.name.trim()) errors.push('empty_name');
  else if (all.some((h) => h.id !== habit.id && normalizeName(h.name) === normalizeName(habit.name))) errors.push('duplicate_name');
  const start = minutesOf(habit.start);
  const end = minutesOf(habit.end);
  if (start === null || end === null) errors.push('bad_time');
  else if (end <= start) errors.push('end_before_start');
  return errors;
}

/** Nouvelle habitude, à compléter (jour, heures, groupes) avant d'enregistrer. */
export function newHabit(name: string, existing: readonly Habit[]): Habit {
  return {
    id: uniqueId(`habitude-${slug(name)}`, new Set(existing.map((h) => h.id))),
    name: name.trim(),
    weekday: 1,
    start: '18:00',
    end: '19:00',
    groups: [],
    enabled: true,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isGroup = (g: unknown): g is MuscleGroup => HABIT_GROUPS.includes(g as MuscleGroup);

function readHabit(v: unknown): Habit | null {
  if (!isObj(v)) return null;
  const { id, name, weekday, start, end, groups, enabled } = v;
  if (typeof id !== 'string' || !id || typeof name !== 'string' || typeof start !== 'string' || typeof end !== 'string') return null;
  if (!WEEKDAYS.includes(weekday as Weekday) || !Array.isArray(groups) || typeof enabled !== 'boolean') return null;
  const habit: Habit = { id, name: name.trim(), weekday: weekday as Weekday, start, end, groups: HABIT_GROUPS.filter((g) => groups.includes(g)), enabled };
  return habitErrors(habit).length === 0 ? habit : null;
}

/**
 * Liste lue en base ou importée. Jamais enregistrée (installation, version antérieure) : la liste par défaut ;
 * une liste enregistrée, même vide, est gardée (une habitude supprimée n'est pas recréée). Entrées invalides écartées.
 */
export function sanitizeHabits(value: unknown): Habit[] {
  if (value === undefined) return DEFAULT_HABITS.map((h) => ({ ...h, groups: [...h.groups] }));
  if (!Array.isArray(value)) return DEFAULT_HABITS.map((h) => ({ ...h, groups: [...h.groups] }));
  const seen = new Set<string>();
  return value.map(readHabit).filter((h): h is Habit => h !== null && !seen.has(h.id) && Boolean(seen.add(h.id)));
}

/** Erreurs d'une réponse lue dans une sauvegarde ; liste vide = valide. */
export function activityErrors(v: unknown, path: string): string[] {
  if (!isObj(v)) return [`${path} : activité invalide.`];
  const errors: string[] = [];
  if (typeof v.id !== 'string' || !v.id) errors.push(`${path}.id manquant.`);
  if (typeof v.habitId !== 'string' || !v.habitId) errors.push(`${path}.habitId manquant.`);
  if (typeof v.date !== 'string' || !isIsoDate(v.date)) errors.push(`${path}.date invalide.`);
  if (typeof v.name !== 'string' || !v.name.trim()) errors.push(`${path}.name manquant.`);
  const start = typeof v.start === 'string' ? minutesOf(v.start) : null;
  const end = typeof v.end === 'string' ? minutesOf(v.end) : null;
  if (start === null || end === null || end <= start) errors.push(`${path} : heures invalides.`);
  if (!Array.isArray(v.groups) || !v.groups.every(isGroup)) errors.push(`${path}.groups invalide.`);
  if (v.status !== 'done' && v.status !== 'declined') errors.push(`${path}.status invalide.`);
  if (typeof v.answeredAt !== 'number' || !Number.isFinite(v.answeredAt)) errors.push(`${path}.answeredAt invalide.`);
  if (v.oneOff !== undefined && v.oneOff !== true) errors.push(`${path}.oneOff invalide.`);
  return errors;
}

/** Réponses lues en base : entrées invalides écartées. */
export function sanitizeActivities(value: unknown): ActivityRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v, i): v is ActivityRecord => activityErrors(v, String(i)).length === 0);
}

/** Moment local d'une date « YYYY-MM-DD » à l'heure « HH:MM ». */
function at(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const minutes = minutesOf(time) ?? 0;
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60).getTime();
}

export const activityStart = (a: Pick<ActivityRecord, 'date' | 'start'>) => at(a.date, a.start);
export const activityEnd = (a: Pick<ActivityRecord, 'date' | 'end'>) => at(a.date, a.end);
export const activityMinutes = (a: Pick<ActivityRecord, 'start' | 'end'>) => (minutesOf(a.end) ?? 0) - (minutesOf(a.start) ?? 0);

/** Activités confirmées (« Oui »). */
export function doneActivities(records: readonly ActivityRecord[]): ActivityRecord[] {
  return records.filter((a) => a.status === 'done');
}

export interface Occurrence {
  habit: Habit;
  /** Jour de l'habitude cette semaine, « YYYY-MM-DD ». */
  date: string;
}

/** Lundi 0 h 00 (heure locale) de la semaine de `now`. */
function mondayOf(now: number): Date {
  const d = new Date(now);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

const recordId = (habitId: string, date: string) => `act-${habitId}-${date}`;

/**
 * Questions à poser sur l'accueil : pour chaque habitude active, son jour de la semaine en cours, une fois l'heure
 * de fin passée et tant que personne n'a répondu. La question reste jusqu'au dimanche, puis disparaît sans rien
 * enregistrer (la semaine suivante ne pose que la question de son propre jour).
 */
export function pendingOccurrences(habits: readonly Habit[], records: readonly ActivityRecord[], now: number): Occurrence[] {
  const monday = mondayOf(now);
  const answered = new Set(records.map((r) => recordId(r.habitId, r.date)));
  return habits
    .filter((h) => h.enabled && habitErrors(h).length === 0)
    .map((habit) => {
      const day = new Date(monday);
      day.setDate(day.getDate() + habit.weekday - 1);
      return { habit, date: localDate(day.getTime()) };
    })
    .filter((o) => now >= at(o.date, o.habit.end) && !answered.has(recordId(o.habit.id, o.date)))
    .sort((a, b) => at(a.date, a.habit.end) - at(b.date, b.habit.end));
}

/** Réponse « Oui » (`done`) ou « Non » (`declined`) à une question. */
export function answer(occurrence: Occurrence, yes: boolean, now: number): ActivityRecord {
  const { habit, date } = occurrence;
  return {
    id: recordId(habit.id, date),
    habitId: habit.id,
    date,
    name: habit.name,
    start: habit.start,
    end: habit.end,
    groups: [...habit.groups],
    status: yes ? 'done' : 'declined',
    answeredAt: now,
  };
}

/** Activité connue, proposée par « + Activité » : nom, groupes et durée de la dernière fois (ou de l'habitude). */
export interface KnownActivity {
  name: string;
  groups: MuscleGroup[];
  minutes: number;
  /** Couverte par une habitude active (badminton) : déjà demandée chaque semaine, jamais présélectionnée. */
  habitual: boolean;
}

/**
 * Activités proposées à la saisie. D'abord celles qui ne sont pas couvertes par une habitude active (futsal, habitude
 * désactivée ou nom libre) : enregistrées, de la plus récente à la plus ancienne, puis jamais enregistrées ; ensuite les
 * habitudes actives, dans le même ordre. Préremplissage d'après la dernière fois, sinon d'après l'habitude.
 */
export function knownActivities(habits: readonly Habit[], records: readonly ActivityRecord[]): KnownActivity[] {
  const active = new Set(habits.filter((h) => h.enabled).map((h) => normalizeName(h.name)));
  const out = new Map<string, KnownActivity>();
  for (const a of [...doneActivities(records)].sort((x, y) => activityStart(y) - activityStart(x) || y.answeredAt - x.answeredAt)) {
    const key = normalizeName(a.name);
    if (!out.has(key)) out.set(key, { name: a.name, groups: [...a.groups], minutes: activityMinutes(a), habitual: active.has(key) });
  }
  for (const h of habits) {
    const key = normalizeName(h.name);
    if (!out.has(key) && h.name.trim()) out.set(key, { name: h.name.trim(), groups: [...h.groups], minutes: activityMinutes(h), habitual: active.has(key) });
  }
  const list = [...out.values()];
  return [...list.filter((a) => !a.habitual), ...list.filter((a) => a.habitual)];
}

/** Durée d'une activité ponctuelle : 1 à 600 minutes entières (comme un bloc de cardio). */
export const ONE_OFF_MAX_MINUTES = 600;

export type OneOffError = 'empty_name' | 'bad_minutes' | 'bad_date' | 'future_date' | 'already_recorded';

export interface OneOffInput {
  name: string;
  date: string;
  minutes: number;
  groups: readonly MuscleGroup[];
}

const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Activité ponctuelle à enregistrer, ou ses erreurs. Une activité du même nom qu'une habitude lui est rattachée
 * (`act-<habitude>-<date>`) : saisie le jour de l'habitude, elle répond à sa question, sans doublon. Une activité déjà
 * confirmée ce jour-là sous ce nom est refusée ; une réponse « Non » est remplacée.
 */
export function oneOffActivity(
  input: OneOffInput,
  habits: readonly Habit[],
  records: readonly ActivityRecord[],
  now: number,
): { record: ActivityRecord } | { errors: OneOffError[] } {
  const name = input.name.trim();
  const errors: OneOffError[] = [];
  if (!name) errors.push('empty_name');
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > ONE_OFF_MAX_MINUTES) errors.push('bad_minutes');
  if (!isIsoDate(input.date)) errors.push('bad_date');
  else if (input.date > localDate(now)) errors.push('future_date');
  const habit = habits.find((h) => normalizeName(h.name) === normalizeName(name));
  const habitId = habit?.id ?? `ponctuelle-${slug(name)}`;
  const id = recordId(habitId, input.date);
  if (name && records.some((a) => a.status === 'done' && a.date === input.date && (a.id === id || normalizeName(a.name) === normalizeName(name)))) {
    errors.push('already_recorded');
  }
  if (errors.length > 0) return { errors };
  return {
    record: {
      id,
      habitId,
      date: input.date,
      name,
      start: '00:00',
      end: clock(input.minutes),
      groups: HABIT_GROUPS.filter((g) => input.groups.includes(g)),
      status: 'done',
      answeredAt: now,
      oneOff: true,
    },
  };
}

/** « 21 h », « 22 h 30 ». */
export function formatClock(time: string): string {
  const minutes = minutesOf(time) ?? 0;
  const m = minutes % 60;
  return `${Math.floor(minutes / 60)} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
}

function partOfDay(time: string): string {
  const minutes = minutesOf(time) ?? 0;
  return minutes < 12 * 60 ? 'matin' : minutes < 18 * 60 ? 'après-midi' : 'soir';
}

/** « Badminton lundi soir (21 h – 22 h 30) ? » */
export function questionText(occurrence: Occurrence): string {
  const { habit } = occurrence;
  return `${habit.name} ${WEEKDAY_LABELS[habit.weekday]} ${partOfDay(habit.start)} (${formatClock(habit.start)} – ${formatClock(habit.end)}) ?`;
}

/** « Badminton · 1 h 30 ». */
export function activityLabel(a: ActivityRecord): string {
  return `${a.name} · ${formatDurationLong(activityMinutes(a) * 60_000)}`;
}

/**
 * Réponses d'une sauvegarde à ajouter à celles de l'appareil (fusion) : une réponse déjà présente (même habitude et
 * même jour) garde la version de l'appareil ; une activité confirmée du même nom le même jour n'est pas doublée.
 */
export function mergeActivities(local: readonly ActivityRecord[], imported: readonly ActivityRecord[]): ActivityRecord[] {
  const ids = new Set(local.map((a) => a.id));
  const doneDays = new Set(doneActivities(local).map((a) => `${a.date}|${normalizeName(a.name)}`));
  const added = imported.filter((a) => {
    if (ids.has(a.id)) return false;
    if (a.status === 'done' && doneDays.has(`${a.date}|${normalizeName(a.name)}`)) return false;
    ids.add(a.id);
    if (a.status === 'done') doneDays.add(`${a.date}|${normalizeName(a.name)}`);
    return true;
  });
  return [...local, ...added];
}
