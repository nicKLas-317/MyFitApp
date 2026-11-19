/**
 * Alerte « articulation trop sollicitée » (§19.14, version 1.53.0). Chaque exercice sollicite une ou plusieurs
 * articulations (épaule, coude, genou) : une série compte 1 pour une articulation très sollicitée, ½ pour une
 * articulation sollicitée moins directement (correspondance validée par l'utilisateur, `EXERCISE_JOINTS`). Une
 * articulation est en alerte quand ses séries de la dernière semaine terminée dépassent la moyenne des 4 semaines
 * précédentes d'au moins 50 % et d'au moins 5 séries, avec au moins 10 séries ; muette tant qu'il n'y a pas 4 semaines
 * terminées avant elle. Calcul pur, refait à l'affichage à partir des séances terminées ; jamais stocké, aucun effet sur
 * le moteur.
 */
import { activityStart, doneActivities, type ActivityRecord } from '../activities/model';
import { cardioOf } from '../cardio/model';
import { localDate, sessionStartTime } from '../domain/calendar';
import type { CardioMachine, Exercise, MuscleGroup, Session } from '../domain/types';
import { normalizeName } from '../library/text';
import { formatDecimal } from '../session/format';
import { periodContaining, shiftPeriod } from './reportPeriod';
import { ACTIVITY_SETS } from './weekly';

export type Joint = 'epaule' | 'coude' | 'genou';

/** Les trois articulations suivies, dans l'ordre d'affichage à écart égal. */
export const JOINTS: readonly Joint[] = ['epaule', 'coude', 'genou'];

export const JOINT_LABELS: Record<Joint, string> = { epaule: 'Épaule', coude: 'Coude', genou: 'Genou' };

/** Semaines terminées de référence, avant la semaine regardée. */
export const JOINT_HISTORY_WEEKS = 4;
/** Hausse minimale par rapport à la moyenne : +50 %. */
export const JOINT_RISE_RATIO = 1.5;
/** Hausse minimale, en séries. */
export const JOINT_RISE_SETS = 5;
/** Plancher : jamais d'alerte sous 10 séries dans la semaine. */
export const JOINT_FLOOR_SETS = 10;
/** Footing sur tapis : 3 séries pour le genou à partir de 15 min cumulées dans la semaine (une fois par semaine). */
export const FOOTING_MINUTES = 15;
export const FOOTING_SETS = 3;

/** Poids d'un exercice pour chaque articulation : 1 (très sollicitée) ou ½ (moins directement) ; absente = 0. */
export type JointWeights = Partial<Record<Joint, number>>;

const H = 0.5;
const SHOULDER_ELBOW_HALF: JointWeights = { epaule: 1, coude: H };
const SHOULDER: JointWeights = { epaule: 1 };
const ELBOW: JointWeights = { coude: 1 };
const KNEE: JointWeights = { genou: 1 };
const ROW: JointWeights = { epaule: H, coude: H };
const NONE: JointWeights = {};

/**
 * Correspondance des exercices de la bibliothèque (par identifiant d'exercice : toutes ses variantes et prises ont la
 * même), validée par l'utilisateur le 19 novembre 2026, cas douteux compris.
 */
export const EXERCISE_JOINTS: Readonly<Record<string, JointWeights>> = {
  // Pectoraux.
  'chest-press': SHOULDER_ELBOW_HALF,
  'developpe-couche': SHOULDER_ELBOW_HALF,
  'developpe-couche-halteres': SHOULDER_ELBOW_HALF,
  'developpe-incline': SHOULDER_ELBOW_HALF,
  pompes: SHOULDER_ELBOW_HALF,
  'pec-deck': SHOULDER,
  'ecarte-couche-halteres': SHOULDER,
  'ecarte-poulie': SHOULDER,
  // Épaules.
  'developpe-epaules-machine': SHOULDER_ELBOW_HALF,
  'developpe-militaire-halteres': SHOULDER_ELBOW_HALF,
  'elevations-laterales': SHOULDER,
  'elevations-laterales-machine': SHOULDER,
  'elevations-frontales': SHOULDER,
  oiseau: SHOULDER,
  'face-pull': SHOULDER,
  // Dos.
  'tirage-vertical': SHOULDER_ELBOW_HALF,
  'tractions-assistees': { epaule: 1, coude: 1 },
  'tirage-horizontal': ROW,
  'tirage-horizontal-poulie-basse': ROW,
  'rowing-barre': ROW,
  'rowing-haltere': ROW,
  'pull-over-poulie': SHOULDER,
  shrugs: NONE,
  'lombaires-banc': NONE,
  // Triceps.
  'dips-assistes': { epaule: 1, coude: 1 },
  'extension-triceps-haltere-assis': { coude: 1, epaule: H },
  'extension-triceps-poulie': ELBOW,
  'barre-au-front': ELBOW,
  kickback: ELBOW,
  // Biceps.
  'curl-biceps-banc-incline': { coude: 1, epaule: H },
  'curl-biceps-barre-droite': ELBOW,
  'curl-biceps-barre-ez': ELBOW,
  'curl-biceps-halteres': ELBOW,
  'curl-biceps-poulie-corde': ELBOW,
  'curl-marteau': ELBOW,
  'curl-pupitre': ELBOW,
  // Jambes.
  'presse-a-cuisses': KNEE,
  'leg-extension': KNEE,
  'leg-curl': KNEE,
  'curl-ischios': KNEE,
  'squat-kettlebell': KNEE,
  'hack-squat': KNEE,
  chaise: KNEE,
  'mollets-machine': NONE,
  'abducteurs-machine': NONE,
  'adducteurs-machine': NONE,
  // Abdominaux.
  'crunch-machine': NONE,
  'crunch-sol': NONE,
  'crunch-oblique-touche-talons': NONE,
  'releves-jambes-allonge': NONE,
  planche: NONE,
};

/**
 * Articulation d'un groupe, pour un exercice personnalisé et pour une activité (choix de l'utilisateur : déduites de
 * leurs groupes, sans champ nouveau). Dos, abdominaux, mollets, fessiers et adducteurs : aucune.
 */
export const GROUP_JOINT: Partial<Record<MuscleGroup, Joint>> = {
  pectoraux: 'epaule',
  epaules: 'epaule',
  biceps: 'coude',
  triceps: 'coude',
  jambes: 'genou',
  quadriceps: 'genou',
  'ischio-jambiers': 'genou',
};

/**
 * Articulations d'un exercice : la correspondance de la bibliothèque, sinon (exercice personnalisé, ou ajouté à la
 * bibliothèque sans correspondance) déduites de ses groupes : groupe principal 1, groupes secondaires ½.
 */
export function exerciseJoints(exercise: Pick<Exercise, 'id' | 'primaryGroup' | 'secondaryGroups'>): JointWeights {
  const known = EXERCISE_JOINTS[exercise.id];
  if (known) return known;
  const out: JointWeights = {};
  const add = (g: MuscleGroup, w: number) => {
    const j = GROUP_JOINT[g];
    if (j) out[j] = Math.max(out[j] ?? 0, w);
  };
  for (const g of exercise.secondaryGroups) add(g, H);
  add(exercise.primaryGroup, 1);
  return out;
}

/** Articulations d'une activité, déduites de ses groupes (badminton : épaule et genou ; futsal : genou). */
export function activityJoints(groups: readonly MuscleGroup[]): Joint[] {
  const found = new Set(groups.map((g) => GROUP_JOINT[g]).filter((j): j is Joint => !!j));
  return JOINTS.filter((j) => found.has(j));
}

/** Footing sur tapis : une machine dont le nom parle de course (« Tapis - footing »). Choix signalé à l'utilisateur. */
export function isFootingMachine(name: string): boolean {
  return /\b(footing|jogging|running|course)\b/.test(normalizeName(name));
}

/**
 * Séries de chaque articulation sur une période : séries enregistrées × poids de l'exercice (salle et maison en entier,
 * sans les performances partielles), 3 par activité confirmée pour chacune de ses articulations, 3 pour le genou à
 * partir de 15 min de footing. Séances terminées dont le début est dans la période.
 */
export function jointSets(
  sessions: readonly Session[],
  exercises: readonly Exercise[],
  inPeriod: (time: number) => boolean,
  activities: readonly ActivityRecord[] = [],
  machines: readonly CardioMachine[] = [],
): Record<Joint, number> {
  const weights = new Map<string, JointWeights>();
  for (const e of exercises) {
    const w = exerciseJoints(e);
    for (const v of e.variants) weights.set(v.id, w);
  }
  const names = new Map(machines.map((m) => [m.id, m.name]));
  const out: Record<Joint, number> = { epaule: 0, coude: 0, genou: 0 };
  let footing = 0;
  for (const s of sessions) {
    if (s.state !== 'done' || !inPeriod(sessionStartTime(s))) continue;
    for (const p of s.performances) {
      const w = weights.get(p.variantId);
      if (!w || p.partial) continue;
      for (const j of JOINTS) out[j] += p.reps.length * (w[j] ?? 0);
    }
    for (const b of cardioOf(s)) if (isFootingMachine(names.get(b.machineId) ?? b.machine)) footing += b.minutes;
  }
  for (const a of doneActivities(activities)) {
    if (!inPeriod(activityStart(a))) continue;
    for (const j of activityJoints(a.groups)) out[j] += ACTIVITY_SETS;
  }
  if (footing >= FOOTING_MINUTES) out.genou += FOOTING_SETS;
  return out;
}

export interface JointInput {
  sessions: readonly Session[];
  exercises: readonly Exercise[];
  activities?: readonly ActivityRecord[];
  machines?: readonly CardioMachine[];
  now: number;
}

/** Une articulation sur la dernière semaine terminée, comparée aux 4 précédentes. */
export interface JointFigure {
  joint: Joint;
  /** Lundi de la dernière semaine terminée (« YYYY-MM-DD ») : la clé de la croix. */
  week: string;
  /** Séries de la dernière semaine terminée. */
  sets: number;
  /** Moyenne des 4 semaines précédentes (semaines vides comprises). */
  average: number;
  alert: boolean;
}

/** Le seuil de la règle : au moins +50 %, au moins +5 séries, au moins 10 séries. */
export function isJointRise(sets: number, average: number): boolean {
  return sets >= JOINT_RISE_RATIO * average && sets - average >= JOINT_RISE_SETS && sets >= JOINT_FLOOR_SETS;
}

/**
 * Les trois articulations sur la dernière semaine terminée, ou null tant qu'il n'y a pas 4 semaines terminées avant elle
 * depuis la semaine de la première séance terminée. La semaine en cours n'entre jamais dans le calcul (l'alerte change
 * le lundi à 0 h 00).
 */
export function jointFigures(input: JointInput): JointFigure[] | null {
  const done = input.sessions.filter((s) => s.state === 'done');
  if (done.length === 0) return null;
  const first = Math.min(...done.map(sessionStartTime));
  const current = periodContaining('week', input.now);
  const weeks = Array.from({ length: JOINT_HISTORY_WEEKS + 1 }, (_, i) => shiftPeriod(current, i - JOINT_HISTORY_WEEKS - 1));
  if (weeks[0]!.start.getTime() < periodContaining('week', first).start.getTime()) return null;
  const sets = weeks.map((w) =>
    jointSets(done, input.exercises, (t) => t >= w.start.getTime() && t < w.next.getTime(), input.activities ?? [], input.machines ?? []),
  );
  const last = sets.at(-1)!;
  const week = localDate(weeks.at(-1)!.start.getTime());
  return JOINTS.map((joint) => {
    const average = sets.slice(0, -1).reduce((s, x) => s + x[joint], 0) / JOINT_HISTORY_WEEKS;
    return { joint, week, sets: last[joint], average, alert: isJointRise(last[joint], average) };
  });
}

export type JointAlert = JointFigure;

/** Articulations en alerte, de la plus forte hausse (en séries) à la plus faible, puis épaule, coude, genou. */
export function jointAlertCandidates(input: JointInput): JointAlert[] {
  return (jointFigures(input) ?? [])
    .filter((f) => f.alert)
    .sort((a, b) => b.sets - b.average - (a.sets - a.average) || JOINTS.indexOf(a.joint) - JOINTS.indexOf(b.joint));
}

/** Articulations ignorées sur l'appareil : articulation → dernière semaine terminée au moment de la croix. */
export type IgnoredJointAlerts = Partial<Record<Joint, string>>;

export function sanitizeIgnoredJointAlerts(value: unknown): IgnoredJointAlerts {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: IgnoredJointAlerts = {};
  for (const [joint, week] of Object.entries(value as Record<string, unknown>)) {
    if (JOINTS.includes(joint as Joint) && typeof week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(week)) out[joint as Joint] = week;
  }
  return out;
}

/** Articulations citées par le bandeau : toutes celles en alerte, sans celles ignorées pour la même semaine. */
export function jointAlerts(input: JointInput, ignored: IgnoredJointAlerts = {}): JointAlert[] {
  return jointAlertCandidates(input).filter((a) => ignored[a.joint] !== a.week);
}

/**
 * La croix : chaque articulation citée est masquée tant que la dernière semaine terminée reste celle-ci, c'est-à-dire
 * jusqu'au lundi 0 h 00 suivant ; elle revient si la nouvelle semaine terminée est encore en hausse.
 */
export function ignoreJointAlerts(ignored: IgnoredJointAlerts, alerts: readonly JointAlert[]): IgnoredJointAlerts {
  const next = { ...ignored };
  for (const a of alerts) next[a.joint] = a.week;
  return next;
}

/** « 18 séries contre 11 d'habitude » : la moyenne arrondie à l'entier (choix de l'utilisateur). */
export function jointFigureText(a: Pick<JointFigure, 'sets' | 'average'>): string {
  return `${formatDecimal(a.sets)} séries contre ${Math.round(a.average)} d’habitude`;
}

/** Conseil, dans le bilan de la semaine et le mail seulement (pas de place sur le bandeau, choix de l'utilisateur). */
export const JOINT_ADVICE = 'Échauffe-toi bien et surveille les douleurs.';

/**
 * Texte du bandeau, en deux parties : les noms (en gras) et le reste, court pour tenir sur 3 lignes à 320 px dans le
 * cas le plus chargé (§3.7, choix de l'utilisateur) : une articulation, « Coude » et « 18 séries contre 11 d’habitude » ;
 * plusieurs, « Épaule, Coude » et « forte hausse ». Ni conseil ni « la semaine dernière ».
 */
export function jointBanner(alerts: readonly JointAlert[]): { names: string; rest: string } {
  const names = alerts.map((a) => JOINT_LABELS[a.joint]).join(', ');
  return { names, rest: alerts.length === 1 ? jointFigureText(alerts[0]!) : 'forte hausse' };
}

/**
 * Ligne du bilan de la semaine terminée (écran et mail), la phrase complète avec le conseil : « Coude : forte hausse
 * cette semaine (18 séries contre 11 d’habitude). Échauffe-toi bien et surveille les douleurs. » ; plusieurs : « Épaule,
 * Coude : forte hausse cette semaine (Épaule 30 contre 19, Coude 28 contre 18). Échauffe-toi… ». `screen` : espaces insécables gardés (écran du bilan).
 */
export function jointReportText(alerts: readonly JointAlert[], screen = false): string {
  const nb = '\u00a0';
  const names = alerts.map((a) => JOINT_LABELS[a.joint]).join(', ');
  const detail =
    alerts.length === 1
      ? jointFigureText(alerts[0]!)
      : alerts.map((a) => `${JOINT_LABELS[a.joint]}${nb}${formatDecimal(a.sets)} contre ${Math.round(a.average)}`).join(', ');
  const text = `${names}${nb}: forte hausse cette semaine (${detail}). ${JOINT_ADVICE}`;
  // À l'écran, espaces insécables gardés (« 18 séries » d'un bloc) ; dans le mail, texte simple.
  return screen ? text : text.replace(/\u00a0/g, ' ');
}
