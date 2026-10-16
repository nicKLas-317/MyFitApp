import { useState } from 'react';
import type { Performance, Session } from '../domain/types';
import { compareWeight, progressMarker } from '../engine';
import { useApp } from '../app/store';
import { displayName } from '../library/catalog';
import { MUSCLE_GROUP_LABELS } from '../library/seed';
import { formatKg } from '../session/format';
import {
  correctSet,
  deleteLastSet,
  recordSet,
  removeExercise,
  setFeeling,
  setPlannedSets,
  setTarget,
  setWeight,
} from '../session/ops';
import { FeelingPicker } from './FeelingPicker';
import { groupColorProps } from './groupColors';
import { ExercisePicto } from './Pictogram';
import { formatRecommendation } from './labels';
import { StatusBadge } from './StatusBadge';
import { ProgressMarkerBanner } from './ProgressMarker';
import { WeightField } from './WeightField';

interface Props {
  session: Session;
  performance: Performance;
  open: boolean;
  onToggle(): void;
}

export function ExerciseCard({ session, performance: p, open, onToggle }: Props) {
  const { variants, ctxFor, commit } = useApp();
  const ref = variants.get(p.variantId);
  const ctx = ctxFor(p.variantId);
  const { state } = ctx;
  const rec = state?.recommendation;
  const target = p.targetReps ?? 0;
  const planned = p.plannedSets ?? 0;
  const done = p.reps.length;
  const [draft, setDraft] = useState<number | null>(null);
  const [adjust, setAdjust] = useState(false);
  const now = () => Date.now();

  // Le moteur recommande un changement de charge et la charge n'a pas encore été modifiée (§5.3).
  const weightChange =
    rec && state && (rec.kind === 'weight_up' || rec.kind === 'weight_down') && compareWeight(p.weightKg, state.palier.weightKg) === 0
      ? rec.kind
      : null;

  // Repère de progression (§5.3.1) : la cible a changé depuis la dernière séance. Il disparaît si l'utilisateur
  // change la charge ou la cible (ce n'est plus la progression recommandée).
  const marker = progressMarker(state);
  const shownMarker =
    marker && state && compareWeight(p.weightKg, state.palier.weightKg) === 0 && (marker.kind !== 'reps_up' || p.targetReps === marker.to.targetReps)
      ? marker
      : null;

  const name = displayName(ref);
  const nextValue = Math.min(draft ?? target, target);

  return (
    <article
      className={`card exercise-card${open ? ' open' : ''}`}
      data-variant={p.variantId}
      aria-label={name}
      {...(ref ? groupColorProps(ref.exercise.primaryGroup) : {})}
    >
      <button type="button" className="card-header" onClick={onToggle} aria-expanded={open}>
        {ref && <ExercisePicto exercise={ref.exercise} variantId={ref.variant.id} />}
        <span className="card-title">
          <strong>{name}</strong>
          {ref && <span className="muted small">{MUSCLE_GROUP_LABELS[ref.exercise.primaryGroup]}</span>}
        </span>
        <span className="card-summary">
          <span>{formatKg(p.weightKg)}</span>
          <span className="sets-count">
            {done}/{planned}
          </span>
        </span>
      </button>

      {open && (
        <div className="card-body">
          <div className="last-perf">
            <StatusBadge status={state?.lastStatus} />
            {state ? (
              <span>
                Dernière fois : {formatKg(state.lastPerformance.weightKg)} · {state.lastPerformance.reps.join(' · ') || '—'}
              </span>
            ) : (
              <span>Nouvel exercice</span>
            )}
          </div>

          {shownMarker && <ProgressMarkerBanner marker={shownMarker} assisted={ctx.cfg.assisted} />}

          <WeightField
            label={ctx.cfg.assisted ? 'Aide (kg)' : 'Poids (kg)'}
            value={p.weightKg}
            previous={state?.palier.weightKg ?? p.weightKg}
            highlight={weightChange !== null}
            onCommit={(w) => void commit(setWeight(session, p.variantId, w, ctx, now()))}
          />

          <div className="target-line">
            <span>
              Cible : <strong data-testid="target">{planned} × {target}</strong>
            </span>
            {rec && rec.kind !== 'keep' && rec.kind !== 'start' && !shownMarker && (
              <span className="muted small">Prochaine : {formatRecommendation(rec, ctx.cfg.assisted)}</span>
            )}
            <button type="button" className="link" onClick={() => setAdjust(!adjust)} aria-expanded={adjust}>
              Ajuster
            </button>
          </div>
          {adjust && (
            <div className="adjust">
              <Stepper
                label="Séries"
                value={planned}
                min={Math.max(1, done)}
                max={10}
                onChange={(v) => void commit(setPlannedSets(session, p.variantId, v, now()))}
              />
              <Stepper
                label="Répétitions"
                value={target}
                min={Math.max(1, ...p.reps)}
                max={30}
                onChange={(v) => {
                  setDraft(null);
                  void commit(setTarget(session, p.variantId, v, now()));
                }}
              />
            </div>
          )}

          <ol className="sets">
            {p.reps.map((r, i) => (
              <li key={i} className="set done">
                <span className="set-label">Série {i + 1}</span>
                <Stepper
                  label={`Répétitions série ${i + 1}`}
                  hideLabel
                  value={r}
                  min={0}
                  max={target}
                  onChange={(v) => void commit(correctSet(session, p.variantId, i, v, now()), 'Série corrigée')}
                />
                <span className="check" aria-label="Enregistrée">
                  ✓
                </span>
              </li>
            ))}
            {done < planned && (
              <li className="set next">
                <span className="set-label">Série {done + 1}</span>
                <Stepper
                  label={`Répétitions série ${done + 1}`}
                  hideLabel
                  value={nextValue}
                  min={0}
                  max={target}
                  onChange={setDraft}
                />
                <button
                  type="button"
                  className="btn primary validate"
                  onClick={() => {
                    setDraft(null);
                    void commit(recordSet(session, p.variantId, nextValue, now()), 'Série enregistrée');
                  }}
                >
                  Valider
                </button>
              </li>
            )}
            {Array.from({ length: Math.max(0, planned - done - 1) }, (_, k) => (
              <li key={`todo-${k}`} className="set todo" aria-hidden="true">
                <span className="set-label">Série {done + k + 2}</span>
                <span className="muted">{target}</span>
              </li>
            ))}
          </ol>
          {done > 0 && (
            <button
              type="button"
              className="link small"
              onClick={() => void commit(deleteLastSet(session, p.variantId, now()), 'Série supprimée')}
            >
              Supprimer la dernière série
            </button>
          )}

          {done > 0 && (
            <FeelingPicker
              legend="Ressenti global"
              value={p.feeling}
              onChange={(f) => void commit(setFeeling(session, p.variantId, f, now()))}
            />
          )}

          <button
            type="button"
            className="link danger small remove"
            onClick={() => void commit(removeExercise(session, p.variantId, now()), 'Exercice retiré')}
          >
            Retirer de la séance
          </button>
        </div>
      )}
    </article>
  );
}

interface StepperProps {
  label: string;
  hideLabel?: boolean;
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
}

/** Contrôle − valeur + ; le « + » est bloqué au maximum (la cible pour une série, §5.4). */
export function Stepper({ label, hideLabel = false, value, min, max, onChange }: StepperProps) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      {!hideLabel && <span className="stepper-label">{label}</span>}
      <button type="button" className="step" aria-label={`${label} : moins`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <output className="step-value" aria-live="polite">
        {value}
      </output>
      <button type="button" className="step" aria-label={`${label} : plus`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}
