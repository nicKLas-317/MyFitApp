import { describe, expect, it } from 'vitest';
import type { Exercise, Session } from '../../domain/types';
import { indexVariants, type VariantRef } from '../catalog';
import { libraryOrder, pickerSearchOrder, pickerTiers, recentAt } from '../pickerOrder';
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

  it('315. Filtre par groupe, sans texte : favoris, récents, puis les autres du groupe', () => {
    const pecs = all.filter((r) => r.exercise.primaryGroup === 'pectoraux');
    const byGroup = pickerTiers(pecs, (r) => r, recentAt(sessions, false));
    expect(ids(byGroup[0]!.items)).toEqual(['pec-deck']);
    expect(ids(byGroup[1]!.items)).toEqual(['chest-press']);
    expect(byGroup[2]!.items.every((r) => r.exercise.primaryGroup === 'pectoraux')).toBe(true);
    // Doublon dans la liste donnée : gardé une fois.
    const twice = pickerTiers([refs.get('pec-deck')!, refs.get('pec-deck')!], (r) => r, []);
    expect(twice.flatMap((t) => ids(t.items))).toEqual(['pec-deck']);
  });

  it('315. Recherche (version 1.49.1) : la pertinence d’abord ; favoris puis récents seulement à pertinence égale', () => {
    const search = (list: readonly Exercise[], query: string, recent: string[]) =>
      pickerSearchOrder(searchWithInfo(buildSearchIndex(list), query).results, (r) => r.entry, (r) => r.score, recent).map((r) => r.entry.variant.id);
    // « shoulder press » : le chest press, fait récemment et même en favori, reste après le développé épaules machine
    // et le développé militaire, plus pertinents ; parmi les résultats de même pertinence, favori puis récent d'abord.
    const shoulder = favorite(SEED_EXERCISES, ['developpe-incline', 'chest-press']);
    expect(search(SEED_EXERCISES, 'shoulder press', ['chest-press'])).toEqual([
      'developpe-epaules-machine', 'developpe-militaire-halteres', 'chest-press', 'developpe-couche', 'developpe-couche-halteres', 'developpe-incline', 'developpe-incline--halteres',
    ]);
    expect(search(favorite(SEED_EXERCISES, ['developpe-incline']), 'shoulder press', ['chest-press'])).toEqual([
      'developpe-epaules-machine', 'developpe-militaire-halteres', 'developpe-incline', 'chest-press', 'developpe-couche', 'developpe-couche-halteres', 'developpe-incline--halteres',
    ]);
    expect(search(shoulder, 'shoulder press', [])[0]).toBe('developpe-epaules-machine');
    // « curl biceps » : cinq curls de même pertinence, puis le marteau et le pupitre, moins pertinents. Favori (poulie
    // corde), puis récents du plus récent au plus ancien (haltères, barre droite), puis l'ordre de la recherche ; le
    // curl marteau, favori, reste après les plus pertinents.
    const curls = favorite(SEED_EXERCISES, ['curl-biceps-poulie-corde', 'curl-marteau']);
    expect(search(curls, 'curl biceps', ['curl-biceps-halteres', 'leg-extension', 'curl-biceps-barre-droite'])).toEqual([
      'curl-biceps-poulie-corde', 'curl-biceps-halteres', 'curl-biceps-barre-droite', 'curl-biceps-banc-incline', 'curl-biceps-barre-ez', 'curl-marteau', 'curl-pupitre',
    ]);
    // Sans favori ni récent : l'ordre de la recherche, inchangé.
    expect(search(SEED_EXERCISES, 'curl biceps', [])).toEqual(searchWithInfo(buildSearchIndex(SEED_EXERCISES), 'curl biceps').results.map((r) => r.entry.variant.id));
  });
});

describe('Favoris compatibles avec le lieu (version 1.57.0)', () => {
  it('339. En tête, seulement les favoris faits à ce lieu ou jamais faits ; un favori fait seulement à l’autre lieu passe dans « Tous les exercices » et ne départage plus une recherche', () => {
    // Favoris : crunch au sol (fait seulement à la maison), pec deck (fait à la salle), leg curl (jamais fait).
    const exs = favorite(SEED_EXERCISES, ['crunch-sol', 'pec-deck', 'leg-curl']);
    const list = libraryOrder([...indexVariants(exs).values()]);
    const done = [session('a', '2026-11-02', ['pec-deck', 'chest-press']), session('b', '2026-11-03', ['crunch-sol', 'curl-biceps-halteres'], 'maison')];
    const gym = pickerTiers(list, (r) => r, recentAt(done, false), recentAt(done, true));
    expect(ids(gym[0]!.items)).toEqual(['pec-deck', 'leg-curl']);
    expect(ids(gym.find((t) => t.tier === 'tous')!.items)).toContain('crunch-sol');
    // À la maison : le crunch en tête, le pec deck (fait seulement à la salle) dans « Tous les exercices ».
    const home = pickerTiers(list, (r) => r, recentAt(done, true), recentAt(done, false));
    expect(ids(home[0]!.items)).toEqual(['leg-curl', 'crunch-sol']);
    expect(ids(home.find((t) => t.tier === 'tous')!.items)).toContain('pec-deck');
    // Recherche « crunch » à la salle : le crunch au sol ne passe plus devant à pertinence égale.
    const idx = buildSearchIndex(exs);
    const { results } = searchWithInfo(idx, 'crunch');
    const byScore = (r: (typeof results)[number]) => r.score;
    const score = new Map(results.map((r) => [r.entry.variant.id, r.score]));
    const ordered = pickerSearchOrder(results, (r) => r.entry, byScore, recentAt(done, false), recentAt(done, true)).map((r) => r.entry.variant.id);
    const tied = ordered.filter((id) => score.get(id) === score.get('crunch-sol'));
    expect(tied.indexOf('crunch-sol')).toBe(results.filter((r) => r.score === score.get('crunch-sol')).findIndex((r) => r.entry.variant.id === 'crunch-sol'));
    // Contre-test : sans l'autre lieu (règle d'avant), le crunch au sol reste un favori en tête à la salle.
    expect(ids(pickerTiers(list, (r) => r, recentAt(done, false))[0]!.items)).toContain('crunch-sol');
  });
});
