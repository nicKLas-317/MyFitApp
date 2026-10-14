/** Poids en centièmes de kg : deux poids sont égaux une fois arrondis à 0,01 kg (§7.11 J). */
function toCentikg(kg: number): number {
  return Math.round(kg * 100);
}

/** Compare deux poids : négatif si a < b, 0 si égaux, positif si a > b. */
export function compareWeight(a: number, b: number): number {
  return Math.sign(toCentikg(a) - toCentikg(b));
}

export function sameWeight(a: number, b: number): boolean {
  return compareWeight(a, b) === 0;
}
