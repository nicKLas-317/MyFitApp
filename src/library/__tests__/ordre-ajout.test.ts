import { describe, expect, it } from 'vitest';
import type { Exercise, Session } from '../../domain/types';
import { indexVariants, type VariantRef } from '../catalog';
import { libraryOrder, pickerTiers, recentAt } from '../pickerOrder';
import { buildSearchIndex, searchWithInfo } from '../search';
import { SEED_EXERCISES } from '../seed';

function session(id: string, date: string, variantIds: string[], location?: 'maison'): Session {
  const start = Date.parse(`${date}T10:00:00`);
  return {
    id, name: id, date, startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start, origin: 'app', state: 'done',
    ...(location ? { location } : {}),
    performances: variantIds.map((variantId) => ({ variantId, weightKg: 10, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' as const })),
  };
}

const favorite = (exercises: readonly Exercise[], ids: string[]): Exercise[] =>
  exercises.map((e) => ({ ...e, variants: e.variants.map((v) => (ids.includes(v.id) ? { ...v, favorite: true } : v)) }));

const exercises = favorite(SEED_EXERCISES, ['leg-curl', 'pec-deck']);
const refs = indexVariants(exercises);
const index = buildSearchIndex(exercises);
const all = libraryOrder(index.map((e) => ({ exercise: e.exercise, variant: e.variant })));
const ids = (list: readonly VariantRef[]) => list.map((r) => r.variant.id);

const sessions = [
  session('s1', '2026-11-02', ['chest-press', 'pec-deck', 'tirage-vertical']),
  session('s2', '2026-11-04', ['curl-biceps-halteres'], 'maison'),
  session('s3', '2026-11-05', ['leg-extension', 'chest-press']),
  { ...session('en-cours', '2026-11-06', ['presse-cuisses']), state: 'active' as const },
];

describe('Ordre de la liste d’ajout d’un exercice (version 1.49.0)', () => {
  it('315. Favoris, puis exercices faits au lieu de la séance du plus récent au plus ancien, puis les autres, chacun une fois', () => {
    // Salle : séances à la salle seulement, séance en cours exclue.
    expect(recentAt(sessions, false)).toEqual(['leg-extension', 'chest-press', 'pec-deck', 'tirage-vertical']);
    // Maison : séances à la maison seulement.
    expect(recentAt(sessions, true)).toEqual(['curl-biceps-halteres']);
    const tiers = pickerTiers(all, (r) => r, recentAt(sessions, false));
    expect(tiers.map((t) => t.tier)).toEqual(['favoris', 'recents', 'tous']);
    // Favoris dans l'ordre de la bibliothèque (groupes, puis nom) : pectoraux avant jambes.
    expect(ids(tiers[0]!.items)).toEqual(['pec-deck', 'leg-curl']);
    // Le pec deck, favori et fait, n'est pas répété dans les récents.
    expect(ids(tiers[1]!.items)).toEqual(['leg-extension', 'chest-press', 'tirage-vertical']);
    // Chaque exercice-variante une seule fois, aucun perdu ; le reste garde l'ordre de la bibliothèque.
    const flat = tiers.flatMap((t) => ids(t.items));
    expect(new Set(flat).size).toBe(flat.length);
    expect([...flat].sort()).toEqual([...ids(all)].sort());
    expect(ids(tiers[2]!.items)).toEqual(ids(all).filter((id) => !['pec-deck', 'leg-curl', 'leg-extension', 'chest-press', 'tirage-vertical'].includes(id)));
    // À la maison : le curl aux haltères en récent, les exercices de la salle dans « Tous les exercices ».
    const home = pickerTiers(all, (r) => r, recentAt(sessions, true));
    expect(ids(home[1]!.items)).toEqual(['curl-biceps-halteres']);
    expect(ids(home[2]!.items)).toContain('chest-press');
    // Sans favori ni séance : une seule part, dans l'ordre de la bibliothèque.
    const bare = pickerTiers(libraryOrder([...indexVariants(SEED_EXERCISES).values()]), (r) => r, []);
    expect(bare.map((t) => t.tier)).toEqual(['tous']);
  });

  it('315. Recherche et filtre par groupe : le même ordre à l’intérieur des résultats', () => {
    // « curl » : par pertinence, puis favoris, récents et autres.
    const results = searchWithInfo(index, 'curl').results.map((r) => ({ exercise: r.entry.exercise, variant: r.entry.variant }));
    const tiers = pickerTiers(results, (r) => r, recentAt(sessions, true));
    expect(tiers.map((t) => t.tier)).toEqual(['favoris', 'recents', 'tous']);
    expect(ids(tiers[0]!.items)).toEqual(['leg-curl']);
    expect(ids(tiers[1]!.items)).toEqual(['curl-biceps-halteres']);
    // Les autres gardent l'ordre de la recherche.
    expect(ids(tiers[2]!.items)).toEqual(ids(results).filter((id) => id !== 'leg-curl' && id !== 'curl-biceps-halteres'));
    // Filtre « Pectoraux » : favoris, récents et autres du groupe seulement.
    const pecs = all.filter((r) => r.exercise.primaryGroup === 'pectoraux');
    const byGroup = pickerTiers(pecs, (r) => r, recentAt(sessions, false));
    expect(ids(byGroup[0]!.items)).toEqual(['pec-deck']);
    expect(ids(byGroup[1]!.items)).toEqual(['chest-press']);
    expect(byGroup[2]!.items.every((r) => r.exercise.primaryGroup === 'pectoraux')).toBe(true);
    // Doublon dans la liste donnée : gardé une fois.
    const twice = pickerTiers([refs.get('pec-deck')!, refs.get('pec-deck')!], (r) => r, []);
    expect(twice.flatMap((t) => ids(t.items))).toEqual(['pec-deck']);
  });
});
