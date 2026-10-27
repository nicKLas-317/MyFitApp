/**
 * Bilans de la semaine et du mois (§19.7) : calcul pur, refait à chaque affichage à partir des séances, des
 * évaluations du moteur (seule source de vérité), des activités habituelles confirmées et des pesées. Aucun score ni conseil inventé ; aucun effet
 * sur le moteur de progression. Le texte du mail est du texte brut, sans HTML.
 */
import type { WeighIn } from '../body/model';
import { activityMinutes, activityStart, doneActivities, type ActivityRecord } from '../activities/model';
import { cardioOf, formatMinutes } from '../cardio/model';
import type { Exercise, MuscleGroup, Session } from '../domain/types';
import { evaluationTrack, HOME_SUFFIX, resolveConfig, type EngineSettings, type Evaluation, type Palier } from '../engine';
import { MUSCLE_GROUP_LABELS } from '../library/seed';
import { formatDurationLong, formatKg, localDate } from '../session/format';
import { isPalierValidated } from './progress';
import { computeRecords, formatRecord, type RecordBreak } from './records';
import { groupWork, sessionStartTime, weekStart, workParts } from './weekly';

export type ReportKind = 'week' | 'month';

/** Période d'un bilan : semaine du lundi 0 h 00 au dimanche, ou mois calendaire, heure locale. */
export interface ReportPeriod {
  kind: ReportKind;
  /** Premier jour, 0 h 00. */
  start: Date;
  /** Premier jour de la période suivante, 0 h 00 (borne exclue). */
  next: Date;
}

function makePeriod(kind: ReportKind, start: Date): ReportPeriod {
  const next = new Date(start);
  if (kind === 'week') next.setDate(next.getDate() + 7);
  else next.setMonth(next.getMonth() + 1);
  return { kind, start, next };
}

/** Période contenant l'instant `ts`. */
export function periodContaining(kind: ReportKind, ts: number): ReportPeriod {
  const d = new Date(ts);
  return makePeriod(kind, kind === 'week' ? weekStart(d) : new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Période décalée de `delta` semaines ou mois. */
export function shiftPeriod(period: ReportPeriod, delta: number): ReportPeriod {
  const start = new Date(period.start);
  if (period.kind === 'week') start.setDate(start.getDate() + 7 * delta);
  else start.setMonth(start.getMonth() + delta, 1);
  return makePeriod(period.kind, start);
}

/** Clé stable et triable : lundi « 2026-10-19 » pour une semaine, « 2026-10 » pour un mois. */
export function periodKey(period: ReportPeriod): string {
  const day = localDate(period.start.getTime());
  return period.kind === 'week' ? day : day.slice(0, 7);
}

export function parsePeriodKey(kind: ReportKind, key: string): ReportPeriod | null {
  const m = kind === 'week' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(key) : /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const start = new Date(Number(m[1]), Number(m[2]) - 1, kind === 'week' ? Number(m[3]) : 1);
  const period = periodContaining(kind, start.getTime());
  return periodKey(period) === key ? period : null;
}

/** Dernier jour de la période. */
export function periodLastDay(period: ReportPeriod): Date {
  const d = new Date(period.next);
  d.setDate(d.getDate() - 1);
  return d;
}

export function containsTime(period: Pick<ReportPeriod, 'start' | 'next'>, ts: number): boolean {
  return ts >= period.start.getTime() && ts < period.next.getTime();
}

const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric' });
const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const WEEKDAY_DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

/** « du 19 au 25 oct. 2026 », « du 28 sept. au 4 oct. 2026 », « du 29 déc. 2025 au 4 janv. 2026 ». */
function weekRange(period: ReportPeriod): string {
  const { start } = period;
  const end = periodLastDay(period);
  const from =
    start.getFullYear() !== end.getFullYear() ? DAY_MONTH_YEAR.format(start) : start.getMonth() !== end.getMonth() ? DAY_MONTH.format(start) : DAY.format(start);
  return `du ${from} au ${DAY_MONTH_YEAR.format(end)}`;
}

/** « Semaine du 19 au 25 oct. 2026 », « Octobre 2026 ». */
export function periodTitle(period: ReportPeriod): string {
  if (period.kind === 'week') return `Semaine ${weekRange(period)}`;
  const month = MONTH_YEAR.format(period.start);
  return month.charAt(0).toUpperCase() + month.slice(1);
}

/** Objet du mail : « MyFitApp — Bilan semaine du 19 au 25 oct. 2026 », « MyFitApp — Bilan octobre 2026 ». */
export function mailSubject(period: ReportPeriod): string {
  return `MyFitApp — Bilan ${period.kind === 'week' ? `semaine ${weekRange(period)}` : MONTH_YEAR.format(period.start)}`;
}

export interface PeriodTotals {
  sessionCount: number;
  /**
   * Séances à la maison (version 1.26.0), comprises dans `sessionCount` ; absent s'il n'y en a pas. Leur durée n'a pas
   * d'importance : elles n'entrent pas dans la durée en salle et ne sont jamais « sans durée ».
   */
  homeCount?: number;
  /** Durée totale des séances à la salle dont le début et la fin sont connus. */
  durationMs: number;
  /** Séances à la salle sans heure de début ou de fin (import) : durée inconnue, jamais comptée pour 0 min. */
  unknownDuration: number;
}

/**
 * Intervalle de comparaison : la période précédente entière pour une période terminée ; pour une période en cours, la
 * même portion de la précédente (du lundi au même jour de la semaine, du 1er au même jour du mois).
 */
export interface ComparedSpan {
  start: Date;
  /** Lendemain du dernier jour compris, 0 h 00 (borne exclue). */
  next: Date;
  /** Seulement une portion de la période précédente. */
  partial: boolean;
}

/** Portion de la période précédente à comparer avec `period`, arrêtée au jour `asOf`. */
export function comparedSpan(period: ReportPeriod, asOf: Date, inProgress: boolean): ComparedSpan {
  const previous = shiftPeriod(period, -1);
  if (!inProgress) return { start: previous.start, next: previous.next, partial: false };
  // Jours entiers écoulés depuis le premier jour de la période, jour de `asOf` compris.
  const day = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const days = Math.max(1, Math.round((day.getTime() - period.start.getTime()) / 86_400_000) + 1);
  const start = previous.start;
  // Sans dépasser la fin de la période précédente : le 31 mars est comparé à tout février.
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days);
  const next = end < previous.next ? end : previous.next;
  return { start: previous.start, next, partial: next.getTime() < previous.next.getTime() };
}

export interface ReportProgression {
  variantId: string;
  date: string;
  /** +1 répétition, ou poids supérieur (moins d'aide pour un exercice assisté). */
  kind: 'reps_up' | 'weight_up';
  sets: number;
  /** Palier validé. */
  from: Palier;
  /** Nouvelle cible de répétitions. */
  toReps: number;
  assisted: boolean;
  /** Exercice en secondes (gainage) : cibles en secondes. */
  seconds?: boolean;
  /** Suivi de la maison (version 1.26.0). */
  home?: true;
}

export interface ReportDecrease {
  variantId: string;
  date: string;
  weightKg: number;
  reds: number;
  assisted: boolean;
  /** Exercice au poids du corps : la baisse recommandée est « cible −1 rép. » (« cible −5 s » en secondes). */
  bodyweight?: boolean;
  seconds?: boolean;
  home?: true;
}

export interface ReportReds {
  variantId: string;
  /** Séances rouges pendant la période. */
  count: number;
  /** Séances rouges de suite au même poids après la dernière séance de la période (série en cours, éventuellement commencée avant). */
  streak: number;
  weightKg: number;
  assisted: boolean;
  home?: true;
}

export interface PeriodReport {
  period: ReportPeriod;
  /** La période n'est pas terminée. */
  inProgress: boolean;
  /** Jour de calcul du bilan (période en cours). */
  asOf: Date;
  totals: PeriodTotals;
  /** Totaux de l'intervalle de comparaison (`compared`). */
  previous: PeriodTotals;
  compared: ComparedSpan;
  /** Minutes de cardio par machine, de la plus longue à la plus courte. */
  cardio: { machine: string; minutes: number }[];
  /** Activités habituelles confirmées (hors salle) par nom : nombre et durée totale, dans l'ordre de la première. */
  activities: { name: string; count: number; minutes: number }[];
  /** Groupes affichés au récapitulatif, dans leur ordre : séances directes, indirectes et à la maison (absent sans). */
  groups: { group: MuscleGroup; count: number; indirect: number; home?: number }[];
  progressions: ReportProgression[];
  /** Records battus pendant la période : le dernier de chaque exercice-variante, dans l'ordre chronologique. */
  records: RecordBreak[];
  /** Exercices avec au moins une séance rouge pendant la période. */
  reds: ReportReds[];
  /** Exercices passés en « poids inférieur » (ou « plus d'aide ») pendant la période. */
  decreases: ReportDecrease[];
  /** Première et dernière pesées de la période (une seule si une seule pesée, aucune sinon). */
  weighIns: WeighIn[];
}

export interface ReportInput {
  sessions: readonly Session[];
  exercises: readonly Exercise[];
  evaluations: readonly Evaluation[];
  settings: EngineSettings;
  /** Groupes affichés au récapitulatif hebdomadaire (§19.6). */
  groups: readonly MuscleGroup[];
  weighIns: readonly WeighIn[];
  /** Activités habituelles (réponses) : seules les confirmées comptent. */
  activities?: readonly ActivityRecord[];
  now: number;
}

const inPeriod = (period: Pick<ReportPeriod, 'start' | 'next'>) => (s: Session) => s.state === 'done' && containsTime(period, sessionStartTime(s));

function totalsOf(sessions: readonly Session[], period: Pick<ReportPeriod, 'start' | 'next'>): PeriodTotals {
  const list = sessions.filter(inPeriod(period));
  let durationMs = 0;
  let unknownDuration = 0;
  let homeCount = 0;
  for (const s of list) {
    // À la maison, la durée n'a pas d'importance : ni durée en salle, ni « sans durée ».
    if (s.location === 'maison') homeCount++;
    else if (s.startedAt !== null && s.endedAt !== null) durationMs += Math.max(0, s.endedAt - s.startedAt);
    else unknownDuration++;
  }
  return { sessionCount: list.length, ...(homeCount > 0 ? { homeCount } : {}), durationMs, unknownDuration };
}

export function buildReport(period: ReportPeriod, input: ReportInput): PeriodReport {
  const { sessions, exercises, evaluations, settings, weighIns, now } = input;
  const belongs = inPeriod(period);
  const list = sessions.filter(belongs);

  const cardio = new Map<string, number>();
  for (const s of list) for (const b of cardioOf(s)) cardio.set(b.machine, (cardio.get(b.machine) ?? 0) + b.minutes);

  const done = doneActivities(input.activities ?? []);
  const work = groupWork(sessions, exercises, input.groups, (t) => containsTime(period, t), done);
  const activities = new Map<string, { name: string; count: number; minutes: number }>();
  for (const a of [...done].filter((x) => containsTime(period, activityStart(x))).sort((x, y) => activityStart(x) - activityStart(y))) {
    const entry = activities.get(a.name) ?? { name: a.name, count: 0, minutes: 0 };
    activities.set(a.name, { ...entry, count: entry.count + 1, minutes: entry.minutes + activityMinutes(a) });
  }
  const groups = input.groups.map((group) => {
    const home = work.homes.get(group) ?? 0;
    return { group, count: work.counts.get(group) ?? 0, indirect: work.indirects.get(group) ?? 0, ...(home > 0 ? { home } : {}) };
  });

  // Évaluations du moteur, dans l'ordre du rejeu : paliers validés, rouges et passages en « poids inférieur ».
  const dateOf = new Map(list.map((s) => [s.id, s.date]));
  const progressions: ReportProgression[] = [];
  const reds = new Map<string, ReportReds>();
  const decreases: ReportDecrease[] = [];
  const decreasing = new Set<string>();
  for (const ev of evaluations) {
    // Par suivi : la salle et la maison d'un exercice à charge sont rapportées séparément (version 1.26.0).
    const track = evaluationTrack(ev);
    const home = ev.home ? { home: ev.home } : {};
    const wasDecreasing = decreasing.has(track);
    // Baisse recommandée : poids inférieur, ou cible −1 pour un exercice au poids du corps.
    const lowering = ev.recommendation.kind === 'weight_down' || ev.recommendation.kind === 'reps_down';
    if (lowering) decreasing.add(track);
    else decreasing.delete(track);
    const date = dateOf.get(ev.sessionId);
    if (date === undefined) continue;
    const { assisted, bodyweight, seconds } = resolveConfig(settings, track);
    if (isPalierValidated(ev) && (ev.recommendation.kind === 'reps_up' || ev.recommendation.kind === 'weight_up')) {
      progressions.push({
        variantId: ev.variantId,
        date,
        kind: ev.recommendation.kind,
        sets: ev.recommendation.plannedSets,
        from: ev.palier,
        toReps: ev.recommendation.targetReps,
        assisted,
        ...(seconds ? { seconds } : {}),
        ...home,
      });
    }
    const red = reds.get(track);
    if (ev.status === 'rouge' || red) {
      // Série de rouges en cours à la dernière séance de la période.
      reds.set(track, {
        variantId: ev.variantId,
        count: (red?.count ?? 0) + (ev.status === 'rouge' ? 1 : 0),
        streak: ev.redStreak,
        weightKg: ev.palier.weightKg,
        assisted,
        ...home,
      });
    }
    if (lowering && !wasDecreasing) {
      decreases.push({
        variantId: ev.variantId,
        date,
        weightKg: ev.palier.weightKg,
        reds: ev.redStreak,
        assisted,
        ...(bodyweight ? { bodyweight } : {}),
        ...(seconds ? { seconds } : {}),
        ...home,
      });
    }
  }

  // Records battus pendant la période (jamais une toute première performance) : le dernier par exercice.
  const lastBreak = new Map<string, RecordBreak>();
  for (const b of computeRecords(sessions, settings).breaks) {
    if (!dateOf.has(b.sessionId)) continue;
    const track = b.home ? `${b.variantId}${HOME_SUFFIX}` : b.variantId;
    lastBreak.delete(track);
    lastBreak.set(track, b);
  }

  const first = localDate(period.start.getTime());
  const last = localDate(periodLastDay(period).getTime());
  const weighed = [...weighIns].filter((w) => w.date >= first && w.date <= last).sort((a, b) => (a.date < b.date ? -1 : 1));

  const inProgress = now < period.next.getTime();
  const asOf = new Date(Math.min(now, period.next.getTime() - 1));
  const compared = comparedSpan(period, asOf, inProgress);
  return {
    period,
    inProgress,
    asOf,
    totals: totalsOf(sessions, period),
    previous: totalsOf(sessions, compared),
    compared,
    cardio: [...cardio].map(([machine, minutes]) => ({ machine, minutes })).sort((a, b) => b.minutes - a.minutes),
    activities: [...activities.values()],
    groups,
    progressions,
    records: [...lastBreak.values()],
    reds: [...reds.values()],
    decreases,
    weighIns: weighed.length > 1 ? [weighed[0]!, weighed[weighed.length - 1]!] : weighed,
  };
}

/** Morceau d'une ligne : texte simple, ou élément important mis en évidence à l'écran (le mail reste en texte brut). */
export type ReportPart = string | { em: string };
export type ReportLine = ReportPart[];

export interface ReportSection {
  title: string;
  lines: ReportLine[];
}

const em = (text: string): ReportPart => ({ em: text });

/** Texte d'une ligne, sans mise en évidence. */
export function lineText(line: ReportLine): string {
  return line.map((p) => (typeof p === 'string' ? p : p.em)).join('');
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
const shortDay = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return DAY_MONTH.format(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1));
};
/** « à 20 kg », « avec 30 kg d’aide », précédé d'une espace ; rien pour un exercice au poids du corps (0). */
const load = (kg: number, assisted: boolean) => (kg === 0 ? '' : assisted ? ` avec ${formatKg(kg)} d’aide` : ` à ${formatKg(kg)}`);

/**
 * Ce à quoi la période est comparée : « à la semaine précédente », ou pour une période en cours la même portion de la
 * précédente, « à lun.–ven. de la semaine dernière », « au 1er–23 du mois dernier ».
 */
function comparedTo(report: PeriodReport): { with: string; same: string } {
  const { compared } = report;
  const week = report.period.kind === 'week';
  if (!compared.partial) return week ? { with: 'à la semaine précédente', same: 'la semaine précédente' } : { with: 'au mois précédent', same: 'le mois précédent' };
  const last = new Date(compared.next);
  last.setDate(last.getDate() - 1);
  if (week) {
    const days = last.getTime() === compared.start.getTime() ? WEEKDAY.format(last) : `${WEEKDAY.format(compared.start)}–${WEEKDAY.format(last)}`;
    return { with: `à ${days} de la semaine dernière`, same: `${days} de la semaine dernière` };
  }
  const days = last.getDate() === 1 ? '1er' : `1er–${last.getDate()}`;
  return { with: `au ${days} du mois dernier`, same: `le ${days} du mois dernier` };
}

/** « +1 », « −2 », ou null à égalité. */
function signed(diff: number, format: (n: number) => string): string | null {
  if (diff === 0) return null;
  return `${diff > 0 ? '+' : '−'}${format(Math.abs(diff))}`;
}

/** Sections du bilan, communes à l'écran et au texte du mail. `name` donne le nom affiché d'un exercice-variante. */
export function reportSections(report: PeriodReport, variantName: (variantId: string) => string): ReportSection[] {
  const { totals, previous } = report;
  // Nom d'un suivi : « Curl biceps haltères (maison) » pour le suivi de la maison d'un exercice à charge.
  const name = (variantId: string, home?: true) => `${variantName(variantId)}${home ? ' (maison)' : ''}`;
  const week = report.period.kind === 'week';
  const target = comparedTo(report);
  const compare = (diff: string | null) => (diff ? `${diff} par rapport ${target.with}` : `autant que ${target.same}`);

  const atHome = totals.homeCount ? ` (dont ${totals.homeCount} à la maison)` : '';
  const sessionsLines: ReportLine[] = [[`${plural(totals.sessionCount, 'séance')}${atHome}, `, em(compare(signed(totals.sessionCount - previous.sessionCount, String)))]];
  // Durée en salle : séances à la salle seulement (la durée à la maison n'a pas d'importance).
  const gym = totals.sessionCount - (totals.homeCount ?? 0);
  if (gym > 0 || previous.sessionCount - (previous.homeCount ?? 0) > 0) {
    // Séances à heures connues seulement ; une séance importée sans heure ne compte jamais pour 0 min.
    const known = gym - totals.unknownDuration;
    const unknown = totals.unknownDuration > 0 ? ` (${plural(totals.unknownDuration, 'séance sans durée', 'séances sans durée')})` : '';
    const line: ReportLine = [`Durée en salle : ${known > 0 || gym === 0 ? formatDurationLong(totals.durationMs) : 'inconnue'}${unknown}`];
    // Comparaison seulement si toutes les durées des deux périodes sont connues.
    if (totals.unknownDuration === 0 && previous.unknownDuration === 0) {
      line.push(', ', em(compare(signed(Math.round((totals.durationMs - previous.durationMs) / 60_000), formatMinutes))));
    }
    sessionsLines.push(line);
  }
  if (totals.sessionCount > 0) {
    const minutes = report.cardio.reduce((n, c) => n + c.minutes, 0);
    sessionsLines.push(
      minutes > 0 ? [`Cardio : ${formatMinutes(minutes)} (${report.cardio.map((c) => `${c.machine} ${formatMinutes(c.minutes)}`).join(', ')})`] : ['Cardio : aucun'],
    );
  }
  // Activités hors salle : pas des séances, listées à part (« Badminton ×4, 6 h 00 »).
  if (report.activities.length > 0) {
    sessionsLines.push([`Activités : ${report.activities.map((a) => `${a.name} ×${a.count}, ${formatMinutes(a.minutes)}`).join(' ; ')}`]);
  }
  const sections: ReportSection[] = [{ title: 'Séances', lines: sessionsLines }];

  if (totals.sessionCount > 0 || report.activities.length > 0) {
    const worked = report.groups.filter((g) => g.count > 0 || g.indirect > 0 || !!g.home);
    const idle = report.groups.filter((g) => g.count === 0 && g.indirect === 0 && !g.home);
    const lines: ReportLine[] = worked.map((g) => [`${MUSCLE_GROUP_LABELS[g.group]} : ${workParts(g).join(' · ')}`]);
    if (idle.length > 0) lines.push([em(`Non travaillés : ${idle.map((g) => MUSCLE_GROUP_LABELS[g.group]).join(', ')}`)]);
    sections.push({ title: 'Groupes travaillés', lines });
  }

  if (totals.sessionCount > 0) {
    sections.push({
      title: 'Progressions',
      lines:
        report.progressions.length > 0
          ? report.progressions.map((p): ReportLine => {
              const unit = p.seconds ? ' s' : '';
              const from = `${p.sets}×${p.from.targetReps}${unit}`;
              const change: ReportPart[] =
                p.kind === 'reps_up'
                  ? [em(`${from} → ${p.sets}×${p.toReps}${unit}${load(p.from.weightKg, p.assisted)}`)]
                  : [`${from}${load(p.from.weightKg, p.assisted)} validé → `, em(`${p.assisted ? 'moins d’aide' : 'poids supérieur'}, ${p.sets}×${p.toReps}`)];
              return [`${name(p.variantId, p.home)} : `, ...change, ` (${shortDay(p.date)})`];
            })
          : [['Aucun palier validé.']],
    });

    sections.push({
      title: 'Records',
      lines: report.records.length > 0 ? report.records.map((r): ReportLine => [`👑 ${name(r.variantId, r.home)} : `, em(formatRecord(r))]) : [['Aucun nouveau record.']],
    });

    // Une ligne par exercice : son passage en « poids inférieur » s'il a eu lieu pendant la période, sinon ses séances
    // rouges de la période, avec la série en cours quand elle a commencé avant.
    const inThisPeriod = week ? 'cette semaine' : 'ce mois-ci';
    const difficulty = report.reds.map((r): ReportLine => {
      const decreases = report.decreases.filter((x) => x.variantId === r.variantId && x.home === r.home);
      if (decreases.length > 0) {
        return [
          `${name(r.variantId, r.home)} : `,
          ...decreases.flatMap((d, i): ReportPart[] => [
            ...(i > 0 ? [' ; '] : []),
            `${d.reds}ᵉ séance rouge de suite${load(d.weightKg, d.assisted)} → `,
            em(d.seconds ? 'cible −5 s recommandée' : d.bodyweight ? 'cible −1 rép. recommandée' : d.assisted ? 'plus d’aide recommandée' : 'poids inférieur recommandé'),
            ` (${shortDay(d.date)})`,
          ]),
        ];
      }
      const ongoing = r.streak > r.count ? ` (${r.streak} de suite${load(r.weightKg, r.assisted)})` : '';
      return [`${name(r.variantId, r.home)} : `, em(`${plural(r.count, 'séance rouge', 'séances rouges')} ${inThisPeriod}`), ongoing];
    });
    sections.push({ title: 'En difficulté', lines: difficulty.length > 0 ? difficulty : [['Aucun exercice en difficulté.']] });
  }

  if (report.weighIns.length > 0) {
    const [a, b] = report.weighIns;
    const at = (w: WeighIn): ReportPart[] => [em(formatKg(w.weightKg)), ` le ${shortDay(w.date)}`];
    sections.push({ title: 'Poids', lines: [b ? [...at(a!), ' → ', ...at(b)] : at(a!)] });
  }
  return sections;
}

/** Mention d'une période en cours : « Semaine en cours, arrêtée au jeu. 22 oct. ». */
export function inProgressNote(report: PeriodReport): string | null {
  if (!report.inProgress) return null;
  return `${report.period.kind === 'week' ? 'Semaine en cours' : 'Mois en cours'}, arrêté${report.period.kind === 'week' ? 'e' : ''} au ${WEEKDAY_DAY_MONTH.format(report.asOf)}`;
}

/** Texte brut du mail : titres en capitales, listes simples, sans HTML. */
export function reportText(report: PeriodReport, name: (variantId: string) => string): string {
  const head = [mailSubject(report.period)];
  const note = inProgressNote(report);
  if (note) head.push(`(${note})`);
  const body = reportSections(report, name).map((s) => [s.title.toUpperCase(), ...s.lines.map((l) => `- ${lineText(l)}`)].join('\n'));
  return [head.join('\n'), ...body].join('\n\n') + '\n';
}

/** Lien mailto prérempli : destinataire facultatif, objet et corps. */
export function mailtoUrl(to: string, subject: string, body: string): string {
  const address = encodeURIComponent(to.trim()).replace(/%40/g, '@');
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))}`;
}

/** Réglages des bilans (§14), inclus dans l'export. */
export interface ReportSettings {
  /** Bandeau « Ton bilan de la semaine est prêt » sur l'accueil. */
  weekBanner: boolean;
  monthBanner: boolean;
  /** Adresse préremplie dans le lien mailto, facultative. */
  email: string;
}

export const DEFAULT_REPORT_SETTINGS: ReportSettings = { weekBanner: true, monthBanner: true, email: '' };

export function isValidEmail(email: string): boolean {
  return email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function sanitizeReportSettings(value: unknown): ReportSettings {
  if (typeof value !== 'object' || value === null) return DEFAULT_REPORT_SETTINGS;
  const v = value as Record<string, unknown>;
  const email = typeof v.email === 'string' && isValidEmail(v.email.trim()) ? v.email.trim() : '';
  return {
    weekBanner: typeof v.weekBanner === 'boolean' ? v.weekBanner : true,
    monthBanner: typeof v.monthBanner === 'boolean' ? v.monthBanner : true,
    email,
  };
}

/** Dernière période terminée déjà ouverte, par type de bilan (clés de `periodKey`). */
export type ReportSeen = Partial<Record<ReportKind, string>>;

export function sanitizeReportSeen(value: unknown): ReportSeen {
  if (typeof value !== 'object' || value === null) return {};
  const v = value as Record<string, unknown>;
  const seen: ReportSeen = {};
  if (typeof v.week === 'string' && parsePeriodKey('week', v.week)) seen.week = v.week;
  if (typeof v.month === 'string' && parsePeriodKey('month', v.month)) seen.month = v.month;
  return seen;
}

/**
 * Bilans à signaler sur l'accueil : la semaine écoulée à partir du lundi, le mois écoulé à partir du 1er,
 * s'ils contiennent au moins une séance, que leur bandeau est activé et qu'ils n'ont pas encore été ouverts.
 */
export function pendingReports(sessions: readonly Session[], now: number, settings: ReportSettings, seen: ReportSeen): ReportPeriod[] {
  const out: ReportPeriod[] = [];
  for (const kind of ['week', 'month'] as const) {
    if (!(kind === 'week' ? settings.weekBanner : settings.monthBanner)) continue;
    const period = shiftPeriod(periodContaining(kind, now), -1);
    const key = periodKey(period);
    const last = seen[kind];
    if (last !== undefined && last >= key) continue;
    if (sessions.some(inPeriod(period))) out.push(period);
  }
  return out;
}

/** Bilan ouvert : une période terminée ne sera plus signalée ; une période en cours ne compte pas. */
export function markSeen(seen: ReportSeen, period: ReportPeriod, now: number): ReportSeen {
  if (now < period.next.getTime()) return seen;
  const key = periodKey(period);
  const last = seen[period.kind];
  return last !== undefined && last >= key ? seen : { ...seen, [period.kind]: key };
}

/** Période ouverte par défaut : la période en cours si elle contient une séance, sinon la précédente. */
export function defaultPeriod(kind: ReportKind, sessions: readonly Session[], now: number): ReportPeriod {
  const current = periodContaining(kind, now);
  return sessions.some(inPeriod(current)) ? current : shiftPeriod(current, -1);
}

/** Première période contenant une séance terminée : on ne remonte pas plus loin. */
export function firstPeriod(kind: ReportKind, sessions: readonly Session[]): ReportPeriod | null {
  const times = sessions.filter((s) => s.state === 'done').map(sessionStartTime);
  return times.length > 0 ? periodContaining(kind, Math.min(...times)) : null;
}
