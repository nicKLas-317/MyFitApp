/**
 * Export « coach » (version 1.46.0, §19.13) : un fichier unique, complet, compact et lisible, à donner à un assistant
 * pour un bilan de coach de la dernière semaine terminée (lundi – dimanche). Clés en français, nombres déjà calculés,
 * pas d'identifiant interne. Calcul pur, refait à chaque export à partir des données de l'appareil, arrêté à la fin de
 * la semaine exportée (ce qui a été fait depuis n'y entre pas) ; jamais stocké, aucun effet sur le moteur. L'export
 * complet (sauvegarde, §11.10) ne change pas.
 */
import { activityMinutes, activityStart, doneActivities, WEEKDAY_LABELS, type ActivityRecord, type Habit } from '../activities/model';
import type { WeighIn } from '../body/model';
import { cardioOf, formatCardio, machineCountsForLegs } from '../cardio/model';
import { localDate, parseIsoDay, sessionStartTime, weekStart } from '../domain/calendar';
import { MAIN_GROUPS, parentGroup, recapGroupOf } from '../domain/muscleGroups';
import type { CardioMachine, Exercise, Feeling, MuscleGroup, Performance, Session, Status, VariantConfig } from '../domain/types';
import {
  HOME_SUFFIX,
  rebuildProfile,
  resolveConfig,
  sortSessions,
  trackKey,
  variantOfTrack,
  type EngineSettings,
  type Evaluation,
  type ProgressState,
} from '../engine';
import { displayName, indexVariants, variantLabel, type VariantRef } from '../library/catalog';
import { perDumbbell } from '../library/search';
import { MUSCLE_GROUP_LABELS } from '../library/seed';
import { weekSuggestion, SUGGEST_MAX, type SkipReason } from '../plan/suggest';
import { formatLoad, formatSetsReps } from '../session/format';
import { elapsedMs } from '../session/ops';
import { sessionTitle } from '../session/title';
import { alertFigures, groupAlert, type IgnoredAlerts } from './groupAlerts';
import { GROUP_VIEW_GROUPS, groupIndex, SETS_ONLY_GROUPS } from './groups';
import { analyzeProgress } from './progress';
import { computeRecords, formatRecordWithDate } from './records';
import { buildReport, lineText, parsePeriodKey, periodContaining, periodKey, periodLastDay, periodTitle, reportSections, reportText, shiftPeriod, type ReportPeriod } from './report';
import {
  ACTIVITY_SETS,
  groupScore,
  groupSeries,
  groupWork,
  LEG_CARDIO_GROUP,
  LEG_CARDIO_MINUTES,
  LEG_CARDIO_SETS,
  legCardioWeek,
  ORANGE_SETS,
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
  appVersion: string;
  now: number;
}

// ——— Semaine exportée ————————————————————————————————————————————

/** Dernière semaine terminée (lundi 0 h 00 – dimanche) : exporté le lundi 16 novembre, du 9 au 15. */
export function coachWeek(now: number): ReportPeriod {
  return shiftPeriod(periodContaining('week', now), -1);
}

const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric' });
const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' });

/** Libellé du bouton : « Semaine du 9 au 15 nov. », « du 26 oct. au 1 nov. », l'année seulement à cheval sur deux ans. */
export function coachWeekLabel(period: ReportPeriod): string {
  const start = period.start;
  const end = periodLastDay(period);
  if (start.getFullYear() !== end.getFullYear()) return `Semaine du ${DAY_MONTH_YEAR.format(start)} au ${DAY_MONTH_YEAR.format(end)}`;
  return `Semaine du ${start.getMonth() !== end.getMonth() ? DAY_MONTH.format(start) : DAY.format(start)} au ${DAY_MONTH.format(end)}`;
}

/** « myfitapp-coach-2026-11-09.json » : date du lundi de la semaine exportée. */
export function coachFileName(period: ReportPeriod): string {
  return `myfitapp-coach-${periodKey(period)}.json`;
}

/** Titre du partage : « MyFitApp — données pour le coach, semaine du 9 au 15 nov. 2026 ». */
export function coachShareTitle(period: ReportPeriod): string {
  const title = periodTitle(period);
  return `MyFitApp — données pour le coach, ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
}

/**
 * Semaine déjà envoyée au coach (version 1.47.0), mémorisée sur l'appareil seulement (méta `coachSent`) : clé du lundi
 * (« 2026-11-09 »), ou null. Une valeur invalide est ignorée.
 */
export function sanitizeCoachSent(value: unknown): string | null {
  return typeof value === 'string' && parsePeriodKey('week', value) !== null ? value : null;
}

/** Le bouton n'est proposé que si une séance a été terminée avant la semaine en cours (sinon rien à exporter). */
export function hasCoachWeek(sessions: readonly Session[], now: number): boolean {
  const current = weekStart(new Date(now)).getTime();
  return sessions.some((s) => s.state === 'done' && sessionStartTime(s) < current);
}

// ——— Mise en forme ———————————————————————————————————————————————

const round1 = (n: number) => Math.round(n * 10) / 10;
const pad = (n: number) => String(n).padStart(2, '0');
const clock = (ts: number) => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const weekday = (date: string) => WEEKDAY.format(parseIsoDay(date));
const groupLabel = (g: MuscleGroup) => MUSCLE_GROUP_LABELS[g];

const FEELINGS: Record<Feeling, string> = {
  tres_bien: 'très bien',
  bien: 'bien',
  moyen: 'moyen',
  mal: 'mal',
  tres_mal: 'très mal',
  inconnu: 'non renseigné',
};

type CoachType = 'charge' | 'haltères' | 'assisté' | 'poids du corps' | 'durée';

function typeOf(cfg: VariantConfig, ref: VariantRef | undefined): CoachType {
  if (cfg.seconds) return 'durée';
  if (cfg.bodyweight) return 'poids du corps';
  if (cfg.assisted) return 'assisté';
  return perDumbbell(ref) ? 'haltères' : 'charge';
}

/** Charge sous une clé explicite : aucune pour le poids du corps et la durée. */
function loadField(type: CoachType, kg: number): Record<string, number> {
  if (type === 'charge') return { charge_kg: kg };
  if (type === 'haltères') return { charge_kg_par_haltere: kg };
  if (type === 'assisté') return { aide_kg: kg };
  return {};
}

/** « 3 × 9 à 73 kg », « 3 × 9 avec 23 kg d’aide », « 3 × 9 à 12 kg / haltère », « 3 × 25 », « 3 × 45 s ». */
function targetText(sets: number, reps: number, kg: number, type: CoachType): string {
  const load = type === 'poids du corps' || type === 'durée' ? '' : formatLoad(kg, type === 'assisté', type === 'haltères');
  return `${formatSetsReps(sets, reps, type === 'durée')}${load}`;
}

/** Recommandation du moteur, en mots. */
function recommendationText(state: ProgressState, type: CoachType): string {
  const rec = state.recommendation;
  const step = rec.targetReps - state.palier.targetReps;
  const unit = type === 'durée' ? ' s' : step > 1 || step < -1 ? ' répétitions' : ' répétition';
  switch (rec.kind) {
    case 'reps_up':
      return `+${step}${unit}`;
    case 'reps_down':
      return `−${-step}${unit}`;
    case 'weight_up':
      return type === 'assisté' ? 'moins d’aide' : 'poids supérieur';
    case 'weight_down':
      return type === 'assisté' ? 'plus d’aide' : 'poids inférieur';
    case 'ceiling':
      return 'plafond atteint : garder le palier';
    default:
      return 'garder le palier';
  }
}

/** Prochaine cible : avec la charge du palier, ou « poids supérieur, puis 3 × 8 » (la charge est à choisir). */
function nextTargetText(state: ProgressState, type: CoachType): string {
  const rec = state.recommendation;
  if (rec.kind === 'weight_up' || rec.kind === 'weight_down') return `${recommendationText(state, type)}, puis ${formatSetsReps(rec.plannedSets, rec.targetReps, type === 'durée')}`;
  return targetText(rec.plannedSets, rec.targetReps, state.palier.weightKg, type);
}

/** Plage du suivi (celle de la maison pour le suivi de la maison). */
function rangeText(cfg: Pick<VariantConfig, 'minReps' | 'maxReps'>, type: CoachType): string {
  return type === 'durée' ? `${cfg.minReps} à ${cfg.maxReps} s` : `${cfg.minReps} à ${cfg.maxReps} répétitions`;
}

// ——— Règles ————————————————————————————————————————————————————

/** Règles utiles à l'interprétation, avec le réglage actuel du seuil du rouge. */
export function coachRules(recap: WeeklyRecapSettings, machines: readonly CardioMachine[]): string[] {
  const noLegs = machines.filter((m) => !machineCountsForLegs(m)).map((m) => m.name.toLowerCase());
  return [
    'Statut de chaque performance (un exercice dans une séance), première règle qui s’applique : moins de séries que prévu → orange ; au moins 2 séries sous la cible → rouge ; ressenti « très mal » → rouge ; exactement 1 série sous la cible → orange ; toutes les séries à la cible avec un ressenti « moyen », « mal » ou « non renseigné » → orange ; toutes à la cible avec « bien » ou « très bien » → vert. Les répétitions ne dépassent jamais la cible : l’utilisateur s’arrête à la cible, même s’il pourrait en faire plus.',
    'Progression, par exercice et par suivi : 3 séries de 8 à 12 répétitions par défaut (réglage propre à chaque exercice sinon, « plage »). Palier = charge + cible. 2 séances vertes consécutives et standard au même palier → cible +1 répétition, même charge. À la cible haute (12), 2 vertes → « poids supérieur » : l’utilisateur choisit la nouvelle charge (l’appli ne propose jamais de valeur) et repart à 8 répétitions. 4 séances rouges au même poids (« série de rouges en cours ») → « poids inférieur », cible conservée ; de 1 à 3 rouges, rien ne change. Une séance orange « mal » ne coupe pas la série de rouges ; une verte, ou une autre orange complète, la remet à 0.',
    'Séance standard : complète, avec le nombre de séries standard et la cible attendue. Une séance non standard (séries ou cible changées à la main, recommandation refusée) ne valide jamais rien. Séance de départ : charge changée sans que l’appli le recommande ; nouveau palier, elle ne valide rien, la suivante peut valider.',
    'Types d’exercice : « charge » (charge_kg) ; « haltères » : charge_kg_par_haltere est la charge d’UN haltère, jamais le total des deux ; « assisté » (dips et tractions assistés) : aide_kg est une aide, moins d’aide = plus dur, « moins d’aide » remplace « poids supérieur » ; « poids du corps » : pas de charge, progression par les répétitions (10 à 40 par défaut) ; « durée » (gainage) : cible et séries en secondes, progression de 5 s. Ne jamais additionner ni comparer les charges de deux exercices différents.',
    'Salle et maison : un exercice à charge a deux suivis séparés (haltères légers à la maison, charges non comparables), la maison avec une plage de 8 à 15 répétitions ; au poids du corps et en durée, un seul suivi. À la maison, l’heure et la durée ne sont pas significatives (séance souvent saisie après coup) : elles ne sont pas données.',
    `Séries par semaine (lundi – dimanche) et par groupe : chaque série d’un exercice dont c’est le groupe principal compte 1, groupe secondaire ½ ; salle et maison comptent pareil ; chaque activité confirmée (badminton…) compte ${ACTIVITY_SETS} séries pour chacun de ses groupes ; ${LEG_CARDIO_MINUTES} min de cardio ou plus dans la semaine comptent ${LEG_CARDIO_SETS} séries pour les jambes, une fois par semaine${noLegs.length > 0 ? ` (sauf ${noLegs.join(', ')})` : ''}.`,
    `Couleur du récapitulatif de la semaine, par groupe, d’après ses séries : vert sous ${ORANGE_SETS}, orange de ${ORANGE_SETS} jusqu’au seuil du rouge, rouge à partir de ${recap.redSets} séries (réglage actuel de l’utilisateur, 10 par défaut). Ici, rouge = volume de la semaine atteint, vert = groupe peu ou pas travaillé : ces couleurs ne jugent pas la qualité, contrairement aux statuts des performances.`,
    'Indice de progression d’un groupe (base 100) : force estimée (formule d’Epley, sur la moins bonne série) de chaque exercice dont c’est le groupe principal, rapportée à sa première séance complète, puis moyenne des exercices ; séances à la salle seulement ; exercices assistés : charge réelle = poids du corps − aide. L’appli ne l’affiche qu’à partir de 6 séances sur 3 semaines (« indice_seuil_atteint »). Pas d’indice pour les abdominaux.',
    'Alerte « groupe moins travaillé » : les séries des 2 dernières semaines terminées sont toutes les deux sous la moyenne des semaines d’avant (4 semaines de référence au moins).',
    `Séance pour compléter la semaine : proposée par l’appli pour amener les groupes du récapitulatif à ${recap.redSets} séries, avec des exercices déjà faits à la salle ; ${SUGGEST_MAX} exercices au plus, 2 par groupe, les groupes travaillés à la salle la veille écartés, les abdominaux en bonus.`,
    'Ressentis : très bien, bien, moyen, mal, très mal, non renseigné (« symbole » : symbole d’origine d’une séance importée de notes, « += » = moyen). Une performance « partielle » (importée, charge sans répétitions) n’a pas de statut.',
  ];
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
  const alertes = input.recap.groups
    .filter((g) => GROUP_VIEW_GROUPS.includes(g))
    .map((g) => groupAlert(sessions, input.exercises, g, end))
    .filter((a) => a !== null)
    .map((a) => ({
      groupe: groupLabel(a.group),
      series_2_dernieres_semaines: a.recent.map(round1),
      moyenne_avant: round1(a.average),
      texte: `${groupLabel(a.group)} : ${alertFigures(a)}`.replace(/ | /g, ' '),
      ...(input.ignoredAlerts[a.group] === a.week ? { ignoree_sur_l_appareil: true } : {}),
    }));
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

// ——— JSON compact et lisible ———————————————————————————————————————

/** Largeur au-delà de laquelle un objet ou une liste passe sur plusieurs lignes… */
const LINE_WIDTH = 110;
/** … sauf un objet sans sous-objet (une performance, une semaine de séries), gardé sur une ligne jusqu'à cette longueur. */
const RECORD_WIDTH = 360;

function inline(value: unknown): string {
  if (Array.isArray(value)) return value.length === 0 ? '[]' : `[${value.map(inline).join(', ')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    return entries.length === 0 ? '{}' : `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(', ')} }`;
  }
  return JSON.stringify(value);
}

/** Objet dont les valeurs sont des nombres, des textes ou des listes de nombres et de textes. */
function isFlatRecord(value: object): boolean {
  return (
    !Array.isArray(value) &&
    Object.values(value).every((v) => v === null || typeof v !== 'object' || (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object')))
  );
}

/**
 * JSON indenté, mais une liste ou un objet qui tient sur une ligne y reste, et une performance (objet sans sous-objet)
 * aussi : lisible sans défiler, nettement plus court qu'un JSON indenté partout. Se relit avec JSON.parse.
 */
export function coachJson(value: unknown, indent = ''): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const flat = inline(value);
  if (indent.length + flat.length <= LINE_WIDTH || (isFlatRecord(value) && indent.length + flat.length <= RECORD_WIDTH)) return flat;
  const inner = `${indent}  `;
  if (Array.isArray(value)) return `[\n${value.map((v) => inner + coachJson(v, inner)).join(',\n')}\n${indent}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${coachJson(v, inner)}`).join(',\n')}\n${indent}}`;
}

/** Texte du fichier. */
export function coachExportText(input: CoachInput): string {
  return `${coachJson(buildCoachExport(input))}\n`;
}
