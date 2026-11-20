/**
 * Sous-groupes musculaires (§19.15, version 1.54.0) : quelle partie de chaque groupe a été travaillée. Une série compte
 * 1 pour un sous-groupe visé, ½ pour un sous-groupe sollicité moins directement (correspondance validée par
 * l'utilisateur, `EXERCISE_SUB_GROUPS`) ; les sous-groupes se comptent indépendamment : une répartition, pas une
 * décomposition exacte des séries du groupe. Salle et maison pareil ; ni activités ni cardio. Exercice personnalisé sans
 * correspondance : déduction par mots-clés du nom, puis par ses groupes, puis répartition égale ; jamais « non précisé ».
 * Calcul pur, refait à l'affichage ; jamais stocké, aucun effet sur le moteur.
 */
import { sessionStartTime } from '../domain/calendar';
import { LEG_SUBGROUPS, MAIN_GROUPS, parentGroup } from '../domain/muscleGroups';
import type { Exercise, MuscleGroup, Session, Variant } from '../domain/types';
import { normalizeName } from '../library/text';
import { formatDecimal } from '../session/format';
import { periodContaining, shiftPeriod } from './reportPeriod';

export type SubGroup =
  | 'pec-haut' | 'pec-milieu' | 'pec-bas'
  | 'dos-largeur' | 'dos-epaisseur' | 'dos-lombaires'
  | 'ep-avant' | 'ep-cote' | 'ep-arriere'
  | 'bi-longue' | 'bi-courte' | 'bi-brachial'
  | 'tri-longue' | 'tri-laterale' | 'tri-mediale'
  | 'quadriceps' | 'ischio-jambiers' | 'fessiers' | 'adducteurs' | 'mollets'
  | 'abdo-droit' | 'abdo-obliques' | 'abdo-transverse';

export interface SubGroupInfo {
  id: SubGroup;
  /** Libellé des barres (« Longue portion »). */
  label: string;
  /** Libellé court, dans une ligne de texte (« longue »). */
  short: string;
}

const sg = (id: SubGroup, label: string, short = label.toLowerCase()): SubGroupInfo => ({ id, label, short });

/** Sous-groupes de chaque groupe principal, dans leur ordre d'affichage. */
export const SUB_GROUPS: Record<string, readonly SubGroupInfo[]> = {
  pectoraux: [sg('pec-haut', 'Haut'), sg('pec-milieu', 'Milieu'), sg('pec-bas', 'Bas')],
  dos: [sg('dos-largeur', 'Largeur'), sg('dos-epaisseur', 'Épaisseur'), sg('dos-lombaires', 'Lombaires')],
  epaules: [sg('ep-avant', 'Avant'), sg('ep-cote', 'Côté'), sg('ep-arriere', 'Arrière')],
  biceps: [sg('bi-longue', 'Longue portion', 'longue'), sg('bi-courte', 'Courte portion', 'courte'), sg('bi-brachial', 'Brachial / avant-bras', 'brachial')],
  triceps: [sg('tri-longue', 'Longue portion', 'longue'), sg('tri-laterale', 'Portion latérale', 'latérale'), sg('tri-mediale', 'Portion médiale', 'médiale')],
  jambes: [sg('quadriceps', 'Quadriceps'), sg('ischio-jambiers', 'Ischio-jambiers'), sg('fessiers', 'Fessiers'), sg('adducteurs', 'Adducteurs'), sg('mollets', 'Mollets')],
  abdominaux: [sg('abdo-droit', 'Grand droit'), sg('abdo-obliques', 'Obliques'), sg('abdo-transverse', 'Transverse')],
};

/** Sous-groupes d'un groupe (« jambes » pour un sous-groupe des jambes). */
export function subGroupsOf(group: MuscleGroup): readonly SubGroupInfo[] {
  return SUB_GROUPS[parentGroup(group)] ?? [];
}

/** Groupe principal d'un sous-groupe. */
export function groupOfSubGroup(sub: SubGroup): MuscleGroup {
  return MAIN_GROUPS.find((g) => SUB_GROUPS[g]?.some((s) => s.id === sub))!;
}

/** Poids de chaque sous-groupe pour une série : 1 ou ½ (une fraction en cas de répartition égale). */
export type SubGroupWeights = Partial<Record<SubGroup, number>>;

const H = 0.5;

/**
 * Correspondance des exercices de la bibliothèque, par identifiant d'exercice (toutes ses variantes et prises), validée
 * par l'utilisateur le 19 novembre 2026, avec les groupes secondaires (règle du §19.15 : ½ au sous-groupe que le
 * mouvement sollicite). Et ses cinq exercices personnalisés, leur correspondance exacte (demande de l'utilisateur).
 */
export const EXERCISE_SUB_GROUPS: Readonly<Record<string, SubGroupWeights>> = {
  // Pectoraux (triceps et épaules en secondaire : portion latérale ½, épaule avant ½).
  'chest-press': { 'pec-milieu': 1, 'tri-laterale': H, 'ep-avant': H },
  'developpe-couche': { 'pec-milieu': 1, 'tri-laterale': H, 'ep-avant': H },
  'developpe-couche-halteres': { 'pec-milieu': 1, 'tri-laterale': H, 'ep-avant': H },
  'developpe-incline': { 'pec-haut': 1, 'tri-laterale': H, 'ep-avant': H },
  pompes: { 'pec-milieu': 1, 'tri-laterale': H, 'ep-avant': H },
  'pec-deck': { 'pec-milieu': 1 },
  'ecarte-couche-halteres': { 'pec-milieu': 1 },
  // Vis-à-vis aux poulies hautes, de haut en bas (choix signalé à l'utilisateur).
  'ecarte-poulie': { 'pec-bas': 1 },
  // Dos (biceps en secondaire : brachial ½ ; tirages horizontaux et rowings : arrière d'épaule ½, exception validée).
  'tirage-vertical': { 'dos-largeur': 1, 'bi-brachial': H },
  'tractions-assistees': { 'dos-largeur': 1, 'bi-brachial': H },
  'pull-over-poulie': { 'dos-largeur': 1 },
  'tirage-horizontal': { 'dos-epaisseur': 1, 'ep-arriere': H, 'bi-brachial': H },
  'tirage-horizontal-poulie-basse': { 'dos-epaisseur': 1, 'ep-arriere': H, 'bi-brachial': H },
  'rowing-barre': { 'dos-epaisseur': 1, 'ep-arriere': H, 'bi-brachial': H },
  'rowing-haltere': { 'dos-largeur': H, 'dos-epaisseur': H, 'ep-arriere': H, 'bi-brachial': H },
  shrugs: { 'dos-epaisseur': 1 },
  'lombaires-banc': { 'dos-lombaires': 1 },
  // Épaules (triceps en secondaire : portion latérale ½ ; dos en secondaire : épaisseur ½).
  'developpe-epaules-machine': { 'ep-avant': 1, 'ep-cote': H, 'tri-laterale': H },
  'developpe-militaire-halteres': { 'ep-avant': 1, 'ep-cote': H, 'tri-laterale': H },
  'elevations-laterales': { 'ep-cote': 1 },
  'elevations-laterales-machine': { 'ep-cote': 1 },
  'elevations-frontales': { 'ep-avant': 1 },
  oiseau: { 'ep-arriere': 1, 'dos-epaisseur': H },
  'face-pull': { 'ep-arriere': 1, 'dos-epaisseur': H },
  // Biceps.
  'curl-biceps-banc-incline': { 'bi-longue': 1 },
  'curl-pupitre': { 'bi-courte': 1 },
  'curl-biceps-poulie-corde': { 'bi-brachial': 1, 'bi-longue': H },
  'curl-marteau': { 'bi-brachial': 1, 'bi-longue': H },
  'curl-biceps-barre-droite': { 'bi-longue': H, 'bi-courte': H },
  'curl-biceps-barre-ez': { 'bi-longue': H, 'bi-courte': H },
  'curl-biceps-halteres': { 'bi-longue': H, 'bi-courte': H },
  // Triceps (dips : pectoraux bas ½ et épaule avant ½ en secondaire).
  'extension-triceps-haltere-assis': { 'tri-longue': 1 },
  'extension-triceps-poulie': { 'tri-laterale': 1, 'tri-mediale': H },
  'barre-au-front': { 'tri-longue': H, 'tri-laterale': H },
  kickback: { 'tri-longue': H, 'tri-laterale': H },
  'dips-assistes': { 'tri-laterale': H, 'tri-mediale': H, 'pec-bas': H, 'ep-avant': H },
  // Jambes (la chaise : abdominaux en secondaire, transverse ½).
  'presse-a-cuisses': { quadriceps: 1, fessiers: H },
  'leg-extension': { quadriceps: 1 },
  'leg-curl': { 'ischio-jambiers': 1 },
  'curl-ischios': { 'ischio-jambiers': 1 },
  'squat-kettlebell': { quadriceps: 1, fessiers: H, adducteurs: H },
  'hack-squat': { quadriceps: 1, fessiers: H },
  chaise: { quadriceps: 1, 'abdo-transverse': H },
  'mollets-machine': { mollets: 1 },
  'abducteurs-machine': { fessiers: 1 },
  'adducteurs-machine': { adducteurs: 1 },
  // Abdominaux.
  'crunch-sol': { 'abdo-droit': 1 },
  'crunch-machine': { 'abdo-droit': 1 },
  'releves-jambes-allonge': { 'abdo-droit': 1 },
  'crunch-oblique-touche-talons': { 'abdo-obliques': 1 },
  planche: { 'abdo-transverse': 1, 'abdo-droit': H },
  // Exercices personnalisés de l'utilisateur (correspondance exacte demandée, 19 novembre 2026).
  'perso-ecarte-lateral-poulie': { 'ep-cote': 1 },
  'perso-lat-pulldown-machine': { 'dos-largeur': 1 },
  'perso-curl-bras-barre-prise-inversee': { 'bi-brachial': 1 },
  'perso-curl-goblet': { 'bi-longue': H, 'bi-courte': H },
  'perso-roue': { 'abdo-droit': 1, 'abdo-transverse': H },
};

/**
 * Mots-clés d'un groupe (nom de l'exercice et de la variante, normalisé : minuscules, sans accents), dans l'ordre : une
 * règle qui correspond donne ses poids et retire ses mots du nom (« de haut en bas » avant « haut ») ; `generic` ne
 * s'applique que si aucune autre règle n'a correspondu (« curl » seul) ; `stop` arrête les règles suivantes.
 */
interface KeywordRule {
  words: RegExp;
  weights: SubGroupWeights;
  generic?: boolean;
  /** Arrête les autres règles du groupe (« Mollets à la presse » : pas les quadriceps ; « Crunch oblique » : pas le grand droit). */
  stop?: boolean;
}

const w = (pattern: string) => new RegExp(`\\b(?:${pattern})\\b`, 'g');

export const KEYWORDS: Record<string, readonly KeywordRule[]> = {
  pectoraux: [
    { words: w('de haut en bas|haut en bas|high to low'), weights: { 'pec-bas': 1 } },
    { words: w('de bas en haut|bas en haut|low to high'), weights: { 'pec-haut': 1 } },
    { words: w('inclines?|inclinee?s?|incline|upper|haut'), weights: { 'pec-haut': 1 } },
    { words: w('declines?|declinee?s?|decline|lower|bas|dips?'), weights: { 'pec-bas': 1 } },
    { words: w('couches?|plat|flat|pec deck|butterfly|ecartes?|chest press|pompes?|push ?ups?|developpes?|press|fly'), weights: { 'pec-milieu': 1 }, generic: true },
  ],
  dos: [
    { words: w('lombaires?|hyperextensions?|extensions? (?:du )?dos|back extensions?|good mornings?'), weights: { 'dos-lombaires': 1 } },
    { words: w('rowing haltere|dumbbell row'), weights: { 'dos-largeur': H, 'dos-epaisseur': H } },
    { words: w('pulldowns?|pull downs?|verticale?s?|tractions?|pull ?ups?|chin ?ups?|lats?|pull ?overs?|tirage nuque'), weights: { 'dos-largeur': 1 } },
    { words: w('rowings?|rows?|horizontale?s?|tirage poitrine|t ?bar|shrugs?|trapezes?|haussements?'), weights: { 'dos-epaisseur': 1 } },
  ],
  epaules: [
    { words: w('oiseau|face ?pull|arriere|reverse|rear|posterieure?s?|deltoides? posterieurs?'), weights: { 'ep-arriere': 1 } },
    { words: w('laterale?s?|lateraux|lateral|side|y raise'), weights: { 'ep-cote': 1 } },
    { words: w('frontale?s?|frontaux|front|avant|anterieure?s?'), weights: { 'ep-avant': 1 } },
    { words: w('developpes?|press|militaire|military|arnold'), weights: { 'ep-avant': 1, 'ep-cote': H } },
  ],
  biceps: [
    { words: w('marteau|hammer|inverse|inversee?s?|reverse|cordes?|rope|zottman|brachial'), weights: { 'bi-brachial': 1 } },
    { words: w('pupitre|preacher|larry scott|concentration|spider'), weights: { 'bi-courte': 1 } },
    { words: w('inclines?|inclinee?s?|incline|drag|bayesian'), weights: { 'bi-longue': 1 } },
    { words: w('curls?'), weights: { 'bi-longue': H, 'bi-courte': H }, generic: true },
  ],
  triceps: [
    { words: w('au dessus de la tete|overhead|nuque|francais|french press|assise?'), weights: { 'tri-longue': 1 } },
    { words: w('barre au front|skull ?crushers?|kick ?backs?'), weights: { 'tri-longue': H, 'tri-laterale': H } },
    { words: w('dips?|banc|bench'), weights: { 'tri-laterale': H, 'tri-mediale': H } },
    { words: w('pushdowns?|push downs?|poulie|extensions?|cordes?|rope|barre'), weights: { 'tri-laterale': 1, 'tri-mediale': H }, generic: true },
  ],
  jambes: [
    { words: w('mollets?|calf|calves'), weights: { mollets: 1 }, stop: true },
    { words: w('adducteurs?|adduction|sumo'), weights: { adducteurs: 1 } },
    { words: w('abducteurs?|abduction|fessiers?|glutes?|hip thrusts?|pont|kick ?backs?'), weights: { fessiers: 1 } },
    { words: w('ischios?|ischio jambiers?|leg curls?|hamstrings?|jambes tendues|rdl|nordic|souleve de terre roumain'), weights: { 'ischio-jambiers': 1 } },
    { words: w('quadriceps?|quadri|leg extensions?|leg press|squats?|presses?|fentes?|lunges?|hack|chaise|wall sit|step ups?|sissy'), weights: { quadriceps: 1 } },
  ],
  abdominaux: [
    { words: w('obliques?|russian twist|rotations?|touche talons?|bucheron|woodchoppers?|lateral|laterale?s?'), weights: { 'abdo-obliques': 1 }, stop: true },
    { words: w('roue|ab wheel|rollouts?'), weights: { 'abdo-droit': 1, 'abdo-transverse': H } },
    { words: w('gainage|planches?|planks?|vacuum|dead bug|hollow'), weights: { 'abdo-transverse': 1, 'abdo-droit': H } },
    { words: w('crunchs?|releves?|leg raises?|sit ?ups?|enroulements?'), weights: { 'abdo-droit': 1 } },
  ],
};

/**
 * Sous-groupe d'un groupe secondaire sans mot-clé (règle du §19.15, validée) : ½ au sous-groupe que sollicitent le plus
 * souvent les mouvements où ce groupe est secondaire (triceps des développés : portion latérale ; biceps des tirages :
 * brachial ; épaules des développés : avant ; pectoraux des dips : bas ; dos de l'oiseau : épaisseur ; abdominaux de la
 * chaise : transverse ; jambes : quadriceps).
 */
export const SECONDARY_SUB_GROUP: Record<string, SubGroup> = {
  pectoraux: 'pec-bas',
  dos: 'dos-epaisseur',
  epaules: 'ep-avant',
  biceps: 'bi-brachial',
  triceps: 'tri-laterale',
  jambes: 'quadriceps',
  abdominaux: 'abdo-transverse',
};

function add(out: SubGroupWeights, weights: SubGroupWeights, factor: number): void {
  for (const [k, v] of Object.entries(weights) as [SubGroup, number][]) out[k] = Math.max(out[k] ?? 0, v * factor);
}

/** Règles de mots-clés d'un groupe appliquées au nom : les poids trouvés (vide si aucun mot-clé). */
function byKeywords(group: MuscleGroup, text: string): SubGroupWeights {
  const out: SubGroupWeights = {};
  let rest = ` ${text} `;
  let found = false;
  for (const rule of KEYWORDS[group] ?? []) {
    if (rule.generic && found) continue;
    rule.words.lastIndex = 0;
    if (!rule.words.test(rest)) continue;
    add(out, rule.weights, 1);
    found = true;
    if (rule.stop) break;
    rest = rest.replace(rule.words, ' ');
  }
  return out;
}

/**
 * Déduction pour un exercice sans correspondance (exercice personnalisé, futur exercice de la bibliothèque), d'après le
 * nom de l'exercice et de la variante : groupe principal, les mots-clés de son groupe (poids 1), sinon les sous-groupes
 * des jambes parmi ses groupes (principal 1, secondaires ½), sinon une répartition égale entre les sous-groupes du
 * groupe ; chaque groupe secondaire, ses mots-clés à ½, sinon ½ au sous-groupe de la règle des groupes secondaires.
 */
export function deduceSubGroups(exercise: Pick<Exercise, 'name' | 'primaryGroup' | 'secondaryGroups'>, variantName = ''): SubGroupWeights {
  const text = normalizeName(`${exercise.name} ${variantName}`);
  const primary = parentGroup(exercise.primaryGroup);
  const out: SubGroupWeights = {};
  const own = byKeywords(primary, text);
  if (Object.keys(own).length > 0) add(out, own, 1);
  else if (primary === 'jambes' && [exercise.primaryGroup, ...exercise.secondaryGroups].some((g) => LEG_SUBGROUPS.includes(g))) {
    for (const g of exercise.secondaryGroups) if (LEG_SUBGROUPS.includes(g)) add(out, { [g as SubGroup]: H }, 1);
    if (LEG_SUBGROUPS.includes(exercise.primaryGroup)) add(out, { [exercise.primaryGroup as SubGroup]: 1 }, 1);
    if (Object.keys(out).length > 0 && !LEG_SUBGROUPS.includes(exercise.primaryGroup)) {
      // Groupe principal « jambes », sous-groupes en secondaire : ce sont eux que l'exercice vise (comme la bibliothèque).
      for (const k of Object.keys(out) as SubGroup[]) out[k] = 1;
    }
  } else {
    const subs = SUB_GROUPS[primary] ?? [];
    for (const s of subs) out[s.id] = 1 / subs.length;
  }
  for (const g of new Set(exercise.secondaryGroups.map(parentGroup))) {
    if (g === primary || !SUB_GROUPS[g]) continue;
    const found = byKeywords(g, text);
    if (Object.keys(found).length > 0) add(out, found, H);
    else {
      // Version 1.56.0 : un sous-groupe des jambes déclaré en secondaire (ischio-jambiers, fessiers…) compte pour
      // lui-même ; avant, ramené à « jambes », il comptait pour les quadriceps.
      const legs = g === 'jambes' ? exercise.secondaryGroups.filter((x) => LEG_SUBGROUPS.includes(x)) : [];
      if (legs.length > 0) for (const x of legs) add(out, { [x as SubGroup]: 1 }, H);
      else add(out, { [SECONDARY_SUB_GROUP[g]!]: 1 }, H);
    }
  }
  return out;
}

/** Sous-groupes d'un exercice-variante : la correspondance, sinon la déduction. */
export function subGroupWeights(exercise: Pick<Exercise, 'id' | 'name' | 'primaryGroup' | 'secondaryGroups'>, variant?: Pick<Variant, 'name'>): SubGroupWeights {
  const known = EXERCISE_SUB_GROUPS[exercise.id];
  if (known) return known;
  const variantName = variant && variant.name !== 'Standard' ? variant.name : '';
  return deduceSubGroups(exercise, variantName);
}

/** Séries de chaque sous-groupe sur une période : séances terminées dont le début est dans la période, salle et maison. */
export function subGroupSets(sessions: readonly Session[], exercises: readonly Exercise[], inPeriod: (time: number) => boolean): Map<SubGroup, number> {
  const weights = new Map<string, SubGroupWeights>();
  for (const e of exercises) for (const v of e.variants) weights.set(v.id, subGroupWeights(e, v));
  const out = new Map<SubGroup, number>();
  for (const s of sessions) {
    if (s.state !== 'done' || !inPeriod(sessionStartTime(s))) continue;
    for (const p of s.performances) {
      const wt = weights.get(p.variantId);
      if (!wt || p.partial || p.reps.length === 0) continue;
      for (const [k, v] of Object.entries(wt) as [SubGroup, number][]) out.set(k, (out.get(k) ?? 0) + p.reps.length * v);
    }
  }
  return out;
}

/** Semaines regardées par « Par groupe musculaire » : les 4 dernières terminées. */
export const SUB_GROUP_WEEKS = 4;

export interface SubGroupRow extends SubGroupInfo {
  sets: number;
}

/** Les sous-groupes d'un groupe sur les 4 dernières semaines terminées (la semaine en cours n'y entre pas). */
export function recentSubGroups(sessions: readonly Session[], exercises: readonly Exercise[], group: MuscleGroup, now: number): { rows: SubGroupRow[]; from: Date; to: Date } {
  const current = periodContaining('week', now);
  const first = shiftPeriod(current, -SUB_GROUP_WEEKS);
  const sets = subGroupSets(sessions, exercises, (t) => t >= first.start.getTime() && t < current.start.getTime());
  return { rows: subGroupsOf(group).map((s) => ({ ...s, sets: sets.get(s.id) ?? 0 })), from: first.start, to: new Date(current.start.getTime() - 1) };
}

/** Une ligne par groupe : « Épaules : avant 7, côté 1,5, arrière 0 » (sans le nom du groupe, ajouté par l'appelant). */
export function subGroupLine(group: MuscleGroup, sets: ReadonlyMap<SubGroup, number>): string {
  return subGroupsOf(group)
    .map((s) => `${s.short} ${formatDecimal(sets.get(s.id) ?? 0)}`)
    .join(', ');
}
