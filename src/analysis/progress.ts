/**
 * Consultation et analyse de la progression (§19) : fonctions pures, calculées à partir des évaluations
 * du moteur (seule source de vérité). Aucun score inventé ; jamais de conclusion sur une seule séance.
 */
import type { Session, Status } from '../domain/types';
import { evaluationTrack, GREEN_STREAK_TO_PROGRESS, sortSessions, type Evaluation, type Palier, type Profile } from '../engine';

/** Fenêtre d'analyse : les 6 dernières séances de l'exercice-variante (§19.3). */
export const ANALYSIS_WINDOW = 6;
/** Rouges consécutives à partir desquelles un exercice est « en difficulté » (§19.3). */
export const DIFFICULTY_RED_STREAK = 2;

export type ProgressCategory =
  /** Au moins un palier validé sur les 6 dernières séances. */
  | 'progressing'
  /** Aucun palier validé sur les 6 dernières séances, sans rouges répétées en cours. */
  | 'stable'
  /** Au moins 2 rouges consécutives en cours. */
  | 'difficulty'
  /** Une seule séance évaluée : trop tôt pour conclure. */
  | 'new';

export interface VariantProgress {
  variantId: string;
  /** Suivi de la maison d'un exercice à charge (version 1.26.0), classé à part. */
  home?: true;
  category: ProgressCategory;
  /** Séances évaluées prises en compte (au plus 6). */
  sessions: number;
  /** Paliers validés dans la fenêtre. */
  validated: number;
  redStreak: number;
}

/** Un palier est validé quand il atteint le nombre de validations consécutives requis (§7.5). */
export function isPalierValidated(ev: Evaluation): boolean {
  return ev.validation && ev.greenStreak >= GREEN_STREAK_TO_PROGRESS;
}

export function analyzeProgress(evaluations: readonly Evaluation[], profile: Profile): VariantProgress[] {
  // Par suivi : la salle et la maison d'un exercice à charge sont analysées séparément.
  const byTrack = new Map<string, Evaluation[]>();
  for (const ev of evaluations) {
    const track = evaluationTrack(ev);
    const list = byTrack.get(track) ?? [];
    list.push(ev);
    byTrack.set(track, list);
  }
  const out: VariantProgress[] = [];
  for (const [track, list] of byTrack) {
    const { variantId, home } = list[0]!;
    const window = list.slice(-ANALYSIS_WINDOW);
    const validated = window.filter(isPalierValidated).length;
    const redStreak = profile.variants[track]?.redStreak ?? 0;
    let category: ProgressCategory;
    if (list.length < 2) category = 'new';
    else if (redStreak >= DIFFICULTY_RED_STREAK) category = 'difficulty';
    else if (validated > 0) category = 'progressing';
    else category = 'stable';
    out.push({ variantId, ...(home ? { home } : {}), category, sessions: window.length, validated, redStreak });
  }
  return out;
}

export interface PalierChange {
  variantId: string;
  /** Suivi de la maison (version 1.26.0). */
  home?: true;
  sessionId: string;
  date: string;
  from: Palier;
  to: Palier;
}

/** Dernières évolutions de charge ou de cible (§19.3), de la plus récente à la plus ancienne. */
export function recentChanges(evaluations: readonly Evaluation[], sessions: readonly Session[], limit = 10): PalierChange[] {
  const dates = new Map(sessions.map((s) => [s.id, s.date]));
  const last = new Map<string, Palier>();
  const changes: PalierChange[] = [];
  for (const ev of evaluations) {
    const track = evaluationTrack(ev);
    const prev = last.get(track);
    if (prev && (prev.weightKg !== ev.palier.weightKg || prev.targetReps !== ev.palier.targetReps)) {
      changes.push({
        variantId: ev.variantId,
        ...(ev.home ? { home: ev.home } : {}),
        sessionId: ev.sessionId,
        date: dates.get(ev.sessionId) ?? '',
        from: prev,
        to: ev.palier,
      });
    }
    last.set(track, ev.palier);
  }
  return changes.reverse().slice(0, limit);
}

export interface ChartPoint {
  date: string;
  sessionId: string;
  weightKg: number;
  /** Moyenne des répétitions réalisées par série ; null pour un historique partiel. */
  avgReps: number | null;
  targetReps: number | null;
  status: Status | null;
}

/**
 * Points du graphique d'évolution d'un exercice-variante (§19.2), dans l'ordre chronologique ; `include` limite les
 * séances (un exercice à charge : celles de la salle, version 1.26.0).
 */
export function chartSeries(
  variantId: string,
  sessions: readonly Session[],
  evaluations: readonly Evaluation[],
  include: (s: Session) => boolean = () => true,
): ChartPoint[] {
  const points: ChartPoint[] = [];
  for (const s of sortSessions(sessions.filter((x) => x.state === 'done' && include(x)))) {
    const p = s.performances.find((x) => x.variantId === variantId);
    if (!p) continue;
    const ev = evaluations.find((e) => e.sessionId === s.id && e.variantId === variantId);
    points.push({
      date: s.date,
      sessionId: s.id,
      weightKg: p.weightKg,
      avgReps: p.reps.length > 0 ? Math.round((p.reps.reduce((a, b) => a + b, 0) / p.reps.length) * 10) / 10 : null,
      targetReps: p.targetReps,
      status: ev?.status ?? null,
    });
  }
  return points;
}
