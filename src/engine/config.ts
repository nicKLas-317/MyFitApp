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

/** Pas de la cible : 5 s pour un exercice en secondes, 1 répétition sinon. */
export function repStep(cfg: Pick<VariantConfig, 'seconds'>): number {
  return cfg.seconds ? SECONDS_STEP : 1;
}

export function resolveConfig(settings: EngineSettings, variantId: string): VariantConfig {
  const override = settings.overrides[variantId];
  // Un exercice en secondes est toujours au poids du corps.
  if (override?.seconds) return { ...settings.defaults, ...SECONDS_RANGE, ...override, bodyweight: true };
  if (override?.bodyweight) return { ...settings.defaults, ...BODYWEIGHT_RANGE, ...override };
  return { ...settings.defaults, ...override };
}
