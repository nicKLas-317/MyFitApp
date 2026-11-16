/**
 * Proposition d'ajuster le nombre de séries (version 1.49.0) : un exercice fait 3 séances d'affilée, dans le même suivi,
 * avec le même nombre de séries, inférieur à son nombre de séries standard, propose de passer à ce nombre (« Tu fais
 * souvent 2 séries : passer à 2 ? »). Jamais à la hausse. Fonctions pures, refaites à l'affichage, jamais stockées.
 */
import type { Exercise, Session, VariantConfig } from '../domain/types';
import { compareSessions, resolveConfig, sortSessions, trackKey, type EngineSettings, type SessionKey } from '../engine';
import { setVariantConfig } from '../library/edit';

/** Séances d'affilée nécessaires. */
export const SETS_HINT_STREAK = 3;

/**
 * « Non » à une proposition, mémorisé sur l'appareil seulement (méta `setsHintDismissed`) : suivi → séance de la
 * dernière performance au moment du refus. La proposition ne revient qu'avec 3 nouvelles séances, toutes après elle.
 */
export type SetsHintDismissed = Record<string, SessionKey>;

export interface SetsHint {
  /** Suivi concerné : l'exercice-variante (salle, ou un seul suivi), ou « <variante>@maison ». */
  track: string;
  /** Nombre de séries fait les 3 dernières fois, à proposer comme nombre de séries standard. */
  sets: number;
  /** Nombre de séries standard actuel. */
  standard: number;
  /** Séance de la dernière des 3 performances (gardée en cas de refus). */
  last: SessionKey;
}

const keyOf = (s: Session): SessionKey => ({ id: s.id, date: s.date, startedAt: s.startedAt, createdAt: s.createdAt });

/**
 * Proposition pour un suivi, ou null. Comptent les séances terminées, chacune une fois, avec le nombre de séries
 * réellement enregistrées ; une performance sans série (partielle importée, exercice resté sans série) est ignorée.
 */
export function setsHint(sessions: readonly Session[], settings: EngineSettings, track: string, dismissed?: SessionKey): SetsHint | null {
  const counts: { sets: number; session: Session }[] = [];
  for (const s of sortSessions(sessions.filter((x) => x.state === 'done'))) {
    const perf = s.performances.find(
      (p) => !p.partial && p.reps.length > 0 && trackKey(settings, p.variantId, s.location === 'maison') === track,
    );
    if (perf) counts.push({ sets: perf.reps.length, session: s });
  }
  const last = counts.slice(-SETS_HINT_STREAK);
  if (last.length < SETS_HINT_STREAK) return null;
  const sets = last[0]!.sets;
  if (!last.every((c) => c.sets === sets)) return null;
  const standard = resolveConfig(settings, track).sets;
  if (sets >= standard) return null;
  if (dismissed && !last.every((c) => compareSessions(c.session, dismissed) > 0)) return null;
  return { track, sets, standard, last: keyOf(last[last.length - 1]!.session) };
}

/** Texte de la proposition : « Tu fais souvent 2 séries : passer à 2 ? ». */
export function setsHintText(hint: Pick<SetsHint, 'sets'>): string {
  return `Tu fais souvent ${hint.sets} série${hint.sets > 1 ? 's' : ''} : passer à ${hint.sets} ?`;
}

/**
 * « Oui » : le nombre de séries standard de l'exercice-variante devient celui proposé ; le reste de ses réglages
 * (plage, type, cible de départ, plage de la maison) ne change pas, ni la cible, ni l'historique.
 */
export function applySetsHint(exercise: Exercise, variantId: string, cfg: VariantConfig, sets: number): Exercise {
  return setVariantConfig(exercise, variantId, { ...cfg, sets });
}

/** « Non » : mémorise la dernière séance de la série refusée. */
export function dismissSetsHint(current: SetsHintDismissed, hint: Pick<SetsHint, 'track' | 'last'>): SetsHintDismissed {
  return { ...current, [hint.track]: hint.last };
}

/** Mémoire des refus lue dans la base : seules les entrées bien formées sont gardées. */
export function sanitizeSetsHintDismissed(value: unknown): SetsHintDismissed {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: SetsHintDismissed = {};
  for (const [track, key] of Object.entries(value as Record<string, unknown>)) {
    if (!key || typeof key !== 'object') continue;
    const k = key as Record<string, unknown>;
    const time = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v));
    if (typeof k.id === 'string' && typeof k.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k.date) && time(k.startedAt) && typeof k.createdAt === 'number' && Number.isFinite(k.createdAt)) {
      out[track] = { id: k.id, date: k.date, startedAt: k.startedAt as number | null, createdAt: k.createdAt };
    }
  }
  return out;
}
