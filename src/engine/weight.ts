/** Poids en centièmes de kg : deux poids sont égaux une fois arrondis à 0,01 kg (§7.11 J). */
function toCentikg(kg: number): number {
  return Math.round(kg * 100);
}

/** Compare deux poids : négatif si a < b, 0 si égaux, positif si a > b. */
export function compareWeight(a: number, b: number): number {
  return Math.sign(toCentikg(a) - toCentikg(b));
}

/**
 * Compare la difficulté de deux charges : positif si `a` est plus difficile que `b`.
 * Pour un exercice assisté (§7.12), une charge plus basse (moins d'aide) est plus difficile.
 */
export function compareDifficulty(a: number, b: number, assisted: boolean): number {
  const cmp = compareWeight(a, b);
  return assisted ? -cmp : cmp;
}

export function sameWeight(a: number, b: number): boolean {
  return compareWeight(a, b) === 0;
}
