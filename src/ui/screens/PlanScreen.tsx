import { useState } from 'react';
import type { SessionPlan } from '../../domain/types';
import { useApp } from '../../app/store';
import { navigate } from '../../app/hooks';
import { displayName } from '../../library/catalog';
import { perDumbbell } from '../../library/search';
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
import { CardioForm, CardioItem, type CardioEditMemory, type CardioFormMemory } from '../CardioForm';
import { useEntryMemory } from '../../app/entryMemory';
import { SheetLink } from '../SheetLink';
import { groupColorProps } from '../groupColors';
import { cardHint, NextTarget } from '../TargetSummary';

/**
 * Préparation de la prochaine séance (§5.9), au calme : exercices et cardio dans un seul ordre (réordonnable), chaque
 * exercice avec la charge et la cible que le moteur donne aujourd'hui, comme la carte en séance. Rien n'est saisi :
 * charge et cible sont recalculées au démarrage. Chaque modification est enregistrée aussitôt ; un plan vidé est supprimé.
 */
export function PlanScreen() {
  const { plan, savePlan, variants, ctxFor, cardioMachines } = useApp();
  // Saisie en cours (cardio ajouté ou corrigé, suppression à confirmer), retrouvée au retour d'une fiche (version 1.48.0).
  const memory = useEntryMemory('seance-prevue', () => ({
    adding: false,
    cardio: { current: null } as CardioFormMemory,
    edit: { editing: null, form: { current: null } } as CardioEditMemory,
    confirmDelete: false,
  }));
  const [addingCardio, setAddingCardioState] = useState(memory.adding);
  const setAddingCardio = (on: boolean) => {
    setAddingCardioState(on);
    memory.adding = on;
    if (!on) memory.cardio.current = null;
  };
  const [confirmDelete, setConfirmDeleteState] = useState(memory.confirmDelete);
  const setConfirmDelete = (on: boolean) => {
    setConfirmDeleteState(on);
    memory.confirmDelete = on;
  };
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
                  editMemory={memory.edit}
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
            const { hint } = p ? cardHint(ctx.state, ctx.cfg.assisted, p, ctx.cfg.seconds) : { hint: null };
            return (
              <li
                key={itemKey(item)}
                className="card plan-item"
                data-variant={item.variantId}
                aria-label={name}
                {...(ref ? groupColorProps(ref.exercise.primaryGroup) : {})}
              >
                <div className="card-head">
                  {/* Vignette et nom : la fiche (version 1.48.0) ; le reste de la carte ne change pas. */}
                  <SheetLink variantId={item.variantId} exercise={ref?.exercise} name={name} className="plan-name" />
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
                        seconds={ctx.cfg.seconds}
                        perDumbbell={perDumbbell(ref)}
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
          memory={memory.cardio}
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
