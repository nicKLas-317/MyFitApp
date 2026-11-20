/** Contrôles de type d'un contenu JSON lu (version 1.55.1 : découpé de backup.ts, sans changement de comportement). */
export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isStr = (v: unknown): v is string => typeof v === 'string';
export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const isInt = (v: unknown): v is number => Number.isInteger(v);
export const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
