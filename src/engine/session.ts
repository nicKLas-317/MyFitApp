import type { Performance, Session } from '../domain/types';
import { resolveConfig, trackKey, type EngineSettings } from './config';
import { expectedTarget, recommend, type Recommendation } from './progression';
import type { Profile } from './replay';

/** Exercice prérempli pour une nouvelle séance, avec la recommandation à afficher. */
export interface PlannedPerformance {
  performance: Performance;
  recommendation: Recommendation;
}

export interface NewSessionParams {
  id: string;
  name: string;
  date: string;
  now: number;
}

/**
 * Crée une nouvelle séance à partir d'une séance historique (§10).
 * L'originale n'est jamais modifiée ; poids et cibles viennent du profil actuel, pas du modèle.
 * Aucune répétition n'est préremplie comme réalisée : la nouvelle séance part vide. Elle garde le lieu du modèle
 * (une séance à la maison réutilisée est à la maison, avec le suivi de la maison).
 */
export function createSessionFromTemplate(
  template: Session,
  profile: Profile,
  settings: EngineSettings,
  params: NewSessionParams,
): { session: Session; planned: PlannedPerformance[] } {
  const planned: PlannedPerformance[] = [];
  const seen = new Set<string>();

  for (const source of template.performances) {
    if (seen.has(source.variantId)) continue;
    seen.add(source.variantId);
    const track = trackKey(settings, source.variantId, template.location === 'maison');
    const cfg = resolveConfig(settings, track);
    const state = profile.variants[track];
    // Le poids prérempli est celui du palier actuel : en cas de « poids supérieur/inférieur »,
    // c'est à l'utilisateur de saisir la nouvelle charge, et la cible suit expectedTarget.
    const weightKg = state ? state.palier.weightKg : source.weightKg;
    planned.push({
      performance: {
        variantId: source.variantId,
        weightKg,
        targetReps: expectedTarget(state, weightKg, cfg),
        plannedSets: cfg.sets,
        reps: [],
        feeling: 'inconnu',
      },
      recommendation: recommend(state, cfg),
    });
  }

  const session: Session = {
    id: params.id,
    name: params.name,
    date: params.date,
    startedAt: params.now,
    endedAt: null,
    createdAt: params.now,
    updatedAt: params.now,
    origin: 'app',
    state: 'active',
    performances: planned.map((p) => p.performance),
    ...(template.location === 'maison' ? { location: 'maison' as const } : {}),
  };
  return { session, planned };
}
