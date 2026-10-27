import { useState, type ReactNode } from 'react';
import type { Performance, Session } from '../domain/types';
import { useApp } from '../app/store';
import { displayName } from '../library/catalog';
import { formatKg, formatReps } from '../session/format';
import { repStep, trackKey } from '../engine';
import {
  correctSet,
  deleteLastSet,
  recordRemainingSets,
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
import { cardHint, TargetSummary } from './TargetSummary';
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
  /** Déjà fait dans une séance complétée (version 1.28.0) : fermé, sans menu ; il se corrige depuis l'historique. */
  locked?: boolean;
  onToggle(): void;
  /** Premier ressenti donné à un exercice dont toutes les séries sont faites : l'écran ouvre le suivant. */
  onFinished?(): void;
}

export function ExerciseCard({ session, performance: p, open, locked = false, onToggle, onFinished }: Props) {
  const { variants, ctxFor, commit, sessions, records, settings } = useApp();
  const ref = variants.get(p.variantId);
  // À la maison, un exercice à charge suit sa progression de la maison (version 1.26.0).
  const home = session.location === 'maison';
  const ctx = ctxFor(p.variantId, home);
  const { state } = ctx;
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

  // Mention sous la cible (§5.3.1, §5.3.2) : changement de charge à saisir, repère de progression, ou cible identique.
  const assisted = ctx.cfg.assisted;
  // Exercice en secondes (gainage) : cible et séries en secondes, par pas de 5 s.
  const seconds = !!ctx.cfg.seconds;
  const step = repStep(ctx.cfg);
  const unit = seconds ? ' s' : '';
  const { hint, weightChange } = cardHint(state, assisted, p, seconds);

  const name = displayName(ref);
  // Toutes les séries faites à la cible et mieux que le record des séances précédentes (jamais pour une première fois).
  const newRecord = beatsRecord(p, records.current.get(trackKey(settings, p.variantId, home)), ctx.cfg.assisted);
  const nextValue = Math.min(draft ?? target, target);

  return (
    <article
      className={`card exercise-card${open ? ' open' : ''}`}
      data-variant={p.variantId}
      aria-label={name}
      {...(ref ? groupColorProps(ref.exercise.primaryGroup) : {})}
    >
      <div className="card-head">
        <HeaderTag locked={locked} open={open} onToggle={onToggle}>
          {ref && <ExercisePicto exercise={ref.exercise} variantId={ref.variant.id} />}
          {/* Liste compacte du mode salle : nom sur toute la largeur, charge et séries faites dessous. */}
          <span className="card-title">
            <strong>{name}</strong>
            <span className="card-summary muted small">
              {/* Poids du corps : pas de charge, seulement les séries faites. */}
              {p.weightKg > 0 && <span>{formatKg(p.weightKg)}</span>}
              <span className="sets-count">
                {p.weightKg > 0 && ' · '}
                {done}/{planned}
              </span>
              {locked && <span data-testid="locked"> · déjà fait</span>}
            </span>
            {newRecord && (
              <span className="record-new" data-testid="new-record">
                <Crown /> Nouveau record !
              </span>
            )}
          </span>
        </HeaderTag>
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
            bodyweight={ctx.cfg.bodyweight}
            seconds={seconds}
          />

          {!ctx.cfg.bodyweight && (
            <WeightField
              label={ctx.cfg.assisted ? 'Aide (kg)' : 'Poids (kg)'}
              value={p.weightKg}
              previous={state?.palier.weightKg ?? p.weightKg}
              highlight={weightChange !== null}
              onCommit={(w) => void commit(setWeight(session, p.variantId, w, ctx, now()))}
            />
          )}

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
                label={seconds ? 'Secondes' : 'Répétitions'}
                value={target}
                min={Math.max(1, ...p.reps)}
                max={seconds ? Math.max(180, ctx.cfg.maxReps) : Math.max(30, ctx.cfg.maxReps)}
                step={step}
                unit={unit}
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
                  label={`${seconds ? 'Secondes' : 'Répétitions'} série ${i + 1}`}
                  hideLabel
                  value={r}
                  min={0}
                  max={target}
                  step={step}
                  unit={unit}
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
                  label={`${seconds ? 'Secondes' : 'Répétitions'} série ${done + 1}`}
                  hideLabel
                  value={nextValue}
                  min={0}
                  max={target}
                  step={step}
                  unit={unit}
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
                <span className="muted">{formatReps(target, seconds)}</span>
              </li>
            ))}
          </ol>
          {/* Séries préremplies conformes à ce qui a été fait : toutes enregistrées en un appui, il ne reste que le ressenti. */}
          {done === 0 && planned > 1 && nextValue === target && (
            <button
              type="button"
              className="btn validate-all"
              onClick={() => {
                setDraft(null);
                void commit(recordRemainingSets(session, p.variantId, now()), 'Séries enregistrées');
              }}
            >
              Valider les {planned} séries
            </button>
          )}
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
              onChange={(f) => {
                void commit(setFeeling(session, p.variantId, f, now()));
                // Exercice terminé (toutes les séries, premier ressenti) : on passe au suivant. Changer ensuite le
                // ressenti ne déplace plus rien.
                if (p.feeling === 'inconnu' && done >= planned) onFinished?.();
              }}
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
  /** Pas du − / + : 1, ou 5 pour des secondes (gainage). Jamais au-delà des bornes. */
  step?: number;
  /** Unité de la valeur (« s »), pour le lecteur d'écran seulement. */
  unit?: string;
  onChange(value: number): void;
}

/** Contrôle − valeur + ; le « + » est bloqué au maximum (la cible pour une série, §5.4). */
export function Stepper({ label, hideLabel = false, value, min, max, step = 1, unit = '', onChange }: StepperProps) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      {!hideLabel && <span className="stepper-label">{label}</span>}
      <button type="button" className="step" aria-label={`${label} : moins`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <output className="step-value" aria-live="polite">
        {value}
        {/* Unité lue mais pas affichée : « Valider » doit tenir sur la ligne ; la cible « 3 × 20 s » est juste au-dessus. */}
        {unit && <span className="visually-hidden">{unit}</span>}
      </output>
      <button type="button" className="step" aria-label={`${label} : plus`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
  );
}

/** En-tête de la carte : un bouton qui l'ouvre ou la ferme ; une simple ligne pour un exercice déjà fait (fermé). */
function HeaderTag({ locked, open, onToggle, children }: { locked: boolean; open: boolean; onToggle(): void; children: ReactNode }) {
  if (locked) return <div className="card-header">{children}</div>;
  return (
    <button type="button" className="card-header" onClick={onToggle} aria-expanded={open}>
      {children}
    </button>
  );
}
