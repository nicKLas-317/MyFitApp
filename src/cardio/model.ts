/**
 * Cardio, version minimale : blocs « machine, inclinaison (tapis), durée, distance facultative » dans une séance.
 * Simple enregistrement : ni progression, ni couleur, ni ressenti, ni calories, aucun effet sur le moteur
 * ni sur les groupes musculaires du récapitulatif hebdomadaire. Fonctions pures.
 */
import type { CardioBlock, CardioMachine, Incline, Session } from '../domain/types';
import { slug, uniqueId } from '../library/edit';
import { formatDurationLong } from '../session/format';
import { normalizeName } from '../library/text';

export const DEFAULT_CARDIO_MACHINES: readonly CardioMachine[] = [
  { id: 'tapis', name: 'Tapis de marche', incline: true },
  { id: 'rameur', name: 'Rameur', incline: false },
  { id: 'elliptique', name: 'Vélo elliptique', incline: false },
  { id: 'autre', name: 'Autre', incline: false },
];

export const INCLINES: readonly Incline[] = ['neutre', 'moyenne', 'haute'];
export const INCLINE_LABELS: Record<Incline, string> = { neutre: 'Neutre', moyenne: 'Moyenne', haute: 'Haute' };

export const MAX_CARDIO_MINUTES = 600;
export const MAX_CARDIO_KM = 200;

export function cardioOf(session: Pick<Session, 'cardio'>): CardioBlock[] {
  return session.cardio ?? [];
}

/** Durée totale de cardio d'une séance, en minutes. */
export function cardioMinutes(session: Pick<Session, 'cardio'>): number {
  return cardioOf(session).reduce((n, b) => n + b.minutes, 0);
}

/** « 45 min », « 1 h 15 ». */
export function formatMinutes(minutes: number): string {
  return formatDurationLong(minutes * 60_000);
}

/** « Tapis de marche · inclinaison haute · 20 min · 2,5 km ». */
export function formatCardio(block: CardioBlock): string {
  const parts = [block.machine];
  if (block.incline) parts.push(`inclinaison ${INCLINE_LABELS[block.incline].toLowerCase()}`);
  parts.push(formatMinutes(block.minutes));
  if (block.distanceKm !== undefined) parts.push(`${block.distanceKm.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km`);
  return parts.join(' · ');
}

// ——— Saisie ————————————————————————————————————————————————————

export interface CardioInput {
  machine: CardioMachine;
  /** Ignorée pour une machine sans inclinaison ; Neutre par défaut sinon. */
  incline?: Incline | null;
  minutes: number | null;
  distanceKm?: number | null;
}

export type CardioError = 'invalid_minutes' | 'invalid_distance' | 'missing_incline';

export function isValidMinutes(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_CARDIO_MINUTES;
}

export function isValidDistance(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_CARDIO_KM;
}

export function cardioErrors(input: CardioInput): CardioError[] {
  const errors: CardioError[] = [];
  if (!isValidMinutes(input.minutes)) errors.push('invalid_minutes');
  if (input.distanceKm !== undefined && input.distanceKm !== null && !isValidDistance(input.distanceKm)) errors.push('invalid_distance');
  if (input.machine.incline && input.incline === null) errors.push('missing_incline');
  return errors;
}

/** Bloc prêt à enregistrer ; l'appelant a vérifié `cardioErrors`. */
export function makeCardioBlock(input: CardioInput, id: string): CardioBlock {
  if (cardioErrors(input).length > 0) throw new Error('Bloc de cardio invalide');
  const block: CardioBlock = { id, machineId: input.machine.id, machine: input.machine.name, minutes: input.minutes as number };
  if (input.machine.incline) block.incline = input.incline ?? 'neutre';
  if (input.distanceKm !== undefined && input.distanceKm !== null) block.distanceKm = Math.round(input.distanceKm * 100) / 100;
  return block;
}

/** La liste vide n'est jamais écrite : une séance sans cardio reste identique à celle d'une version antérieure. */
function withCardio(session: Session, list: CardioBlock[], now: number): Session {
  const next: Session = { ...session, updatedAt: now };
  if (list.length > 0) next.cardio = list;
  else delete next.cardio;
  return next;
}

export function addCardio(session: Session, block: CardioBlock, now: number): Session {
  return withCardio(session, [...cardioOf(session), block], now);
}

/** Remplace un bloc (correction), à la même place. */
export function updateCardio(session: Session, block: CardioBlock, now: number): Session {
  if (!cardioOf(session).some((b) => b.id === block.id)) return session;
  return withCardio(session, cardioOf(session).map((b) => (b.id === block.id ? block : b)), now);
}

export function removeCardio(session: Session, id: string, now: number): Session {
  const list = cardioOf(session).filter((b) => b.id !== id);
  return list.length === cardioOf(session).length ? session : withCardio(session, list, now);
}

/** Durée saisie : « 20 », « 20 min ». */
export function parseMinutes(text: string): number | null {
  const m = /^\s*(\d+)\s*(?:min(?:utes?)?|mn)?\s*$/i.exec(text);
  return m && isValidMinutes(Number(m[1])) ? Number(m[1]) : null;
}

/** Distance saisie en km : « 2,5 », « 2.5 km ». Vide = pas de distance (undefined). */
export function parseDistance(text: string): number | null | undefined {
  const t = text.trim().toLowerCase().replace(/\s*km$/, '').replace(',', '.');
  if (!t) return undefined;
  return /^\d+(\.\d+)?$/.test(t) && isValidDistance(Number(t)) ? Number(t) : null;
}

// ——— Liste des machines (réglages) ————————————————————————————————————

/** Liste lue en base ou importée : entrées invalides ou en double écartées, liste par défaut si rien n'est valable. */
export function sanitizeCardioMachines(value: unknown): CardioMachine[] {
  if (!Array.isArray(value)) return [...DEFAULT_CARDIO_MACHINES];
  const ids = new Set<string>();
  const names = new Set<string>();
  const list: CardioMachine[] = [];
  for (const m of value) {
    if (typeof m !== 'object' || m === null) continue;
    const { id, name, incline } = m as Record<string, unknown>;
    if (typeof id !== 'string' || !id || typeof name !== 'string' || !name.trim() || typeof incline !== 'boolean') continue;
    const key = normalizeName(name);
    if (ids.has(id) || names.has(key)) continue;
    ids.add(id);
    names.add(key);
    list.push({ id, name: name.trim(), incline });
  }
  return list.length > 0 ? list : [...DEFAULT_CARDIO_MACHINES];
}

export type MachineListError = 'empty_name' | 'duplicate_name' | 'empty_list';

export function machineListErrors(list: readonly CardioMachine[]): MachineListError[] {
  const errors = new Set<MachineListError>();
  if (list.length === 0) errors.add('empty_list');
  const names = list.map((m) => normalizeName(m.name));
  if (names.some((n) => !n)) errors.add('empty_name');
  if (new Set(names.filter(Boolean)).size !== names.filter(Boolean).length) errors.add('duplicate_name');
  return [...errors];
}

/** Nouvelle machine, avec un identifiant stable libre. */
export function newMachine(name: string, incline: boolean, existing: readonly CardioMachine[]): CardioMachine {
  return { id: uniqueId(`cardio-${slug(name)}`, new Set(existing.map((m) => m.id))), name: name.trim(), incline };
}

// ——— Lecture des notes ————————————————————————————————————————————

/** Autres noms reconnus dans les notes pour les machines par défaut (même renommées). */
const MACHINE_ALIASES: Record<string, string[]> = {
  tapis: ['tapis', 'tapis de marche', 'marche', 'treadmill'],
  rameur: ['rameur', 'rowing machine', 'rower'],
  elliptique: ['elliptique', 'velo elliptique', 'elliptical', 'cross trainer'],
};

/** Machine désignée par un nom de notes : la correspondance la plus longue, en mots entiers. null si aucune. */
export function matchCardioMachine(name: string, machines: readonly CardioMachine[]): CardioMachine | null {
  const text = ` ${normalizeName(name)} `;
  let best: { machine: CardioMachine; length: number } | null = null;
  for (const machine of machines) {
    for (const key of [normalizeName(machine.name), ...(MACHINE_ALIASES[machine.id] ?? [])]) {
      if (key && text.includes(` ${key} `) && (!best || key.length > best.length)) best = { machine, length: key.length };
    }
  }
  return best?.machine ?? null;
}

/** Inclinaison écrite dans les notes : niveau lu, « mentionnée » sans niveau (à choisir), ou absente (Neutre). */
export type InclineReading = { kind: 'level'; incline: Incline } | { kind: 'unspecified' } | { kind: 'absent' };

export function readIncline(name: string): InclineReading {
  const text = ` ${normalizeName(name)} `;
  if (/ (haute?|forte?|max|maximum) /.test(text)) return { kind: 'level', incline: 'haute' };
  if (/ (moyenne?|moy) /.test(text)) return { kind: 'level', incline: 'moyenne' };
  if (/ (neutre|plat|0) /.test(text)) return { kind: 'level', incline: 'neutre' };
  return / inclin/.test(text) ? { kind: 'unspecified' } : { kind: 'absent' };
}

/** Durée et distance d'une ligne de notes : « 20 min », « 20min », « 20 minutes », « 2,5 km », « 2000 m ». */
export function readCardioNumbers(line: string): { minutes: number; distanceKm: number | null; index: number } | null {
  const text = line.toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
  const m = /(\d+)\s*(?:min(?:utes?)?|mn)(?![a-z])/.exec(text);
  if (!m) return null;
  const d = /(\d+(?:\.\d+)?)\s*(km|m)(?![a-z])/.exec(text);
  const distanceKm = d ? Math.round((d[2] === 'km' ? Number(d[1]) : Number(d[1]) / 1000) * 100) / 100 : null;
  const index = Math.min(m.index, d?.index ?? Infinity);
  return { minutes: Number(m[1]), distanceKm, index };
}
