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

export function resolveConfig(settings: EngineSettings, variantId: string): VariantConfig {
  const override = settings.overrides[variantId];
  if (override?.bodyweight) return { ...settings.defaults, ...BODYWEIGHT_RANGE, ...override };
  return { ...settings.defaults, ...override };
}
