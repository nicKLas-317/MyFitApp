import { useState } from 'react';
import type { Performance, Session } from '../domain/types';
import { compareWeight, progressMarker } from '../engine';
import { useApp } from '../app/store';
import { displayName } from '../library/catalog';
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
import { loadChangeHint, markerHint, TargetSummary, type TargetHint } from './TargetSummary';
import { ActionMenu, ConfirmRemove } from './ActionMenu';
import { Crown } from './Crown';
import { beatsRecord } from '../analysis/records';
import { WeightField } from './WeightField';

/**
 * Répétitions ajustées (− / +) de la série en cours, pas encore validées : gardées le temps de l'ouverture de l'appli,
 * pour les retrouver après être sorti du mode salle (fiche, bouton retour).
 */
const repsDrafts = new Map<string, number>();

interface Props {
  session: Session;
  performance: Performance;
  open: boolean;
  onToggle(): void;
}

export function ExerciseCard({ session, performance: p, open, onToggle }: Props) {
  const { variants, ctxFor, commit, sessions, records } = useApp();
  const ref = variants.get(p.variantId);
  const ctx = ctxFor(p.variantId);
  const { state } = ctx;
  const rec = state?.recommendation;
  const target = p.targetReps ?? 0;
  const planned = p.plannedSets ?? 0;
  const done = p.reps.length;
  const draftKey = `${session.id}|${p.variantId}|${done}`;
  const [draft, setDraftState] = useState<number | null>(repsDrafts.get(draftKey) ?? null);
  const setDraft = (value: number | null) => {
    if (value === null) repsDrafts.delete(draftKey);
    else repsDrafts.set(draftKey, value);
    setDraftState(value);
  };
  const [adjust, setAdjust] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
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

  // Mention sous la cible (§5.3.1, §5.3.2) : changement de charge à saisir, repère de progression, ou cible identique ;
  // rien si l'utilisateur a choisi une autre charge ou une autre cible.
  const assisted = ctx.cfg.assisted;
  const followsRecommendation =
    !!rec && !!state && compareWeight(p.weightKg, state.palier.weightKg) === 0 && p.targetReps === rec.targetReps && p.plannedSets === rec.plannedSets;
  const hint: TargetHint = !state
    ? { kind: 'start' }
    : weightChange && rec
      ? loadChangeHint(weightChange, assisted, `→ ${rec.plannedSets} × ${rec.targetReps}`)
      : shownMarker
        ? markerHint(shownMarker, assisted)
        : !marker && followsRecommendation
          ? { kind: 'same' }
          : null;

  const name = displayName(ref);
  // Toutes les séries faites à la cible et mieux que le record des séances précédentes (jamais pour une première fois).
  const newRecord = beatsRecord(p, records.current.get(p.variantId), ctx.cfg.assisted);
  const nextValue = Math.min(draft ?? target, target);

  return (
    <article
      className={`card exercise-card${open ? ' open' : ''}`}
      data-variant={p.variantId}
      aria-label={name}
      {...(ref ? groupColorProps(ref.exercise.primaryGroup) : {})}
    >
      <div className="card-head">
        <button type="button" className="card-header" onClick={onToggle} aria-expanded={open}>
          {ref && <ExercisePicto exercise={ref.exercise} variantId={ref.variant.id} />}
          {/* Liste compacte du mode salle : nom sur toute la largeur, charge et séries faites dessous. */}
          <span className="card-title">
            <strong>{name}</strong>
            <span className="card-summary muted small">
              <span>{formatKg(p.weightKg)}</span>
              <span className="sets-count">
                {' · '}
                {done}/{planned}
              </span>
            </span>
            {newRecord && (
              <span className="record-new" data-testid="new-record">
                <Crown /> Nouveau record !
              </span>
            )}
          </span>
        </button>
        {open && (
          <ActionMenu
            label={name}
            actions={[
              { label: adjust ? 'Masquer l’ajustement' : 'Ajuster séries et répétitions', onSelect: () => setAdjust(!adjust) },
              { label: 'Voir la fiche de l’exercice', href: `#/exercice/${encodeURIComponent(p.variantId)}` },
              { label: 'Retirer de la séance', danger: true, onSelect: () => setConfirmRemove(true) },
            ]}
          />
        )}
      </div>

      {open && (
        <div className="card-body">
          {confirmRemove && (
            <ConfirmRemove
              question="Retirer cet exercice de la séance ?"
              onCancel={() => setConfirmRemove(false)}
              onConfirm={() => {
                setConfirmRemove(false);
                void commit(removeExercise(session, p.variantId, now()), 'Exercice retiré');
              }}
            />
          )}
          <TargetSummary
            state={state}
            assisted={assisted}
            lastDate={state ? (sessions.find((s) => s.id === state.lastSessionId)?.date ?? null) : null}
            label="Prochaine cible"
            target={{ sets: planned, reps: target, weightKg: p.weightKg }}
            hint={hint}
          />

          <WeightField
            label={ctx.cfg.assisted ? 'Aide (kg)' : 'Poids (kg)'}
            value={p.weightKg}
            previous={state?.palier.weightKg ?? p.weightKg}
            highlight={weightChange !== null}
            onCommit={(w) => void commit(setWeight(session, p.variantId, w, ctx, now()))}
          />

          {adjust && (
            <div className="adjust" role="group" aria-label="Ajuster séries et répétitions">
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
              <button type="button" className="btn" onClick={() => setAdjust(false)}>
                Terminé
              </button>
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
              className="link"
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
