import type { VariantConfig } from '../domain/types';

/** Nombre de validations vertes consécutives nécessaires pour progresser (§7.5, §7.6). */
export const GREEN_STREAK_TO_PROGRESS = 2;
/** Nombre de séances rouges consécutives déclenchant la baisse de charge (§7.8). */
export const RED_STREAK_TO_DECREASE = 4;

export const DEFAULT_VARIANT_CONFIG: VariantConfig = { sets: 3, minReps: 8, maxReps: 12, assisted: false };

/** Réglages du moteur : valeurs par défaut et réglages spécifiques par exercice-variante. */
export interface EngineSettings {
  defaults: VariantConfig;
  overrides: Record<string, Partial<VariantConfig>>;
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  defaults: DEFAULT_VARIANT_CONFIG,
  overrides: {},
};

/** Plage par défaut d'un exercice au poids du corps (réglable par exercice) : 10 à 40 répétitions. */
export const BODYWEIGHT_RANGE = { minReps: 10, maxReps: 40 } as const;

/** Plage par défaut d'un exercice en secondes (gainage, réglable par exercice) : 20 à 60 s. */
export const SECONDS_RANGE = { minReps: 20, maxReps: 60 } as const;
/** Pas de progression d'un exercice en secondes : 5 s. */
export const SECONDS_STEP = 5;

/**
 * Cible d'un exercice jamais réalisé : sa cible de départ si elle est réglée (ramenée dans la plage), sinon la borne
 * basse (§5.3).
 */
export function startTarget(cfg: Pick<VariantConfig, 'minReps' | 'maxReps' | 'startReps'>): number {
  return cfg.startReps === undefined ? cfg.minReps : Math.min(Math.max(cfg.startReps, cfg.minReps), cfg.maxReps);
}

/** Pas de la cible : 5 s pour un exercice en secondes, 1 répétition sinon. */
export function repStep(cfg: Pick<VariantConfig, 'seconds'>): number {
  return cfg.seconds ? SECONDS_STEP : 1;
}

/** Suivi à la maison d'un exercice-variante à charge (version 1.26.0) : « <variante>@maison ». */
export const HOME_SUFFIX = '@maison';
/** Borne haute par défaut des répétitions à la maison : 15 (charges plus légères). */
export const HOME_MAX_REPS = 15;

/**
 * Suivi d'une performance : à la maison, un exercice à charge a son propre suivi (palier, compteurs, records), car les
 * charges ne sont pas comparables ; au poids du corps (et en secondes), un seul suivi, quel que soit le lieu.
 */
export function trackKey(settings: EngineSettings, variantId: string, home: boolean): string {
  return home && !resolveConfig(settings, variantId).bodyweight ? `${variantId}${HOME_SUFFIX}` : variantId;
}

/** Exercice-variante d'un suivi. */
export function variantOfTrack(track: string): string {
  return track.endsWith(HOME_SUFFIX) ? track.slice(0, -HOME_SUFFIX.length) : track;
}

/** Plage de répétitions à la maison : réglée, ou borne basse de la salle et 15 au plus haut (au moins celle de la salle). */
export function homeRange(cfg: Pick<VariantConfig, 'minReps' | 'maxReps' | 'homeMinReps' | 'homeMaxReps'>): { minReps: number; maxReps: number } {
  const minReps = cfg.homeMinReps ?? cfg.minReps;
  return { minReps, maxReps: cfg.homeMaxReps ?? Math.max(HOME_MAX_REPS, cfg.maxReps, minReps) };
}

export function resolveConfig(settings: EngineSettings, variantId: string): VariantConfig {
  if (variantId.endsWith(HOME_SUFFIX)) {
    // Suivi à la maison : réglages de la variante, avec sa plage de la maison.
    const full = resolveConfig(settings, variantOfTrack(variantId));
    const { homeMinReps: _min, homeMaxReps: _max, ...base } = full;
    return { ...base, ...homeRange(full) };
  }
  const override = settings.overrides[variantId];
  // Un exercice en secondes est toujours au poids du corps.
  if (override?.seconds) return { ...settings.defaults, ...SECONDS_RANGE, ...override, bodyweight: true };
  if (override?.bodyweight) return { ...settings.defaults, ...BODYWEIGHT_RANGE, ...override };
  return { ...settings.defaults, ...override };
}
