/**
 * Écran du bilan (version 1.35.0) : tuiles, barres des groupes, calendrier du mois, échelles de cycle. Données pour
 * l'écran seulement, calculées à côté du bilan : `buildReport` et le texte du mail ne changent pas (découpé de
 * `report.ts`, version 1.49.3).
 */
import { activityStart, doneActivities } from '../activities/model';
import { cardioMinutes } from '../cardio/model';
import type { MuscleGroup } from '../domain/types';
import { localDate, sessionStartTime } from '../domain/calendar';
import { HOME_SUFFIX, repStep, resolveConfig } from '../engine';
import { formatShortDay, plural } from '../session/format';
import { load, type PeriodReport, type ReportInput, type ReportProgression } from './report';
import { containsTime, type ReportPeriod } from './reportPeriod';

/** Cran d'une échelle de cycle : une cible, ou le passage au poids supérieur (« +kg », « −aide »). */
export interface LadderStep {
  label: string;
  /** Ancienne cible (avant), nouvelle cible (maintenant), crans déjà franchis, crans à venir. */
  state: 'before' | 'now' | 'done' | 'next';
  weight?: true;
}

/** Nombre de crans de cible affichés quand la plage est plus longue (poids du corps, secondes, plage élargie). */
export const LADDER_WINDOW = 5;

/**
 * Échelle de cycle d'un palier validé : les cibles de la plage (8 · 9 · 10 · 11 · 12), puis « +kg » pour un exercice à
 * charge (« −aide » s'il est assisté). Plage de plus de 5 crans (poids du corps, secondes, plage élargie) : une fenêtre
 * de 5 crans autour de la nouvelle cible ; « +kg » seulement si la fenêtre atteint le haut de la plage, jamais au poids
 * du corps ni en secondes. Une cible hors plage (manuelle) élargit la plage.
 */
export function ladderSteps(p: Pick<ReportProgression, 'kind' | 'from' | 'toReps' | 'assisted'>, cfg: { minReps: number; maxReps: number; step: number; bodyweight: boolean }): LadderStep[] {
  const { step } = cfg;
  const up = p.kind === 'weight_up';
  const from = p.from.targetReps;
  const lo = Math.min(cfg.minReps, from, up ? from : p.toReps);
  const hi = Math.max(cfg.maxReps, from, up ? from : p.toReps);
  const values: number[] = [];
  for (let v = lo; v <= hi; v += step) values.push(v);
  if (values[values.length - 1] !== hi) values.push(hi);
  // Fenêtre autour de la nouvelle cible (en haut de la plage pour un passage au poids supérieur).
  const target = up ? values.length - 1 : Math.max(0, values.indexOf(p.toReps));
  const start = Math.max(0, Math.min(target - 2, values.length - LADDER_WINDOW));
  const shown = values.slice(start, start + LADDER_WINDOW);
  const steps: LadderStep[] = shown.map((v) => ({
    label: String(v),
    state: !up && v === p.toReps ? 'now' : v === from ? 'before' : up || v < p.toReps ? 'done' : 'next',
  }));
  if (!cfg.bodyweight && shown[shown.length - 1] === hi) steps.push({ label: p.assisted ? '−aide' : '+kg', state: up ? 'now' : 'next', weight: true });
  return steps;
}

export interface ReportScreen {
  /** Cardio (minutes) et activités confirmées (nombre) de la période et de l'intervalle comparé. */
  cardio: { now: number; before: number };
  activities: { now: number; before: number };
  /**
   * Longueur de la barre de chaque groupe, en séries (version 1.45.0), avec les règles du récapitulatif : séries du
   * graphique « Séries par semaine », 3 par activité confirmée, 3 par semaine à 45 min de cardio pour les jambes.
   */
  bars: { group: MuscleGroup; sets: number }[];
  /** Chaque jour de la période : séances à la salle, à la maison, activités confirmées. */
  days: { date: string; gym: number; home: number; activities: number }[];
  /** Échelle de cycle de chaque progression, dans l'ordre de `report.progressions`. */
  ladders: LadderStep[][];
}

export function buildReportScreen(report: PeriodReport, input: ReportInput): ReportScreen {
  const { period } = report;
  const done = input.sessions.filter((s) => s.state === 'done');
  const activities = doneActivities(input.activities ?? []);
  const compared = report.compared;
  const inside = (span: Pick<ReportPeriod, 'start' | 'next'>) => (t: number) => containsTime(span, t);
  const cardioIn = (span: Pick<ReportPeriod, 'start' | 'next'>) =>
    done.filter((s) => inside(span)(sessionStartTime(s))).reduce((n, s) => n + cardioMinutes(s), 0);
  const activitiesIn = (span: Pick<ReportPeriod, 'start' | 'next'>) => activities.filter((a) => inside(span)(activityStart(a))).length;

  const bars = report.groups.map((g) => ({ group: g.group, sets: g.sets }));

  const days: ReportScreen['days'] = [];
  for (let d = new Date(period.start); d < period.next; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const date = localDate(d.getTime());
    const day = { start: d, next: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) };
    const sessions = done.filter((s) => inside(day)(sessionStartTime(s)));
    days.push({ date, gym: sessions.filter((s) => s.location !== 'maison').length, home: sessions.filter((s) => s.location === 'maison').length, activities: activitiesIn(day) });
  }

  const ladders = report.progressions.map((p) => {
    const cfg = resolveConfig(input.settings, p.home ? `${p.variantId}${HOME_SUFFIX}` : p.variantId);
    return ladderSteps(p, { minReps: cfg.minReps, maxReps: cfg.maxReps, step: repStep(cfg), bodyweight: !!cfg.bodyweight });
  });

  return {
    cardio: { now: cardioIn(period), before: cardioIn(compared) },
    activities: { now: activitiesIn(period), before: activitiesIn(compared) },
    bars,
    days,
    ladders,
  };
}

/** Ligne sous le nom d'une progression : « 3 séries · à 52 kg · 29 oct. », « 3 séries · poids du corps · 27 oct. ». */
export function progressionMeta(p: ReportProgression, dumbbell = false): string {
  const charge = p.seconds ? 'en secondes' : p.from.weightKg === 0 ? 'poids du corps' : load(p.from.weightKg, p.assisted, dumbbell).trim();
  return `${plural(p.sets, 'série')} · ${charge} · ${formatShortDay(p.date)}`;
}
