/**
 * Export « coach » (version 1.46.0, §19.13) : un fichier unique, complet, compact et lisible, à donner à un assistant
 * pour un bilan de coach de la dernière semaine terminée (lundi – dimanche). Clés en français, nombres déjà calculés,
 * pas d'identifiant interne. Calcul pur, refait à chaque export à partir des données de l'appareil, arrêté à la fin de
 * la semaine exportée (ce qui a été fait depuis n'y entre pas) ; jamais stocké, aucun effet sur le moteur. L'export
 * complet (sauvegarde, §11.10) ne change pas.
 */
import { activityMinutes, activityStart, doneActivities, WEEKDAY_LABELS, type ActivityRecord, type Habit } from '../activities/model';
import type { WeighIn } from '../body/model';
import { cardioOf, formatCardio } from '../cardio/model';
import { localDate, sessionStartTime, weekStart } from '../domain/calendar';
import { MAIN_GROUPS, parentGroup, recapGroupOf } from '../domain/muscleGroups';
import type { CardioMachine, Exercise, MuscleGroup, Performance, Session, Status } from '../domain/types';
import {
  HOME_SUFFIX,
  rebuildProfile,
  resolveConfig,
  sortSessions,
  trackKey,
  variantOfTrack,
  type EngineSettings,
  type Evaluation,
} from '../engine';
import { displayName, indexVariants, variantLabel, type VariantRef } from '../library/catalog';
import { perDumbbell } from '../library/search';
import { weekSuggestion, SUGGEST_MAX, type SkipReason } from '../plan/suggest';
import { coachWeek, DAY_MONTH_YEAR } from './coachPeriod';
import { clock, FEELINGS, groupLabel, loadField, nextTargetText, rangeText, recommendationText, round1, typeOf, weekday } from './coachFormat';
import { coachJson } from './coachJson';
import { coachRules } from './coachRules';
import { formatLoad } from '../session/format';
import { elapsedMs } from '../session/ops';
import { sessionTitle } from '../session/title';
import { alertFigures, groupAlertCandidates, groupAlerts, type IgnoredAlerts } from './groupAlerts';
import { recentSubGroups, subGroupsOf } from './subGroups';
import { JOINT_LABELS, jointAlerts, jointFigures, jointReportText, type IgnoredJointAlerts } from './jointAlerts';
import { GROUP_VIEW_GROUPS, groupIndex, SETS_ONLY_GROUPS } from './groups';
import { analyzeProgress } from './progress';
import { computeRecords, formatRecordWithDate } from './records';
import { buildReport, lineText, reportSections, reportText } from './report';
import { periodLastDay, periodTitle, shiftPeriod, type ReportPeriod } from './reportPeriod';
import {
  ACTIVITY_SETS,
  groupScore,
  groupSeries,
  groupWork,
  LEG_CARDIO_GROUP,
  LEG_CARDIO_SETS,
  legCardioWeek,
  recapColor,
  type WeeklyRecapSettings,
} from './weekly';

/** Version du format du fichier (indépendante de la version de l'appli). */
export const COACH_FORMAT_VERSION = 1;
/** Semaines de la tendance et fenêtre des exercices : la semaine exportée et les 7 d'avant. */
export const COACH_WEEKS = 8;
/** Dernières performances données pour chaque exercice. */
export const COACH_LAST_PERFORMANCES = 5;
/** Dernières pesées du contexte. */
export const COACH_WEIGH_INS = 5;

export interface CoachInput {
  sessions: readonly Session[];
  exercises: readonly Exercise[];
  settings: EngineSettings;
  recap: WeeklyRecapSettings;
  activities: readonly ActivityRecord[];
  habits: readonly Habit[];
  machines: readonly CardioMachine[];
  weighIns: readonly WeighIn[];
  heightCm: number | null;
  /** Alertes ignorées sur l'appareil (§19.11) : signalées comme telles. */
  ignoredAlerts: IgnoredAlerts;
  /** Articulations ignorées sur l'appareil (§19.14, version 1.53.0) : signalées comme telles. */
  ignoredJointAlerts?: IgnoredJointAlerts;
  appVersion: string;
  now: number;
}

// ——— Construction ————————————————————————————————————————————————

interface Context {
  input: CoachInput;
  refs: Map<string, VariantRef>;
  evaluations: Map<string, Evaluation>;
}

function exerciseOf(ctx: Context, variantId: string) {
  const ref = ctx.refs.get(variantId);
  const cfg = resolveConfig(ctx.input.settings, variantId);
  return { ref, cfg, type: typeOf(cfg, ref) };
}

/** Exercice et variante, groupes principal et secondaires, type. */
function identity(ctx: Context, variantId: string) {
  const { ref, type } = exerciseOf(ctx, variantId);
  const label = ref ? variantLabel(ref) : null;
  const secondary = ref ? [...new Set(ref.exercise.secondaryGroups)].map(groupLabel) : [];
  return {
    exercice: ref?.exercise.name ?? 'Exercice inconnu',
    ...(label ? { variante: label } : {}),
    groupe: ref ? groupLabel(ref.exercise.primaryGroup) : null,
    ...(secondary.length > 0 ? { groupes_secondaires: secondary } : {}),
    type,
  };
}

/** Performance : charge, cible, séries faites, ressenti, statut et séance de départ (évaluation du moteur). */
function performanceFields(ctx: Context, session: Session, p: Performance) {
  const { type } = exerciseOf(ctx, p.variantId);
  const ev = ctx.evaluations.get(`${session.id}|${p.variantId}`);
  return {
    ...loadField(type, p.weightKg),
    ...(p.targetReps !== null ? { cible: p.targetReps } : {}),
    ...(p.plannedSets !== null ? { series_prevues: p.plannedSets } : {}),
    series: p.reps,
    ressenti: FEELINGS[p.feeling],
    ...(p.feelingSymbol ? { symbole: p.feelingSymbol } : {}),
    statut: (ev?.status ?? null) as Status | null,
    ...(p.partial ? { partielle: true } : {}),
    ...(ev ? { valide: ev.validation, seance_de_depart: ev.decision === 'manual_weight' } : {}),
  };
}

const place = (s: Session) => (s.location === 'maison' ? 'maison' : 'salle');

function sessionView(ctx: Context, s: Session) {
  const primaryOf = (id: string) => ctx.refs.get(id)?.exercise.primaryGroup;
  const gym = s.location !== 'maison';
  return {
    date: s.date,
    jour: weekday(s.date),
    lieu: place(s),
    ...(gym && s.startedAt !== null ? { debut: clock(s.startedAt) } : {}),
    ...(gym && s.startedAt !== null && s.endedAt !== null ? { duree_min: Math.round(elapsedMs(s, s.endedAt) / 60_000) } : {}),
    nom: sessionTitle(s, primaryOf),
    ...(s.origin === 'import' ? { importee: true } : {}),
    ...(s.fromPlan ? { prevue: true } : {}),
    exercices: s.performances.filter((p) => p.reps.length > 0 || p.partial).map((p) => ({ ...identity(ctx, p.variantId), ...performanceFields(ctx, s, p) })),
    ...(cardioOf(s).length > 0
      ? {
          cardio: cardioOf(s).map((b) => ({
            machine: b.machine,
            minutes: b.minutes,
            ...(b.distanceKm !== undefined ? { distance_km: b.distanceKm } : {}),
            ...(b.incline ? { inclinaison: b.incline } : {}),
          })),
        }
      : {}),
  };
}

function activityView(a: ActivityRecord) {
  return {
    date: a.date,
    jour: weekday(a.date),
    nom: a.name,
    duree_min: activityMinutes(a),
    groupes: a.groups.map(groupLabel),
    ...(a.oneOff ? { ponctuelle: true } : {}),
  };
}

/**
 * Détail des séries de chaque groupe du récapitulatif sur la semaine : directes (groupe principal), indirectes
 * (groupe secondaire, ½), dont à la maison, activités et cardio des jambes ; le total est le score du récapitulatif.
 */
function recapGroups(input: CoachInput, sessions: readonly Session[], activities: readonly ActivityRecord[], period: ReportPeriod) {
  const inWeek = (t: number) => t >= period.start.getTime() && t < period.next.getTime();
  const shown = new Set(input.recap.groups);
  const byVariant = new Map<string, Exercise>();
  for (const e of input.exercises) for (const v of e.variants) byVariant.set(v.id, e);
  const direct = new Map<MuscleGroup, number>();
  const indirect = new Map<MuscleGroup, number>();
  const home = new Map<MuscleGroup, number>();
  const add = (map: Map<MuscleGroup, number>, g: MuscleGroup, n: number) => map.set(g, (map.get(g) ?? 0) + n);
  for (const s of sessions) {
    if (!inWeek(sessionStartTime(s))) continue;
    for (const p of s.performances) {
      const e = byVariant.get(p.variantId);
      if (!e || p.partial) continue;
      const primary = recapGroupOf(e.primaryGroup, shown);
      if (primary) {
        add(direct, primary, p.reps.length);
        if (s.location === 'maison') add(home, primary, p.reps.length);
      }
      for (const g of new Set(e.secondaryGroups.map((sg) => recapGroupOf(sg, shown)))) {
        if (!g || g === primary) continue;
        add(indirect, g, p.reps.length / 2);
        if (s.location === 'maison') add(home, g, p.reps.length / 2);
      }
    }
  }
  const series = groupSeries(sessions, input.exercises, input.recap.groups, inWeek, activities);
  const work = groupWork(sessions, input.exercises, input.recap.groups, inWeek, activities);
  const legCardio = legCardioWeek(sessions, input.machines, inWeek);
  return input.recap.groups.map((group) => {
    const named = series.activities.get(group) ?? [];
    const cardioWeeks = group === LEG_CARDIO_GROUP && legCardio > 0 ? 1 : 0;
    const total = groupScore({ sets: series.sets.get(group) ?? 0, activities: named.length, cardioWeeks });
    return {
      groupe: groupLabel(group),
      total_series: round1(total),
      couleur: recapColor(total, input.recap.redSets),
      directes: round1(direct.get(group) ?? 0),
      indirectes: round1(indirect.get(group) ?? 0),
      dont_maison: round1(home.get(group) ?? 0),
      activites: ACTIVITY_SETS * named.length,
      ...(named.length > 0 ? { activites_noms: named } : {}),
      cardio_jambes: LEG_CARDIO_SETS * cardioWeeks,
      ...(cardioWeeks > 0 ? { cardio_jambes_min: legCardio } : {}),
      seances: work.counts.get(group) ?? 0,
      seances_indirectes: work.indirects.get(group) ?? 0,
    };
  });
}

/** Lundis des semaines de la tendance : la semaine exportée et les 7 d'avant, sans semaine avant la première séance. */
function trendWeeks(period: ReportPeriod, firstSession: number | null): ReportPeriod[] {
  const weeks: ReportPeriod[] = [];
  for (let i = COACH_WEEKS - 1; i >= 0; i--) {
    const w = shiftPeriod(period, -i);
    if (firstSession !== null && w.next.getTime() <= weekStart(new Date(firstSession)).getTime()) continue;
    weeks.push(w);
  }
  return weeks;
}

const SKIP_REASONS: Record<SkipReason, string> = {
  veille: 'travaillé à la salle la veille',
  place: `pas de place (${SUGGEST_MAX} exercices au plus)`,
  aucun: 'aucun exercice fait récemment à la salle',
};

/** L'export, prêt à écrire en JSON. */
export function buildCoachExport(input: CoachInput) {
  const period = coachWeek(input.now);
  const end = period.next.getTime();
  const lastDay = localDate(periodLastDay(period).getTime());
  const inWeek = (t: number) => t >= period.start.getTime() && t < end;
  // Tout est arrêté à la fin de la semaine exportée.
  const sessions = sortSessions(input.sessions.filter((s) => s.state === 'done' && sessionStartTime(s) < end));
  const activities = doneActivities(input.activities).filter((a) => activityStart(a) < end);
  const weighIns = [...input.weighIns].filter((w) => w.date <= lastDay).sort((a, b) => (a.date < b.date ? -1 : 1));
  const replay = rebuildProfile(sessions, input.settings);
  const ctx: Context = {
    input,
    refs: indexVariants(input.exercises),
    evaluations: new Map(replay.evaluations.map((ev) => [`${ev.sessionId}|${ev.variantId}`, ev])),
  };
  const name = (id: string) => displayName(ctx.refs.get(id));
  const dumbbell = (id: string) => perDumbbell(ctx.refs.get(id));
  const firstSession = sessions.length > 0 ? sessionStartTime(sessions[0]!) : null;
  const weeks = trendWeeks(period, firstSession);
  const windowStart = weeks[0]?.start.getTime() ?? period.start.getTime();

  // Bilan de la semaine : le même que l'écran et le mail (§19.7).
  const reportInput = {
    sessions,
    exercises: input.exercises,
    evaluations: replay.evaluations,
    settings: input.settings,
    groups: input.recap.groups,
    weighIns,
    activities,
    machines: input.machines,
    alertSets: input.recap.alertSets,
    now: input.now,
  };
  const report = buildReport(period, reportInput);
  const sections = new Map(reportSections(report, name, dumbbell).map((s) => [s.title, s.lines.map(lineText)]));

  // Contexte.
  const gymCount = sessions.filter((s) => s.location !== 'maison').length;
  const contexte = {
    premiere_seance: sessions[0]?.date ?? null,
    seances_au_total: { salle: gymCount, maison: sessions.length - gymCount },
    semaines_suivies: firstSession === null ? 0 : Math.round((period.start.getTime() - weekStart(new Date(firstSession)).getTime()) / (7 * 86_400_000)) + 1,
    groupes_du_recapitulatif: input.recap.groups.map(groupLabel),
    seuil_rouge_series: input.recap.redSets,
    seuil_alerte_series: input.recap.alertSets,
    habitudes: input.habits.map((h) => ({ nom: h.name, jour: WEEKDAY_LABELS[h.weekday], debut: h.start, fin: h.end, groupes: h.groups.map(groupLabel), active: h.enabled })),
    taille_cm: input.heightCm,
    dernieres_pesees: weighIns.slice(-COACH_WEIGH_INS).map((w) => ({ date: w.date, kg: w.weightKg })),
  };

  // Semaine en détail.
  const weekSessions = sessions.filter((s) => inWeek(sessionStartTime(s)));
  const semaine = {
    seances: weekSessions.map((s) => sessionView(ctx, s)),
    activites: activities.filter((a) => inWeek(activityStart(a))).map(activityView),
    pesees: weighIns.filter((w) => w.date >= localDate(period.start.getTime())).map((w) => ({ date: w.date, kg: w.weightKg })),
  };

  // Récapitulatif de la semaine.
  const recapitulatif = {
    seuil_rouge_series: input.recap.redSets,
    seances: { salle: weekSessions.filter((s) => s.location !== 'maison').length, maison: weekSessions.filter((s) => s.location === 'maison').length },
    groupes: recapGroups(input, sessions, activities, period),
    // Version 1.54.0 : répartition par sous-groupe (§19.15), la semaine exportée et les 4 semaines terminées qu'elle clôt
    // (celles de « Par groupe musculaire » le lundi suivant).
    sous_groupes: Object.fromEntries(report.subGroups.map((g) => [groupLabel(g.group), Object.fromEntries(subGroupsOf(g.group).map((sub) => [sub.label.toLowerCase(), round1(g.sets[sub.id] ?? 0)]))])),
    sous_groupes_4_semaines: Object.fromEntries(
      report.subGroups.map((g) => [groupLabel(g.group), Object.fromEntries(recentSubGroups(sessions, input.exercises, g.group, end).rows.map((r) => [r.label.toLowerCase(), round1(r.sets)]))]),
    ),
    texte_du_bilan: reportText(report, name, dumbbell).split('\n'),
  };

  // Exercices des 8 dernières semaines, par suivi.
  const records = computeRecords(sessions, input.settings).current;
  const history = new Map<string, { session: Session; p: Performance }[]>();
  const recent = new Set<string>();
  for (const s of sessions) {
    for (const p of s.performances) {
      if (p.reps.length === 0 && !p.partial) continue;
      const track = trackKey(input.settings, p.variantId, s.location === 'maison');
      history.set(track, [...(history.get(track) ?? []), { session: s, p }]);
      if (sessionStartTime(s) >= windowStart) recent.add(track);
    }
  }
  const groupRank = (id: string) => {
    const g = ctx.refs.get(id)?.exercise.primaryGroup;
    const i = g ? MAIN_GROUPS.indexOf(parentGroup(g)) : -1;
    return i < 0 ? MAIN_GROUPS.length : i;
  };
  const tracks = [...recent].sort((a, b) => {
    const va = variantOfTrack(a);
    const vb = variantOfTrack(b);
    return groupRank(va) - groupRank(vb) || name(va).localeCompare(name(vb), 'fr') || a.localeCompare(b);
  });
  const exercices = tracks.map((track) => {
    const variantId = variantOfTrack(track);
    const home = track.endsWith(HOME_SUFFIX);
    const { cfg, type } = exerciseOf(ctx, variantId);
    const trackCfg = resolveConfig(input.settings, track);
    const state = replay.profile.variants[track];
    const record = records.get(track);
    const single = !home && trackKey(input.settings, variantId, true) === variantId;
    return {
      ...identity(ctx, variantId),
      lieu: home ? 'maison' : single ? 'salle et maison (un seul suivi)' : 'salle',
      plage: rangeText(trackCfg, type),
      series_standard: cfg.sets,
      ...(state
        ? {
            palier: { ...loadField(type, state.palier.weightKg), cible: state.palier.targetReps },
            recommandation: recommendationText(state, type),
            prochaine_cible: nextTargetText(state, type),
            vertes_consecutives: state.greenStreak,
            serie_de_rouges_en_cours: state.redStreak,
          }
        : { recommandation: 'aucune : performances partielles seulement' }),
      record: record ? formatRecordWithDate(record, type === 'haltères') : null,
      dernieres_performances: (history.get(track) ?? []).slice(-COACH_LAST_PERFORMANCES).map(({ session, p }) => {
        const f = performanceFields(ctx, session, p);
        const { valide: _valide, seance_de_depart: depart, ...rest } = f as typeof f & { valide?: boolean; seance_de_depart?: boolean };
        return { date: session.date, lieu: place(session), ...rest, ...(depart ? { seance_de_depart: true } : {}) };
      }),
    };
  });

  // Tendance : séries par groupe (score du récapitulatif), séances, cardio, activités et indice par semaine.
  const indexGroups = input.recap.groups.filter((g) => GROUP_VIEW_GROUPS.includes(g) && !SETS_ONLY_GROUPS.includes(g));
  const indices = new Map(indexGroups.map((g) => [g, groupIndex(sessions, input.exercises, input.settings, g, weighIns)]));
  const tendance = {
    semaines: weeks.map((w) => {
      const within = (t: number) => t >= w.start.getTime() && t < w.next.getTime();
      const list = sessions.filter((s) => within(sessionStartTime(s)));
      const series = groupSeries(sessions, input.exercises, input.recap.groups, within, activities);
      const legCardio = legCardioWeek(sessions, input.machines, within);
      const cardio: Record<string, number> = {};
      for (const s of list) for (const b of cardioOf(s)) cardio[b.machine] = (cardio[b.machine] ?? 0) + b.minutes;
      const acts: Record<string, number> = {};
      for (const a of activities.filter((x) => within(activityStart(x)))) acts[a.name] = (acts[a.name] ?? 0) + 1;
      const weekEnd = localDate(periodLastDay(w).getTime());
      const indice: Record<string, number> = {};
      for (const [g, index] of indices) {
        const point = index.points.filter((p) => p.date <= weekEnd).at(-1);
        if (point) indice[groupLabel(g)] = round1(point.value);
      }
      return {
        du: localDate(w.start.getTime()),
        seances_salle: list.filter((s) => s.location !== 'maison').length,
        seances_maison: list.filter((s) => s.location === 'maison').length,
        series: Object.fromEntries(
          input.recap.groups.map((g) => [
            groupLabel(g),
            round1(groupScore({ sets: series.sets.get(g) ?? 0, activities: series.activities.get(g)?.length ?? 0, cardioWeeks: g === LEG_CARDIO_GROUP && legCardio > 0 ? 1 : 0 })),
          ]),
        ),
        cardio_min: cardio,
        activites: acts,
        indice,
      };
    }),
    indice_seuil_atteint: [...indices].filter(([, index]) => index.enough).map(([g]) => groupLabel(g)),
  };

  // Signaux.
  // Tous les groupes sous le seuil les 2 dernières semaines (la semaine exportée et la précédente), du plus bas au plus
  // haut ; version 1.52.1 : l'appli les cite tous dans un seul bandeau, sauf ceux ignorés (« affichee_dans_l_appli »).
  const alertInput = { sessions, exercises: input.exercises, activities, machines: input.machines, groups: input.recap.groups, threshold: input.recap.alertSets, now: end };
  const shown = new Set(groupAlerts(alertInput, input.ignoredAlerts).map((a) => a.group));
  const alertes = groupAlertCandidates(alertInput).map((a) => ({
    groupe: groupLabel(a.group),
    series_2_dernieres_semaines: a.recent.map(round1),
    seuil: a.threshold,
    texte: `${groupLabel(a.group)} : ${alertFigures(a)}`.replace(/ | /g, ' '),
    ...(shown.has(a.group) ? { affichee_dans_l_appli: true } : {}),
    ...(input.ignoredAlerts[a.group] === a.week ? { ignoree_sur_l_appareil: true } : {}),
  }));
  // Version 1.53.0 : articulations (§19.14), la semaine exportée contre la moyenne des 4 précédentes ; celles en hausse
  // sont citées par le bandeau, sauf celles ignorées.
  const jointInput = { sessions, exercises: input.exercises, activities, machines: input.machines, now: end };
  const ignoredJoints = input.ignoredJointAlerts ?? {};
  const jointShown = new Set(jointAlerts(jointInput, ignoredJoints).map((a) => a.joint));
  const figures = jointFigures(jointInput);
  const articulations = figures
    ? figures.map((f) => ({
        articulation: JOINT_LABELS[f.joint],
        series: round1(f.sets),
        moyenne_4_semaines_avant: round1(f.average),
        ...(f.alert ? { forte_hausse: true, texte: jointReportText([f]) } : {}),
        ...(jointShown.has(f.joint) ? { affichee_dans_l_appli: true } : {}),
        ...(f.alert && ignoredJoints[f.joint] === f.week ? { ignoree_sur_l_appareil: true } : {}),
      }))
    : 'alerte muette : moins de 4 semaines terminées avant la semaine exportée';
  const difficulty = analyzeProgress(replay.evaluations, replay.profile)
    .filter((v) => v.category === 'difficulty')
    .map((v) => {
      const track = v.home ? `${v.variantId}${HOME_SUFFIX}` : v.variantId;
      const state = replay.profile.variants[track]!;
      const { type } = exerciseOf(ctx, v.variantId);
      const load = type === 'poids du corps' || type === 'durée' ? '' : formatLoad(state.palier.weightKg, type === 'assisté', type === 'haltères');
      return `${name(v.variantId)}${v.home ? ' (maison)' : ''} : série en cours de ${v.redStreak} rouges${load}`;
    });
  const suggestion = weekSuggestion({ sessions, exercises: input.exercises, settings: input.settings, recap: input.recap, activities, machines: input.machines, now: end - 1 });
  const lastGym = weekSessions.filter((s) => s.location !== 'maison').at(-1);
  const seance_pour_completer = suggestion
    ? {
        proposee_pour: suggestion.day,
        ...(suggestion.cardio ? { echauffement: formatCardio(suggestion.cardio) } : {}),
        exercices: suggestion.exercises.map((e) => {
          const state = replay.profile.variants[trackKey(input.settings, e.variantId, false)];
          const { type } = exerciseOf(ctx, e.variantId);
          return {
            exercice: name(e.variantId),
            groupe: groupLabel(e.group),
            ...(state ? { cible: nextTargetText(state, type) } : {}),
            ...(e.second ? { deuxieme_du_groupe: true } : {}),
            ...(e.bonus ? { bonus: true } : {}),
          };
        }),
        a_l_objectif_avec_cette_seance: suggestion.reached.map(groupLabel),
        encore_sous_l_objectif: suggestion.remaining.map(groupLabel),
        completes_par_un_groupe_secondaire: suggestion.covered.map((c) => ({ groupe: groupLabel(c.group), par: name(c.by) })),
        ecartes: suggestion.skipped.map((x) => ({ groupe: groupLabel(x.group), raison: SKIP_REASONS[x.reason] })),
      }
    : {
        proposee_pour: null,
        raison: !lastGym
          ? 'aucune séance à la salle cette semaine'
          : lastGym.date === lastDay
            ? 'séance à la salle le dimanche : la séance proposée tomberait la semaine suivante'
            : 'tous les groupes du récapitulatif à l’objectif (hors abdominaux)',
      };
  const signaux = {
    alertes_groupe_moins_travaille: alertes,
    articulations_trop_sollicitees: articulations,
    en_difficulte_cette_semaine: report.reds.length > 0 ? (sections.get('En difficulté') ?? []) : [],
    series_de_rouges_en_cours: difficulty,
    paliers_valides: report.progressions.length > 0 ? (sections.get('Progressions') ?? []) : [],
    records_battus: report.records.length > 0 ? (sections.get('Records') ?? []) : [],
    seance_pour_completer,
  };

  return {
    export: 'MyFitApp — données pour un bilan de coach',
    version_format: COACH_FORMAT_VERSION,
    version_appli: input.appVersion,
    genere_le: `${localDate(input.now)} ${clock(input.now)}`,
    periode: {
      titre: periodTitle(period),
      du: localDate(period.start.getTime()),
      au: lastDay,
      note: `Données arrêtées au dimanche ${DAY_MONTH_YEAR.format(periodLastDay(period))} à 23 h 59 : ce qui a été fait depuis n’y est pas. Charges en kg, durées en minutes, dates AAAA-MM-JJ.`,
    },
    regles: coachRules(input.recap, input.machines),
    contexte,
    semaine,
    recapitulatif,
    exercices,
    tendance,
    signaux,
  };
}

export type CoachExport = ReturnType<typeof buildCoachExport>;

/** Texte du fichier. */
export function coachExportText(input: CoachInput): string {
  return `${coachJson(buildCoachExport(input))}\n`;
}
