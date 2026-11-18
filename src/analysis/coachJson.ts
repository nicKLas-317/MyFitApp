/**
 * Export « coach » (§19.13) : JSON compact et lisible (version 1.50.1 : découpé de coach.ts, sans changement de
 * comportement).
 */

/** Largeur au-delà de laquelle un objet ou une liste passe sur plusieurs lignes… */
const LINE_WIDTH = 110;
/** … sauf un objet sans sous-objet (une performance, une semaine de séries), gardé sur une ligne jusqu'à cette longueur. */
const RECORD_WIDTH = 360;

function inline(value: unknown): string {
  if (Array.isArray(value)) return value.length === 0 ? '[]' : `[${value.map(inline).join(', ')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    return entries.length === 0 ? '{}' : `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(', ')} }`;
  }
  return JSON.stringify(value);
}

/** Objet dont les valeurs sont des nombres, des textes ou des listes de nombres et de textes. */
function isFlatRecord(value: object): boolean {
  return (
    !Array.isArray(value) &&
    Object.values(value).every((v) => v === null || typeof v !== 'object' || (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object')))
  );
}

/**
 * JSON indenté, mais une liste ou un objet qui tient sur une ligne y reste, et une performance (objet sans sous-objet)
 * aussi : lisible sans défiler, nettement plus court qu'un JSON indenté partout. Se relit avec JSON.parse.
 */
export function coachJson(value: unknown, indent = ''): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const flat = inline(value);
  if (indent.length + flat.length <= LINE_WIDTH || (isFlatRecord(value) && indent.length + flat.length <= RECORD_WIDTH)) return flat;
  const inner = `${indent}  `;
  if (Array.isArray(value)) return `[\n${value.map((v) => inner + coachJson(v, inner)).join(',\n')}\n${indent}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${coachJson(v, inner)}`).join(',\n')}\n${indent}}`;
}
