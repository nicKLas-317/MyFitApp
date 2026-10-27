import { useState } from 'react';
import type { SessionPlan } from '../../domain/types';
import { useApp } from '../../app/store';
import { navigate } from '../../app/hooks';
import { displayName } from '../../library/catalog';
import { newId } from '../../session/ops';
import { formatCardio } from '../../cardio/model';
import {
  addPlanCardio,
  isEmptyPlan,
  itemKey,
  movePlanItem,
  newPlan,
  plannedPerformance,
  removeFromPlan,
  removePlanCardio,
  updatePlanCardio,
} from '../../plan/model';
import { ActionMenu, ConfirmRemove } from '../ActionMenu';
import { CardioForm, CardioItem } from '../CardioForm';
import { groupColorProps } from '../groupColors';
import { ExercisePicto } from '../Pictogram';
import { cardHint, NextTarget } from '../TargetSummary';

/**
 * Préparation de la prochaine séance (§5.9), au calme : exercices et cardio dans un seul ordre (réordonnable), chaque
 * exercice avec la charge et la cible que le moteur donne aujourd'hui, comme la carte en séance. Rien n'est saisi :
 * charge et cible sont recalculées au démarrage. Chaque modification est enregistrée aussitôt ; un plan vidé est supprimé.
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
  const items = plan?.items ?? [];

  /** « ↑ » / « ↓ » : pas de « ↑ » sur le premier élément ni de « ↓ » sur le dernier. */
  function moveButtons(i: number, key: string, name: string) {
    return (
      <div className="plan-move">
        {i > 0 && (
          <button type="button" className="btn move" aria-label={`Monter : ${name}`} onClick={() => void save(plan && movePlanItem(plan, key, -1, now()))}>
            ↑
          </button>
        )}
        {i < items.length - 1 && (
          <button type="button" className="btn move" aria-label={`Descendre : ${name}`} onClick={() => void save(plan && movePlanItem(plan, key, 1, now()))}>
            ↓
          </button>
        )}
      </div>
    );
  }

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

      {items.length > 0 && (
        <ol className="plan-list" aria-label="Exercices et cardio prévus">
          {items.map((item, i) => {
            if (item.kind === 'cardio') {
              const name = `Cardio ${formatCardio(item.block)}`;
              return (
                <CardioItem
                  key={itemKey(item)}
                  block={item.block}
                  className="plan-item"
                  machines={cardioMachines}
                  newId={newId}
                  removeQuestion="Retirer ce cardio de la séance prévue ?"
                  onSave={(block) => void save(plan && updatePlanCardio(plan, block, now()))}
                  onRemove={(block) => void save(plan && removePlanCardio(plan, block.id, now()))}
                >
                  {moveButtons(i, itemKey(item), name)}
                </CardioItem>
              );
            }
            const ref = variants.get(item.variantId);
            const name = displayName(ref);
            const ctx = ctxFor(item.variantId);
            const p = plannedPerformance(item, ctx);
            const { hint } = p ? cardHint(ctx.state, ctx.cfg.assisted, p) : { hint: null };
            return (
              <li
                key={itemKey(item)}
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
                        startLabel={ctx.cfg.bodyweight ? 'Jamais réalisé' : ctx.cfg.assisted ? 'Jamais réalisé : aide de départ' : 'Jamais réalisé : poids de départ'}
                      />
                    ) : (
                      <p className="muted">Exercice introuvable.</p>
                    )}
                  </div>
                  {moveButtons(i, itemKey(item), name)}
                </div>
              </li>
            );
          })}
        </ol>
      )}

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
