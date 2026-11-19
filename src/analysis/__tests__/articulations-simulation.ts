/**
 * Données simulées pour l'alerte « articulation trop sollicitée » (version 1.53.0, §19.14) : jamais chargées par
 * l'application (vérifié par le test 320). Deux séances par semaine à 18 h, du lundi 12 octobre au lundi 16 novembre
 * 2026 :
 * - lundi : curl haltères et extension triceps poulie (coude 6), leg extension (genou 3) ;
 * - jeudi : pec deck et élévations latérales (épaule 6), presse à cuisses (genou 3).
 * Semaine ordinaire : épaule 6, coude 6, genou 6. Par défaut, la semaine du 9 novembre ajoute le jeudi quatre exercices
 * pour le coude (`ELBOW_EXTRA`) : coude 18 contre 6.
 * `full` : en plus, le lundi curl marteau, kickback, lombaires et shrugs, le jeudi écarté poulie et élévations frontales :
 * chaque groupe du récapitulatif à 6 séries (aucune alerte « groupe moins travaillé »), épaule 12, coude 12, genou 6.
 */
import type { Performance, Session } from '../../domain/types';
import { defaultSessionName } from '../../session/format';

/** Lundi 16 novembre 2026, 9 h : dernière semaine terminée, celle du 9 novembre. */
export const JOINT_NOW = new Date(2026, 10, 16, 9).getTime();
/** Quatre exercices pour le coude (coude 1 chacun). */
export const ELBOW_EXTRA = ['curl-biceps-barre-droite', 'curl-biceps-poulie-corde', 'barre-au-front', 'curl-pupitre'];

export interface JointScenario {
  from?: string;
  until?: string;
  vacations?: string[];
  /** Exercices ajoutés au jeudi de la semaine (lundi). */
  extra?: Record<string, string[]>;
  full?: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function perf(variantId: string, sets = 3): Performance {
  return { variantId, weightKg: 20, targetReps: 10, plannedSets: sets, reps: Array<number>(sets).fill(10), feeling: 'bien' };
}

export function jointSession(day: Date, variants: (string | Performance)[], extra: Partial<Session> = {}): Session {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 18).getTime();
  return {
    id: `art-${iso(day)}`, name: defaultSessionName(start), date: iso(day), startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start,
    origin: 'app', state: 'done', performances: variants.map((v) => (typeof v === 'string' ? perf(v) : v)), ...extra,
  };
}

export function jointHistory({ from = '2026-10-12', until = '2026-11-16', vacations = [], extra = { '2026-11-09': ELBOW_EXTRA }, full = false }: JointScenario = {}): Session[] {
  const [y = 2026, m = 1, d = 1] = from.split('-').map(Number);
  const out: Session[] = [];
  for (const monday = new Date(y, m - 1, d); iso(monday) <= until; monday.setDate(monday.getDate() + 7)) {
    const week = iso(monday);
    if (vacations.includes(week)) continue;
    out.push(jointSession(monday, ['curl-biceps-halteres', 'extension-triceps-poulie', 'leg-extension', ...(full ? ['curl-marteau', 'kickback', 'lombaires-banc', 'shrugs'] : [])]));
    const thursday = new Date(monday);
    thursday.setDate(thursday.getDate() + 3);
    if (iso(thursday) > until) continue;
    out.push(jointSession(thursday, ['pec-deck', 'elevations-laterales', 'presse-a-cuisses', ...(full ? ['ecarte-poulie', 'elevations-frontales'] : []), ...(extra[week] ?? [])]));
  }
  return out;
}

/** Exercices de 3 séries ajoutés à la séance du jour donné (« YYYY-MM-DD »). */
export function withExercises(sessions: Session[], date: string, variants: string[]): Session[] {
  return sessions.map((s) => (s.date === date ? { ...s, performances: [...s.performances, ...variants.map((v) => perf(v))] } : s));
}
