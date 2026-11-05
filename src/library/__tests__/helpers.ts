import { searchWithInfo, type SearchEntry, type SearchResult } from '../search';

/** Résultats d'une recherche, sans les mots ignorés (tests seulement ; l'appli utilise `searchWithInfo`). */
export function searchExercises(index: readonly SearchEntry[], query: string): SearchResult[] {
  return searchWithInfo(index, query).results;
}
