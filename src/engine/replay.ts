import type { Session } from '../domain/types';
import { resolveConfig, type EngineSettings } from './config';
import { applyPerformance, type Evaluation, type ProgressState } from './progression';
import { isEvaluable, validatePerformance, type PerformanceError } from './status';

/** Clé de tri chronologique d'une séance (§7.9). */
export type SessionKey = Pick<Session, 'id' | 'date' | 'startedAt' | 'createdAt'>;

/** Profil global de progression (§9) : donnée dérivée, reconstructible à tout moment. */
export interface Profile {
  variants: Record<string, ProgressState>;
  appliedSessionIds: string[];
  lastSessionKey: SessionKey | null;
}

export type IgnoredReason = 'partial' | 'duplicate_variant' | PerformanceError;

export interface IgnoredPerformance {
  sessionId: string;
  variantId: string;
  reasons: IgnoredReason[];
}

export interface ReplayResult {
  profile: Profile;
  /** Évaluations dans l'ordre du rejeu : statut, validation et compteurs de chaque performance. */
  evaluations: Evaluation[];
  /** Performances non prises en compte par le moteur, avec la raison. */
  ignored: IgnoredPerformance[];
}

export const EMPTY_PROFILE: Profile = { variants: {}, appliedSessionIds: [], lastSessionKey: null };

/**
 * Ordre chronologique déterministe (§7.9) : date, puis heure de début lorsqu'elle est connue
 * (les séances à heure connue passent avant celles sans heure le même jour), puis date
 * d'enregistrement, puis identifiant pour départager tout ex aequo.
 */
export function compareSessions(a: SessionKey, b: SessionKey): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const aKnown = a.startedAt !== null;
  const bKnown = b.startedAt !== null;
  if (aKnown !== bKnown) return aKnown ? -1 : 1;
  if (a.startedAt !== null && b.startedAt !== null && a.startedAt !== b.startedAt) {
    return a.startedAt - b.startedAt;
  }
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function sortSessions<T extends SessionKey>(sessions: readonly T[]): T[] {
  return [...sessions].sort(compareSessions);
}

function sessionKey(s: Session): SessionKey {
  return { id: s.id, date: s.date, startedAt: s.startedAt, createdAt: s.createdAt };
}

/** Applique une séance terminée au profil, sans contrôle d'ordre. */
function foldSession(profile: Profile, session: Session, settings: EngineSettings): ReplayResult {
  const variants = { ...profile.variants };
  const evaluations: Evaluation[] = [];
  const ignored: IgnoredPerformance[] = [];
  const seenVariants = new Set<string>();

  for (const perf of session.performances) {
    const base = { sessionId: session.id, variantId: perf.variantId };
    // Un exercice-variante ne compte qu'une fois par séance (§5.2, §7.5).
    if (seenVariants.has(perf.variantId)) {
      ignored.push({ ...base, reasons: ['duplicate_variant'] });
      continue;
    }
    seenVariants.add(perf.variantId);

    const cfg = resolveConfig(settings, perf.variantId);
    const errors = validatePerformance(perf, cfg.bodyweight);
    if (errors.length > 0) {
      ignored.push({ ...base, reasons: errors });
      continue;
    }
    if (!isEvaluable(perf)) {
      ignored.push({ ...base, reasons: ['partial'] });
      continue;
    }
    const { state, evaluation } = applyPerformance(variants[perf.variantId], perf, session.id, cfg);
    variants[perf.variantId] = state;
    evaluations.push(evaluation);
  }

  return {
    profile: {
      variants,
      appliedSessionIds: [...profile.appliedSessionIds, session.id],
      lastSessionKey: sessionKey(session),
    },
    evaluations,
    ignored,
  };
}

/**
 * Reconstruit entièrement le profil en rejouant l'historique dans l'ordre chronologique (§7.9).
 * Seules les séances terminées sont rejouées ; un identifiant de séance n'est compté qu'une fois.
 */
export function rebuildProfile(sessions: readonly Session[], settings: EngineSettings): ReplayResult {
  let profile = EMPTY_PROFILE;
  const evaluations: Evaluation[] = [];
  const ignored: IgnoredPerformance[] = [];
  const seenSessions = new Set<string>();

  for (const session of sortSessions(sessions.filter((s) => s.state === 'done'))) {
    if (seenSessions.has(session.id)) continue;
    seenSessions.add(session.id);
    const result = foldSession(profile, session, settings);
    profile = result.profile;
    evaluations.push(...result.evaluations);
    ignored.push(...result.ignored);
  }
  return { profile, evaluations, ignored };
}

/**
 * Mise à jour incrémentale du cache par une séance qui vient d'être terminée.
 * Renvoie null si l'ajout incrémental ne donnerait pas le même résultat qu'un rejeu complet
 * (séance non terminée, déjà comptée, ou antérieure à la dernière séance appliquée) :
 * l'appelant doit alors utiliser `rebuildProfile`.
 */
export function appendSession(
  profile: Profile,
  session: Session,
  settings: EngineSettings,
): ReplayResult | null {
  if (session.state !== 'done') return null;
  if (profile.appliedSessionIds.includes(session.id)) return null;
  if (profile.lastSessionKey && compareSessions(sessionKey(session), profile.lastSessionKey) <= 0) {
    return null;
  }
  return foldSession(profile, session, settings);
}
