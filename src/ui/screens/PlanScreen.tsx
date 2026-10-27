import { useState } from 'react';
import type { SessionPlan } from '../../domain/types';
import { useApp } from '../../app/store';
import { navigate } from '../../app/hooks';
import { displayName } from '../../library/catalog';
import { newId } from '../../session/ops';
import {
  addPlanCardio,
  isEmptyPlan,
  movePlanExercise,
  newPlan,
  plannedPerformance,
  removeFromPlan,
  removePlanCardio,
  updatePlanCardio,
} from '../../plan/model';
import { ActionMenu, ConfirmRemove } from '../ActionMenu';
import { CardioForm, CardioList } from '../CardioForm';
import { groupColorProps } from '../groupColors';
import { ExercisePicto } from '../Pictogram';
import { cardHint, NextTarget } from '../TargetSummary';

/**
 * Préparation de la prochaine séance (§5.9), au calme : exercices dans l'ordre (réordonnables), chacun avec la charge
 * et la cible que le moteur donne aujourd'hui, comme la carte en séance ; cardio prévu. Rien n'est saisi : charge et
 * cible sont recalculées au démarrage. Chaque modification est enregistrée aussitôt ; un plan vidé est supprimé.
 */
export function PlanScreen() {
  const { plan, savePlan, variants, ctxFor, cardioMachines } = useApp();
  const [addingCardio, setAddingCardio] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save(next: SessionPlan | null) {
    setFailed(!(await savePlan(next && !isEmptyPlan(next) ? next : null)));
  }

  const now = () => Date.now();
  const exercises = plan?.exercises ?? [];

  return (
    <main className="screen tab-screen plan-screen">
      <header className="simple-header">
        <a href="#/" className="back" aria-label="Accueil">
          ‹
        </a>
        <h1>Séance prévue</h1>
      </header>
      {failed && (
        <p className="field-error" role="alert">
          Enregistrement impossible : réessaie.
        </p>
      )}
      {!plan && <p className="muted">Ajoute les exercices de ta prochaine séance : tu la démarreras en un appui à la salle.</p>}

      {exercises.length > 0 && (
        <ol className="plan-list" aria-label="Exercices prévus">
          {exercises.map((item, i) => {
            const ref = variants.get(item.variantId);
            const name = displayName(ref);
            const ctx = ctxFor(item.variantId);
            const p = plannedPerformance(item, ctx);
            const { hint } = p ? cardHint(ctx.state, ctx.cfg.assisted, p) : { hint: null };
            return (
              <li
                key={item.variantId}
                className="card plan-item"
                data-variant={item.variantId}
                aria-label={name}
                {...(ref ? groupColorProps(ref.exercise.primaryGroup) : {})}
              >
                <div className="card-head">
                  <div className="plan-name">
                    {ref && <ExercisePicto exercise={ref.exercise} variantId={ref.variant.id} />}
                    <strong>{name}</strong>
                  </div>
                  <ActionMenu
                    label={name}
                    actions={[
                      { label: 'Voir la fiche de l’exercice', href: `#/exercice/${encodeURIComponent(item.variantId)}` },
                      { label: 'Retirer de la séance prévue', danger: true, onSelect: () => void save(plan && removeFromPlan(plan, item.variantId, now())) },
                    ]}
                  />
                </div>
                <div className="plan-target">
                  <div className="plan-target-text">
                    {p ? (
                      <NextTarget
                        target={{ sets: p.plannedSets ?? 0, reps: p.targetReps ?? 0, weightKg: p.weightKg }}
                        assisted={ctx.cfg.assisted}
                        hint={hint}
                        startLabel={ctx.cfg.assisted ? 'Jamais réalisé : aide de départ' : 'Jamais réalisé : poids de départ'}
                      />
                    ) : (
                      <p className="muted">Exercice introuvable.</p>
                    )}
                  </div>
                  <div className="plan-move">
                    {i > 0 && (
                      <button
                        type="button"
                        className="btn move"
                        aria-label={`Monter : ${name}`}
                        onClick={() => void save(plan && movePlanExercise(plan, item.variantId, -1, now()))}
                      >
                        ↑
                      </button>
                    )}
                    {i < exercises.length - 1 && (
                      <button
                        type="button"
                        className="btn move"
                        aria-label={`Descendre : ${name}`}
                        onClick={() => void save(plan && movePlanExercise(plan, item.variantId, 1, now()))}
                      >
                        ↓
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <CardioList
        blocks={plan?.cardio ?? []}
        machines={cardioMachines}
        newId={newId}
        onSave={(block) => void save(plan && updatePlanCardio(plan, block, now()))}
        onRemove={(block) => void save(plan && removePlanCardio(plan, block.id, now()))}
      />

      {addingCardio && (
        <CardioForm
          machines={cardioMachines}
          newId={newId}
          onCancel={() => setAddingCardio(false)}
          onSave={(block) => {
            setAddingCardio(false);
            void save(addPlanCardio(plan ?? newPlan(now(), newId()), block, now()));
          }}
        />
      )}

      <div className="row plan-actions">
        <button type="button" className="btn primary" onClick={() => navigate('seance-prevue', 'ajouter')}>
          + Exercice
        </button>
        {!addingCardio && (
          <button type="button" className="btn" onClick={() => setAddingCardio(true)}>
            + Cardio
          </button>
        )}
      </div>

      {plan &&
        (confirmDelete ? (
          <ConfirmRemove
            question="Supprimer la séance prévue ?"
            onCancel={() => setConfirmDelete(false)}
            onConfirm={() => {
              setConfirmDelete(false);
              void save(null);
            }}
          />
        ) : (
          <button type="button" className="link danger" onClick={() => setConfirmDelete(true)}>
            Supprimer la séance prévue
          </button>
        ))}
    </main>
  );
}
