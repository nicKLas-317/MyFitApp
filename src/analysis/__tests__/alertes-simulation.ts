/**
 * Données simulées pour l'alerte « groupe moins travaillé » (version 1.38.0, §19.11) : jamais chargées par
 * l'application (vérifié par le test 289). Deux séances par semaine à 18 h, du lundi 31 août 2026 au lundi 9 novembre
 * (semaine en cours si l'on se place le mercredi 11 novembre) :
 * - lundi : chest press et pec deck (pectoraux 6 séries ; triceps et épaules ½ × 3), élévations latérales (épaules 3),
 *   extension triceps poulie (triceps 3) ;
 * - jeudi : tirage vertical (dos 3 ; biceps ½ × 3), lombaires au banc (dos 3), curl haltères (biceps 3), presse à
 *   cuisses (jambes 3).
 * Totaux d'une semaine ordinaire : pectoraux 6, dos 6, épaules 4,5, biceps 4,5, triceps 4,5, jambes 3.
 * Scénario par défaut :
 * - vacances la semaine du 21 septembre (aucune séance) ;
 * - dos en baisse 2 semaines (26 oct. et 2 nov. : plus de lombaires, 3 séries) ;
 * - pectoraux en baisse 1 semaine seulement (2 nov. : plus de pec deck, 3 séries).
 */
import type { Performance, Session } from '../../domain/types';
import { defaultSessionName } from '../../session/format';

export interface AlertScenario {
  /** Premier lundi (« YYYY-MM-DD »). */
  from?: string;
  /** Dernier lundi, compris (sa semaine est la semaine en cours le 11 novembre). */
  until?: string;
  /** Lundis des semaines sans séance. */
  vacations?: string[];
  /** Lundis des semaines où le dos baisse (jeudi sans lombaires). */
  dosDown?: string[];
  /** Lundis des semaines où les pectoraux baissent (lundi sans pec deck). */
  pecDown?: string[];
}

export const ALERT_SCENARIO: Required<AlertScenario> = {
  from: '2026-08-31',
  until: '2026-11-09',
  vacations: ['2026-09-21'],
  dosDown: ['2026-10-26', '2026-11-02'],
  pecDown: ['2026-11-02'],
};

/** Mercredi 11 novembre 2026, midi : semaines terminées du 31 août au 2 novembre. */
export const ALERT_NOW = new Date(2026, 10, 11, 12).getTime();

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function session(date: Date, variants: string[]): Session {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 18).getTime();
  const performances: Performance[] = variants.map((variantId) => ({
    variantId,
    weightKg: variantId === 'lombaires-banc' ? 10 : 20,
    targetReps: 10,
    plannedSets: 3,
    reps: [10, 10, 10],
    feeling: 'bien',
  }));
  return {
    id: `alerte-${iso(date)}`, name: defaultSessionName(start), date: iso(date), startedAt: start, endedAt: start + 60 * 60_000,
    createdAt: start, updatedAt: start, origin: 'app', state: 'done', performances,
  };
}

/** Séances simulées du scénario, dans l'ordre chronologique (le jeudi de la dernière semaine n'est pas encore venu). */
export function alertHistory(scenario: AlertScenario = {}): Session[] {
  const s = { ...ALERT_SCENARIO, ...scenario };
  const [y = 2026, m = 1, d = 1] = s.from.split('-').map(Number);
  const sessions: Session[] = [];
  for (const monday = new Date(y, m - 1, d); iso(monday) <= s.until; monday.setDate(monday.getDate() + 7)) {
    const week = iso(monday);
    if (s.vacations.includes(week)) continue;
    sessions.push(session(monday, ['chest-press', ...(s.pecDown.includes(week) ? [] : ['pec-deck']), 'elevations-laterales', 'extension-triceps-poulie']));
    if (week === s.until) continue;
    const thursday = new Date(monday);
    thursday.setDate(thursday.getDate() + 3);
    sessions.push(session(thursday, ['tirage-vertical', ...(s.dosDown.includes(week) ? [] : ['lombaires-banc']), 'curl-biceps-halteres', 'presse-a-cuisses']));
  }
  return sessions;
}
