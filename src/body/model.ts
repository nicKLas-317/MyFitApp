/**
 * Suivi corporel « Mon poids » (§20) : module indépendant de l'entraînement.
 * Il ne lit ni ne modifie les séances, l'historique sportif ou le moteur de progression.
 */
import { isIsoDate } from '../session/format';
import { parseWeight } from '../session/ops';

/** Une pesée par date ; une nouvelle saisie à la même date la remplace. */
export interface WeighIn {
  date: string;
  weightKg: number;
}

export interface BodyTracking {
  heightCm: number | null;
  weighIns: WeighIn[];
}

export const EMPTY_BODY: BodyTracking = { heightCm: null, weighIns: [] };

/** Bornes de plausibilité : au-delà, la saisie est une faute de frappe. */
export const WEIGHT_RANGE = { min: 20, max: 350 } as const;
export const HEIGHT_RANGE = { min: 80, max: 250 } as const;

export type WeighInError = 'invalid_date' | 'future_date' | 'invalid_weight' | 'out_of_range';

/** Valide une pesée saisie : date non future, poids numérique et plausible (§20, test 52). */
export function parseWeighIn(date: string, weightText: string, today: string): { value: WeighIn } | { errors: WeighInError[] } {
  const errors: WeighInError[] = [];
  if (!isIsoDate(date)) errors.push('invalid_date');
  else if (date > today) errors.push('future_date');
  const weight = parseWeight(weightText);
  if (weight === null) errors.push('invalid_weight');
  else if (weight < WEIGHT_RANGE.min || weight > WEIGHT_RANGE.max) errors.push('out_of_range');
  return errors.length > 0 || weight === null ? { errors } : { value: { date, weightKg: Math.round(weight * 100) / 100 } };
}

export function isValidWeighIn(w: unknown): w is WeighIn {
  if (typeof w !== 'object' || w === null) return false;
  const { date, weightKg } = w as Record<string, unknown>;
  return typeof date === 'string' && isIsoDate(date) && typeof weightKg === 'number' && Number.isFinite(weightKg) && weightKg >= WEIGHT_RANGE.min && weightKg <= WEIGHT_RANGE.max;
}

/** Taille en cm ; vide = non renseignée. */
export function parseHeight(text: string): { value: number | null } | { error: true } {
  const t = text.trim();
  if (!t) return { value: null };
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n) || n < HEIGHT_RANGE.min || n > HEIGHT_RANGE.max) return { error: true };
  return { value: Math.round(n) };
}

export function isValidHeight(h: unknown): h is number | null {
  return h === null || (typeof h === 'number' && Number.isFinite(h) && h >= HEIGHT_RANGE.min && h <= HEIGHT_RANGE.max);
}

/** Pesées triées par date croissante. */
export function sortWeighIns(list: readonly WeighIn[]): WeighIn[] {
  return [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface Period {
  key: '1m' | '3m' | '6m' | '1a';
  label: string;
  months: number;
}

export const PERIODS: readonly Period[] = [
  { key: '1m', label: '1 mois', months: 1 },
  { key: '3m', label: '3 mois', months: 3 },
  { key: '6m', label: '6 mois', months: 6 },
  { key: '1a', label: '1 an', months: 12 },
];

/** Date de début d'une période se terminant aujourd'hui (même jour, n mois plus tôt). */
export function periodStart(today: string, months: number): string {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(d, last));
  return date.toISOString().slice(0, 10);
}

/**
 * Périodes proposées selon les données disponibles (§20) : 1 mois toujours, puis chaque période plus longue
 * seulement si des pesées sont plus anciennes que la période précédente.
 */
export function availablePeriods(weighIns: readonly WeighIn[], today: string): Period[] {
  const oldest = sortWeighIns(weighIns)[0]?.date;
  const out: Period[] = [PERIODS[0]!];
  for (let i = 1; i < PERIODS.length; i++) {
    if (oldest && oldest < periodStart(today, PERIODS[i - 1]!.months)) out.push(PERIODS[i]!);
  }
  return out;
}

export function inPeriod(weighIns: readonly WeighIn[], today: string, months: number): WeighIn[] {
  const start = periodStart(today, months);
  return sortWeighIns(weighIns).filter((w) => w.date >= start && w.date <= today);
}

export type BodyImportMode = 'merge' | 'replace';

export interface BodyImportPlan {
  /** Taille à enregistrer ; undefined = inchangée. */
  heightCm: number | null | undefined;
  weighIns: WeighIn[];
  /** Même date, poids différent : la pesée de l'appareil est conservée. */
  conflicts: WeighIn[];
  /** Taille différente déjà renseignée sur l'appareil : conservée. */
  heightConflict: boolean;
  replace: boolean;
}

/** Fusion par défaut, sans rien remplacer ni supprimer ; remplacement complet sur demande explicite. */
export function planBodyImport(imported: BodyTracking, local: BodyTracking, mode: BodyImportMode): BodyImportPlan {
  if (mode === 'replace') {
    return { heightCm: imported.heightCm, weighIns: sortWeighIns(imported.weighIns), conflicts: [], heightConflict: false, replace: true };
  }
  const byDate = new Map(local.weighIns.map((w) => [w.date, w]));
  const weighIns: WeighIn[] = [];
  const conflicts: WeighIn[] = [];
  for (const w of imported.weighIns) {
    const same = byDate.get(w.date);
    if (!same) weighIns.push(w);
    else if (Math.round(same.weightKg * 100) !== Math.round(w.weightKg * 100)) conflicts.push(w);
  }
  const heightConflict = local.heightCm !== null && imported.heightCm !== null && local.heightCm !== imported.heightCm;
  return {
    heightCm: local.heightCm === null && imported.heightCm !== null ? imported.heightCm : undefined,
    weighIns: sortWeighIns(weighIns),
    conflicts,
    heightConflict,
    replace: false,
  };
}
