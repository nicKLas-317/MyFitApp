import { Fragment } from 'react';
import { compareWeight, progressMarker, type ProgressMarker, type ProgressState } from '../engine';
import type { Performance } from '../domain/types';
import { formatRecordWithDate, type PersonalRecord } from '../analysis/records';
import { Crown } from './Crown';
import { formatKg, formatNumericDay } from '../session/format';
import { loadChangeLabel, markerArrow, markerLabel } from './labels';
import { StatusBadge } from './StatusBadge';

/**
 * Mention sous la cible (§5.3.1, §5.3.2) : exercice jamais réalisé, changement recommandé (« ↑ +1 rép. »,
 * « ↑ Poids supérieur »), ou cible identique à la dernière fois. Null : rien (l'utilisateur a choisi une autre
 * charge ou une autre cible, ce n'est plus la progression recommandée).
 */
export type TargetHint =
  | { kind: 'start' }
  | { kind: 'same' }
  | { kind: 'change'; arrow: '↑' | '↓'; label: string; detail?: string }
  | null;

/** Ligne de cible : « 3 × 9 à 30 kg », « 3 × 9 avec 25 kg d’aide », ou « 3 × 8 » sans charge connue. */
export interface TargetLine {
  sets: number;
  reps: number;
  weightKg: number | null;
}

interface Props {
  /** État du moteur pour l'exercice-variante ; absent pour un exercice jamais réalisé. */
  state: ProgressState | undefined;
  assisted: boolean;
  /** Date (AAAA-MM-JJ) de la dernière séance évaluée. */
  lastDate: string | null;
  /** Libellé de la zone principale : « Prochaine cible » (fiche) ou « Cible » (séance). */
  label: string;
  target: TargetLine;
  hint: TargetHint;
  /** Identifiant de test de la cible (séries × répétitions). */
  targetTestId?: string;
  /** Record personnel, affiché sur la fiche (couronne dorée). */
  record?: PersonalRecord | null;
}

export function formatTargetLoad(weightKg: number, assisted: boolean): string {
  return assisted ? ` avec ${formatKg(weightKg)} d’aide` : ` à ${formatKg(weightKg)}`;
}

/** Repère de progression (§5.3.1) en mention courte : « ↑ +1 rép. », « ↑ Poids supérieur », « ↓ Plus d’aide »… */
export function markerHint(marker: ProgressMarker, assisted: boolean): TargetHint {
  return { kind: 'change', arrow: markerArrow(marker), label: markerLabel(marker, assisted) };
}

/** Changement de charge recommandé (§7.6, §7.8), en mention : « ↑ Poids supérieur », « ↓ Plus d’aide ». */
export function loadChangeHint(kind: 'weight_up' | 'weight_down', assisted: boolean, detail?: string): TargetHint {
  return { kind: 'change', arrow: kind === 'weight_up' ? '↑' : '↓', label: loadChangeLabel(kind, assisted), ...(detail ? { detail } : {}) };
}

/**
 * Prochaine cible recommandée par le moteur (fiche) : la cible, avec la charge du palier quand elle ne change pas ;
 * sans charge quand le moteur recommande d'en changer (c'est l'utilisateur qui saisit la nouvelle).
 */
export function recommendedTarget(state: ProgressState | undefined, start: { sets: number; reps: number }, assisted: boolean): { target: TargetLine; hint: TargetHint } {
  const rec = state?.recommendation;
  if (!state || !rec) return { target: { ...start, weightKg: null }, hint: { kind: 'start' } };
  const change = rec.kind === 'weight_up' || rec.kind === 'weight_down' ? rec.kind : null;
  const marker = progressMarker(state);
  return {
    target: { sets: rec.plannedSets, reps: rec.targetReps, weightKg: change ? null : state.palier.weightKg },
    hint: change ? loadChangeHint(change, assisted) : marker ? markerHint(marker, assisted) : { kind: 'same' },
  };
}

/**
 * Mention de la carte d'un exercice de la séance (et d'un exercice de la séance prévue, §5.9) d'après la charge et la
 * cible saisies : changement de charge à saisir (« ↑ Poids supérieur → 3 × 8 »), repère de progression (§5.3.1),
 * cible identique ; rien si l'utilisateur a choisi une autre charge ou une autre cible.
 */
export function cardHint(
  state: ProgressState | undefined,
  assisted: boolean,
  p: Pick<Performance, 'weightKg' | 'targetReps' | 'plannedSets'>,
): { hint: TargetHint; weightChange: 'weight_up' | 'weight_down' | null } {
  const rec = state?.recommendation;
  if (!state) return { hint: { kind: 'start' }, weightChange: null };
  const samePalier = compareWeight(p.weightKg, state.palier.weightKg) === 0;
  // Le moteur recommande un changement de charge et la charge n'a pas encore été modifiée (§5.3).
  const weightChange = rec && (rec.kind === 'weight_up' || rec.kind === 'weight_down') && samePalier ? rec.kind : null;
  // Repère de progression : il disparaît si l'utilisateur change la charge ou la cible.
  const marker = progressMarker(state);
  const shownMarker = marker && samePalier && (marker.kind !== 'reps_up' || p.targetReps === marker.to.targetReps) ? marker : null;
  const followsRecommendation = !!rec && samePalier && p.targetReps === rec.targetReps && p.plannedSets === rec.plannedSets;
  const hint: TargetHint =
    weightChange && rec
      ? loadChangeHint(weightChange, assisted, `→ ${rec.plannedSets} × ${rec.targetReps}`)
      : shownMarker
        ? markerHint(shownMarker, assisted)
        : !marker && followsRecommendation
          ? { kind: 'same' }
          : null;
  return { hint, weightChange };
}

/** Ligne de cible en grand (« 3 × 9 à 30 kg ») et sa mention dessous. */
export function NextTarget({
  target,
  assisted,
  hint,
  targetTestId = 'target',
  startLabel = 'Poids de départ à saisir',
}: {
  target: TargetLine;
  assisted: boolean;
  hint: TargetHint;
  targetTestId?: string;
  /** Mention d'un exercice jamais réalisé (séance prévue : le poids de départ est déjà donné). */
  startLabel?: string;
}) {
  return (
    <>
      <p className="next-target" data-testid="next-target">
        <strong data-testid={targetTestId}>
          {target.sets} × {target.reps}
        </strong>
        {target.weightKg !== null && target.weightKg > 0 && formatTargetLoad(target.weightKg, assisted)}
      </p>
      {hint?.kind === 'start' && (
        <p className="next-hint" data-testid="start-hint">
          {startLabel}
        </p>
      )}
      {hint?.kind === 'same' && (
        <p className="next-hint" data-testid="same-target">
          = Même cible : consolide
        </p>
      )}
      {hint?.kind === 'change' && (
        <p className="next-hint change" role="status" data-testid="progress-marker">
          <span aria-hidden="true">{hint.arrow} </span>
          <span>{hint.label}</span>
          {hint.detail && <span> {hint.detail}</span>}
        </p>
      )}
    </>
  );
}

/**
 * « Dernière fois » et cible (§5.3.2) : deux zones distinctes. La dernière fois, secondaire, jamais tronquée (date
 * courte « 15/10 », retour à la ligne si l'écran est étroit) ; la cible, une seule ligne en grand dans la couleur du
 * groupe, avec la charge, puis une courte mention. Aucune couleur de statut hors de la pastille.
 */
export function TargetSummary({ state, assisted, lastDate, label, target, hint, targetTestId = 'target', record }: Props) {
  const last = state?.lastPerformance;
  return (
    <div className="target-summary" data-testid="target-summary">
      <p className="last-zone" data-testid="last-time">
        <span className="zone-label">Dernière fois</span>
        {last ? (
          <>
            <span className="last-values">
              {assisted && 'aide '}
              {/* Chaque élément reste entier ; la ligne passe à la ligne entre deux éléments plutôt que d'être tronquée. */}
              {[formatKg(last.weightKg), ...(last.reps.length ? last.reps : ['—']), ...(lastDate ? [formatNumericDay(lastDate)] : [])].map((part, i) => (
                <Fragment key={i}>
                  {i > 0 && ' '}
                  <span className="last-part">
                    {i > 0 && '· '}
                    {part}
                  </span>
                </Fragment>
              ))}
            </span>
            <StatusBadge status={state.lastStatus} />
          </>
        ) : (
          <span className="last-values">jamais réalisé</span>
        )}
      </p>
      {record && (
        <p className="record-line" data-testid="record">
          <Crown />
          <span>Record : {formatRecordWithDate(record)}</span>
        </p>
      )}
      <div className="next-zone">
        <p className="zone-label">{label}</p>
        <NextTarget target={target} assisted={assisted} hint={hint} targetTestId={targetTestId} />
      </div>
    </div>
  );
}
