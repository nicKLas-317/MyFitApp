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
  | 'abdominaux';

/** Réglages spécifiques d'un exercice-variante (§7.2). Absent = valeurs par défaut. */
export interface VariantConfig {
  sets: number;
  minReps: number;
  maxReps: number;
}

/** Exercice-variante : unité d'historique et de progression (§4.3, §7.1). */
export interface Variant {
  /** Identifiant interne stable, indépendant du nom. */
  id: string;
  name: string;
  synonyms: string[];
  config?: Partial<VariantConfig>;
  archived: boolean;
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
  /** Historique partiel (§11.8, §7.11 H) : ignoré par le moteur. */
  partial?: boolean;
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
}
