/**
 * Records personnels, par exercice-variante : calcul pur, refait à chaque affichage à partir de tout l'historique
 * (séances saisies et importées), donc rétroactif et à jour après la correction ou la suppression d'une séance.
 * Aucun effet sur le moteur de progression. Le cardio et les activités habituelles n'ont pas de record.
 *
 * Une performance compte si toutes les séries prévues ont été faites à la cible. La meilleure : charge la plus
 * élevée (aide la plus basse pour un exercice assisté), puis à charge égale le plus de répétitions par série, puis
 * le plus de séries. Un record n'est battu que par une performance strictement meilleure.
 */
import type { Performance, Session } from '../domain/types';
import { compareDifficulty, resolveConfig, sortSessions, type EngineSettings } from '../engine';
import { formatKg, formatShortDay } from '../session/format';

export interface PersonalRecord {
  variantId: string;
  sessionId: string;
  /** Date de la séance, « YYYY-MM-DD ». */
  date: string;
  weightKg: number;
  sets: number;
  reps: number;
  assisted: boolean;
}

export interface RecordBreak extends PersonalRecord {
  /** Record battu. */
  previous: PersonalRecord;
}

export interface Records {
  /** Record actuel de chaque exercice-variante. */
  current: Map<string, PersonalRecord>;
  /**
   * Records battus, dans l'ordre chronologique. La toute première performance qui compte devient le record sans
   * être célébrée : elle n'est pas dans cette liste.
   */
  breaks: RecordBreak[];
}

/** Toutes les séries prévues faites, toutes à la cible (les répétitions ne dépassent jamais la cible). */
export function countsForRecord(p: Performance): boolean {
  const sets = p.plannedSets ?? 0;
  const target = p.targetReps ?? 0;
  return !p.partial && sets > 0 && target > 0 && p.reps.length >= sets && p.reps.every((r) => r >= target);
}

type Mark = Pick<PersonalRecord, 'weightKg' | 'sets' | 'reps' | 'assisted'>;

/** Positif si `a` est meilleure que `b`. */
export function compareMarks(a: Mark, b: Mark): number {
  return compareDifficulty(a.weightKg, b.weightKg, a.assisted) || a.reps - b.reps || a.sets - b.sets;
}

function markOf(p: Performance, assisted: boolean): Mark {
  return { weightKg: p.weightKg, sets: p.plannedSets ?? 0, reps: p.targetReps ?? 0, assisted };
}

/** Records de tout l'historique : séances terminées, dans l'ordre chronologique du moteur (§7.9). */
export function computeRecords(sessions: readonly Session[], settings: EngineSettings): Records {
  const current = new Map<string, PersonalRecord>();
  const breaks: RecordBreak[] = [];
  for (const s of sortSessions(sessions.filter((x) => x.state === 'done'))) {
    const seen = new Set<string>();
    for (const p of s.performances) {
      if (seen.has(p.variantId) || !countsForRecord(p)) continue;
      seen.add(p.variantId);
      const record: PersonalRecord = { variantId: p.variantId, sessionId: s.id, date: s.date, ...markOf(p, resolveConfig(settings, p.variantId).assisted) };
      const previous = current.get(p.variantId);
      if (!previous) current.set(p.variantId, record);
      else if (compareMarks(record, previous) > 0) {
        current.set(p.variantId, record);
        breaks.push({ ...record, previous });
      }
    }
  }
  return { current, breaks };
}

/** La performance bat le record actuel (et il en existait un) : « Nouveau record ! » pendant la séance. */
export function beatsRecord(p: Performance, record: PersonalRecord | undefined, assisted: boolean): boolean {
  return record !== undefined && countsForRecord(p) && compareMarks(markOf(p, assisted), record) > 0;
}

/** Performances qui ont battu un record, « séance|variante », pour la couronne de l'historique. */
export function recordKeys(records: Records): Set<string> {
  return new Set(records.breaks.map((b) => `${b.sessionId}|${b.variantId}`));
}

/** « 3 × 9 à 20 kg », « 3 × 12 avec 30 kg d’aide », « 3 × 25 » (poids du corps). */
export function formatRecord(r: Mark): string {
  if (r.weightKg === 0) return `${r.sets} × ${r.reps}`;
  return `${r.sets} × ${r.reps} ${r.assisted ? `avec ${formatKg(r.weightKg)} d’aide` : `à ${formatKg(r.weightKg)}`}`;
}

/** « 3 × 9 à 20 kg (16 oct.) ». */
export function formatRecordWithDate(r: PersonalRecord): string {
  return `${formatRecord(r)} (${formatShortDay(r.date)})`;
}
