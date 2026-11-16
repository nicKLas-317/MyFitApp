/**
 * Ordre de la liste d'ajout d'un exercice (séance, séance prévue, version 1.49.0) : favoris, puis exercices déjà faits
 * au lieu de la séance, du plus récent au plus ancien, puis tous les autres, chacun une seule fois. Fonctions pures.
 * La bibliothèque (onglet Plus) garde son ordre (récents, favoris, groupes).
 */
import type { MuscleGroup, Session } from '../domain/types';
import { compareSessions } from '../engine/replay';
import { displayName, type VariantRef } from './catalog';
import { MUSCLE_GROUP_LABELS } from './seed';

export type PickTier = 'favoris' | 'recents' | 'tous';

export const PICK_TIER_TITLES: Record<PickTier, string> = {
  favoris: 'Favoris',
  recents: 'Récents',
  tous: 'Tous les exercices',
};

/**
 * Exercices-variantes faits dans les séances terminées du lieu (salle, ou maison), du plus récent au plus ancien, dans
 * l'ordre du moteur (§7.9). Une performance sans série (exercice resté sans série, performance partielle importée)
 * compte : l'exercice a été fait ou noté ce jour-là.
 */
export function recentAt(sessions: readonly Session[], home: boolean): string[] {
  const ids: string[] = [];
  const done = sessions
    .filter((s) => s.state === 'done' && (s.location === 'maison') === home)
    .sort((a, b) => compareSessions(b, a));
  for (const s of done) for (const p of s.performances) if (!ids.includes(p.variantId)) ids.push(p.variantId);
  return ids;
}

/**
 * Répartit une liste déjà ordonnée (bibliothèque par groupe, ou résultats d'une recherche par pertinence) : favoris dans
 * cet ordre, puis les autres exercices faits, du plus récent au plus ancien (`recent`), puis le reste dans cet ordre.
 * Chaque exercice-variante une seule fois ; seules les parts non vides sont renvoyées.
 */
export function pickerTiers<T>(items: readonly T[], refOf: (item: T) => VariantRef, recent: readonly string[]): { tier: PickTier; items: T[] }[] {
  const rank = new Map(recent.map((id, i) => [id, i]));
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    const id = refOf(item).variant.id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const favoris = unique.filter((item) => refOf(item).variant.favorite);
  const recents = unique
    .filter((item) => !refOf(item).variant.favorite && rank.has(refOf(item).variant.id))
    .sort((a, b) => rank.get(refOf(a).variant.id)! - rank.get(refOf(b).variant.id)!);
  const tous = unique.filter((item) => !refOf(item).variant.favorite && !rank.has(refOf(item).variant.id));
  return (
    [
      { tier: 'favoris', items: favoris },
      { tier: 'recents', items: recents },
      { tier: 'tous', items: tous },
    ] as const
  ).filter((t) => t.items.length > 0).map((t) => ({ tier: t.tier, items: [...t.items] }));
}

const GROUP_ORDER = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[];

/**
 * Ordre de la bibliothèque sans recherche (« l'ordre actuel ») : groupe principal dans l'ordre des groupes, puis nom
 * affiché dans l'ordre alphabétique.
 */
export function libraryOrder(refs: readonly VariantRef[]): VariantRef[] {
  const rank = (r: VariantRef) => GROUP_ORDER.indexOf(r.exercise.primaryGroup);
  return [...refs].sort((a, b) => rank(a) - rank(b) || displayName(a).localeCompare(displayName(b), 'fr'));
}
