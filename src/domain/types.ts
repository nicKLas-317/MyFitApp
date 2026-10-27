/** Ressenti global d'un exercice (§5.5, §7.3). */
export type Feeling = 'tres_mal' | 'mal' | 'moyen' | 'bien' | 'tres_bien' | 'inconnu';

/** Statut de progression : trois couleurs uniquement (§8). */
export type Status = 'vert' | 'orange' | 'rouge';

export type MuscleGroup =
  | 'dos'
  | 'pectoraux'
  | 'epaules'
  | 'biceps'
  | 'triceps'
  | 'jambes'
  | 'quadriceps'
  | 'ischio-jambiers'
  | 'mollets'
  | 'fessiers'
  | 'adducteurs'
  | 'abdominaux';

/** Réglages spécifiques d'un exercice-variante (§7.2). Absent = valeurs par défaut. */
export interface VariantConfig {
  sets: number;
  minReps: number;
  maxReps: number;
  /**
   * Exercice assisté (§7.12) : la charge saisie est une aide, plus elle est basse plus l'exercice est dur.
   * Le sens de la charge est inversé pour le moteur.
   */
  assisted: boolean;
  /**
   * Exercice au poids du corps (version 1.24.0) : aucune charge (enregistrée à 0), progression par les répétitions
   * seulement. Absent = exercice à charge.
   */
  bodyweight?: boolean;
  /**
   * Exercice en secondes (gainage, version 1.25.0) : toujours au poids du corps ; la « cible de répétitions » est une
   * durée en secondes par série, qui progresse par pas de 5 s. Absent = répétitions.
   */
  seconds?: boolean;
}

/** Exercice-variante : unité d'historique et de progression (§4.3, §7.1). */
export interface Variant {
  /** Identifiant interne stable, indépendant du nom. */
  id: string;
  name: string;
  synonyms: string[];
  config?: Partial<VariantConfig>;
  archived: boolean;
  /** Mis en avant quand la recherche est vide (§4.2). */
  favorite?: boolean;
}

export interface Exercise {
  /** Identifiant interne stable, indépendant du nom. */
  id: string;
  name: string;
  synonyms: string[];
  primaryGroup: MuscleGroup;
  secondaryGroups: MuscleGroup[];
  equipment: string;
  variants: Variant[];
  archived: boolean;
}

/** Performance d'un exercice-variante dans une séance (§7.1). */
export interface Performance {
  variantId: string;
  weightKg: number;
  /** null uniquement pour un historique partiel (§11.8). */
  targetReps: number | null;
  /** Séries prévues. null uniquement pour un historique partiel. */
  plannedSets: number | null;
  /** Répétitions réellement effectuées, une entrée par série enregistrée. */
  reps: number[];
  feeling: Feeling;
  /** Symbole de ressenti d'origine d'une performance importée (« += », « ++ »…), conservé tel quel. */
  feelingSymbol?: string;
  /** Historique partiel (§11.8, §7.11 H) : ignoré par le moteur. */
  partial?: boolean;
}

/** Inclinaison du tapis de marche, en trois niveaux, sans pourcentage. */
export type Incline = 'neutre' | 'moyenne' | 'haute';

/** Machine de cardio proposée à la saisie ; liste modifiable dans les réglages. */
export interface CardioMachine {
  /** Identifiant stable, indépendant du nom. */
  id: string;
  name: string;
  /** La machine se règle en inclinaison (tapis de marche). */
  incline: boolean;
}

/**
 * Bloc de cardio d'une séance : simple enregistrement, sans progression, couleur, ressenti ni calories.
 * Le nom de la machine est conservé tel qu'il était : renommer ou retirer une machine ne change pas l'historique.
 */
export interface CardioBlock {
  id: string;
  machineId: string;
  machine: string;
  /** Présente seulement pour une machine à inclinaison. */
  incline?: Incline;
  /** Durée en minutes entières. */
  minutes: number;
  distanceKm?: number;
}

export interface Session {
  id: string;
  name: string;
  /** Date locale de la séance, format YYYY-MM-DD. */
  date: string;
  /** Horodatage de début (ms epoch), null si inconnu (import). */
  startedAt: number | null;
  endedAt: number | null;
  /** Horodatage d'enregistrement dans l'application (ms epoch). */
  createdAt: number;
  /** Horodatage de la dernière modification (ms epoch). */
  updatedAt: number;
  origin: 'app' | 'import';
  state: 'active' | 'done';
  /** Texte original des notes importées (§11.8). */
  sourceText?: string;
  /** Dans l'ordre d'ajout (§5.2). Un seul exemplaire par exercice-variante. */
  performances: Performance[];
  /** Blocs de cardio dans l'ordre d'ajout ; absent quand la séance n'en contient pas. */
  cardio?: CardioBlock[];
  /** Séance démarrée à partir de la séance prévue (§5.9) ; absent pour une séance libre. */
  fromPlan?: PlanOrigin;
}

/**
 * Exercice d'une séance prévue (§5.9). Charge et cible ne sont jamais figées : le moteur les donne à la préparation
 * puis les recalcule au démarrage.
 */
export interface PlanExercise {
  kind: 'exercise';
  variantId: string;
  /** Poids de départ d'un exercice jamais réalisé, saisi à la préparation ; ignoré dès qu'il a un historique. */
  startWeightKg?: number;
}

/** Cardio d'une séance prévue, à valider en un appui pendant la séance. */
export interface PlanCardio {
  kind: 'cardio';
  block: CardioBlock;
}

/** Élément d'une séance prévue : musculation et cardio dans un seul ordre (version 1.23.2). */
export type PlanItem = PlanExercise | PlanCardio;

/** Séance prévue (§5.9) : une seule à la fois, proposée jusqu'à ce qu'une séance démarrée à partir d'elle soit terminée. */
export interface SessionPlan {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** Dans l'ordre prévu, musculation et cardio mêlés. Un seul exemplaire par exercice-variante et par bloc. */
  items: PlanItem[];
}

/** Place d'un élément prévu dans l'ordre de la séance démarrée. */
export type PlanStep = { kind: 'exercise'; variantId: string } | { kind: 'cardio'; id: string };

/** Origine d'une séance démarrée à partir de la séance prévue. */
export interface PlanOrigin {
  planId: string;
  /** Exercices prévus, dans l'ordre. */
  variantIds: string[];
  /** Cardio prévu ; un bloc validé est enregistré dans `cardio` sous le même identifiant. */
  cardio?: CardioBlock[];
  /**
   * Ordre prévu, musculation et cardio mêlés (depuis la version 1.23.2) : les mêmes exercices et blocs que `variantIds`
   * et `cardio`. Absent d'une séance antérieure : les exercices, puis le cardio.
   */
  order?: PlanStep[];
}
