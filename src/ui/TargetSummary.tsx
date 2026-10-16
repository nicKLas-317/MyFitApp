import type { ProgressMarker, ProgressState } from '../engine';
import { formatKg, formatShortDay } from '../session/format';
import { formatRecommendation } from './labels';
import { ProgressMarkerBanner } from './ProgressMarker';
import { StatusBadge } from './StatusBadge';

interface Props {
  /** État du moteur pour l'exercice-variante ; absent pour un exercice jamais réalisé. */
  state: ProgressState | undefined;
  assisted: boolean;
  /** Date (AAAA-MM-JJ) de la dernière séance évaluée. */
  lastDate: string | null;
  /** Repère à afficher sous la cible (§5.3.1), ou null. */
  marker: ProgressMarker | null;
  /** La cible change, mais l'utilisateur a saisi une autre charge ou une autre cible : ni repère ni mention. */
  deviated?: boolean;
  /** Cible d'un exercice jamais réalisé. */
  start: { sets: number; reps: number };
  /** Identifiant de test de la cible. */
  targetTestId?: string;
}

/**
 * « Dernière fois » et « Prochaine cible » (§5.3.2) : deux zones distinctes. La dernière fois, secondaire, sur une
 * ligne ; la prochaine cible, principale, en grand et dans la couleur du groupe, suivie d'une indication (repère de
 * progression, ou « = Même cible : consolide »). Aucune couleur de statut hors de la pastille.
 */
export function TargetSummary({ state, assisted, lastDate, marker, deviated = false, start, targetTestId }: Props) {
  const last = state?.lastPerformance;
  const rec = state?.recommendation;
  const atWeight = state && rec && (rec.kind === 'keep' || rec.kind === 'reps_up') ? ` à ${formatKg(state.palier.weightKg)}` : '';
  return (
    <div className="target-summary" data-testid="target-summary">
      <p className="last-zone" data-testid="last-time">
        <span className="zone-label">Dernière fois</span>
        {last ? (
          <>
            <span className="last-values">
              {assisted && 'aide '}
              {formatKg(last.weightKg)} · {last.reps.join(' · ') || '—'}
              {lastDate && ` · ${formatShortDay(lastDate)}`}
            </span>
            <StatusBadge status={state.lastStatus} />
          </>
        ) : (
          <span className="last-values">jamais réalisé</span>
        )}
      </p>
      <div className="next-zone">
        <p className="zone-label">Prochaine cible</p>
        <p className="next-target" data-testid="next-target">
          <strong data-testid={targetTestId}>{rec ? formatRecommendation(rec, assisted) : `${start.sets} × ${start.reps}`}</strong>
          {atWeight}
        </p>
        {!state ? (
          <p className="next-hint" data-testid="start-hint">
            Poids de départ à saisir
          </p>
        ) : marker ? (
          <ProgressMarkerBanner marker={marker} assisted={assisted} />
        ) : (
          !deviated && (
            <p className="next-hint" data-testid="same-target">
              = Même cible : consolide
            </p>
          )
        )}
      </div>
    </div>
  );
}
