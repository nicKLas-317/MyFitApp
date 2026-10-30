import { useEffect, useState, type ReactNode } from 'react';
import { useApp } from '../../app/store';
import { navigate, navigateReplace, useNow } from '../../app/hooks';
import {
  canSwitchLocation,
  cancelAdditions,
  cancelLoss,
  elapsedMs,
  finishSession,
  missingFeelings,
  newId,
  switchKept,
  switchLocation,
} from '../../session/ops';
import { setSessionActive } from '../../app/navigation';
import { ActionMenu } from '../ActionMenu';
import { addCardio, formatCardio, removeCardio, updateCardio } from '../../cardio/model';
import { CardioForm, CardioItem, CardioLine, type CardioDraft, type CardioFormMemory } from '../CardioForm';
import { canPostpone, nextUnfinished, plannedNotDone, postponeStep, sessionSteps } from '../../plan/model';
import { displayName } from '../../library/catalog';
import { formatDuration } from '../../session/format';
import { ExerciseCard } from '../ExerciseCard';
import { finishLabel, MissingFeelings, remainingFeelings } from '../MissingFeelings';
import { SaveIndicator } from '../SaveIndicator';
import { titleOf } from '../sessionTitle';

/**
 * État d'écran de la séance gardé en mémoire le temps de l'ouverture de l'appli : quitter le mode salle (fiche,
 * onglet Séance, bouton retour) puis revenir retrouve l'élément ouvert (exercice-variante, ou « cardio:<bloc> » pour
 * un cardio prévu) et le cardio en cours de saisie.
 */
const memory: { sessionId: string | null; openId: string | undefined; cardio: CardioFormMemory } = {
  sessionId: null,
  openId: undefined,
  cardio: { current: null },
};

/**
 * Mode salle (§5.8) : écran plein, sans barre d'onglets. En haut le chronomètre et la liste compacte des exercices
 * (un seul ouvert à la fois) ; en bas une barre fixe dans la zone du pouce : « + Exercice », « + Cardio »,
 * « Terminer ». La flèche « ‹ » ramène à l'onglet Séance sans terminer la séance.
 */
export function SessionScreen({ openVariantId }: { openVariantId: string | undefined }) {
  const { active, commit, setLastFinish, cardioMachines, variants, deleteSession, ctxFor } = useApp();
  const now = useNow();
  if (active && memory.sessionId !== active.id) {
    memory.sessionId = active.id;
    memory.openId = undefined;
    memory.cardio.current = null;
  }
  const [openId, setOpenIdState] = useState<string | undefined>(openVariantId ?? memory.openId);
  const setOpenId = (id: string) => {
    memory.openId = id;
    setOpenIdState(id);
  };
  /** Confirmation de fin ouverte : exercices sans ressenti relevés à l'ouverture. */
  const [confirmFinish, setConfirmFinish] = useState<string[] | null>(null);
  /** Confirmation de l'annulation de la séance ouverte ; échec de la suppression. */
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelFailed, setCancelFailed] = useState(false);
  /** Confirmation du changement de lieu ouverte (séries ou cardio déjà validés). */
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [addingCardio, setAddingCardio] = useState(memory.cardio.current !== null);
  /** Saisie du formulaire de cardio ouvert, proposée à l'enregistrement si la séance est terminée sans « Valider ». */
  const [cardioDraft, setCardioDraft] = useState<CardioDraft>({ kind: 'empty' });

  useEffect(() => {
    if (!openVariantId) return;
    memory.openId = openVariantId;
    setOpenIdState(openVariantId);
    // Amène l'exercice ouvert à l'écran (ajout ou exercice déjà présent).
    requestAnimationFrame(() =>
      document.querySelector(`article[data-variant="${CSS.escape(openVariantId)}"]`)?.scrollIntoView({ block: 'start' }),
    );
  }, [openVariantId]);

  if (!active) {
    return (
      <main className="screen">
        <p className="empty">Aucune séance en cours.</p>
        <a className="btn primary big" href="#/">
          Accueil
        </a>
      </main>
    );
  }

  // Par défaut : le dernier exercice ajouté ; dans une séance prévue, le premier exercice pas encore fait, qui reste
  // ouvert une fois ses séries validées (le ressenti est encore à choisir).
  const steps = sessionSteps(active);
  if (active.fromPlan && openId === undefined && memory.openId === undefined) {
    // Séance prévue : le premier élément à faire, dans l'ordre du plan (un cardio prévu placé en tête compris).
    memory.openId = steps.find(
      (step) =>
        !step.locked &&
        (step.kind === 'cardio' ? step.pending : step.performance.plannedSets === null || step.performance.reps.length < step.performance.plannedSets),
    )?.key;
  }
  // Séance complétée (version 1.28.0) : ce qui était déjà fait reste fermé.
  const completing = !!active.locked;
  // Changement de lieu (version 1.30.0) : ni séance prévue (toujours à la salle), ni séance complétée.
  const home = active.location === 'maison';
  const switchable = canSwitchLocation(active);
  const switchLabel = home ? 'Passer à la salle' : 'Passer à la maison';
  const current = openId ?? memory.openId ?? steps.filter((step) => step.kind === 'exercise' && !step.locked).at(-1)?.key;
  const notDone = plannedNotDone(active);
  const unsavedCardio = addingCardio && cardioDraft.kind !== 'empty' ? cardioDraft : null;

  /**
   * Ressenti donné ou cardio prévu validé : ouvre l'élément suivant non terminé (exercice aux séries incomplètes ou
   * sans ressenti, cardio prévu pas encore validé), dans l'ordre de la séance, en reprenant au début après le dernier,
   * et l'amène doucement sous l'en-tête. Tout est terminé : rien ne s'ouvre.
   */
  function openNext(fromKey: string) {
    const next = nextUnfinished(steps, fromKey);
    if (!next) return;
    setOpenId(next.key);
    requestAnimationFrame(() => {
      const card = document.querySelector(
        next.kind === 'cardio' ? `[data-cardio="${CSS.escape(next.block.id)}"]` : `article[data-variant="${CSS.escape(next.key)}"]`,
      );
      if (!card) return;
      const header = document.querySelector('.session-header')?.getBoundingClientRect().height ?? 0;
      window.scrollTo({ top: card.getBoundingClientRect().top + window.scrollY - header - 8, behavior: 'smooth' });
    });
  }

  /**
   * « Plus tard » (version 1.29.0) : l'élément passe en fin de liste et le suivant non terminé s'ouvre (machine
   * occupée, plus de place, pas la forme maintenant). Le plan n'est pas modifié.
   */
  function postpone(key: string) {
    if (!active) return;
    void commit(postponeStep(active, key, Date.now()));
    openNext(key);
  }
  const laterFor = (key: string) => (canPostpone(steps, key) ? () => postpone(key) : undefined);

  function openCardio(open: boolean) {
    setAddingCardio(open);
    setCardioDraft({ kind: 'empty' });
    if (!open) memory.cardio.current = null;
  }

  /** « + Cardio » : ouvre le formulaire (ou le retrouve) et l'amène à l'écran. */
  function showCardio() {
    if (!addingCardio) openCardio(true);
    requestAnimationFrame(() => document.querySelector('form.cardio-form')?.scrollIntoView({ block: 'center' }));
  }

  async function finish() {
    if (!active || unsavedCardio?.kind === 'error') return;
    const now = Date.now();
    // Un bloc rempli mais pas validé est enregistré avec la fin de la séance, dans la même écriture.
    const withCardio = unsavedCardio ? addCardio(active, unsavedCardio.block, now) : active;
    openCardio(false);
    const { session, removed } = finishSession(withCardio, now);
    setLastFinish({ sessionId: session.id, removed });
    navigateReplace('recap', session.id);
    await commit(session);
  }

  /**
   * Annuler la séance (version 1.27.0) : elle est supprimée entièrement, sans récapitulatif ni historique ; retour à
   * l'onglet Séance. Une séance prévue reste proposée (elle n'est consommée que par une séance terminée).
   * Séance complétée (version 1.28.0) : « Annuler les ajouts » la rend telle qu'elle était terminée.
   */
  /**
   * « Passer à la salle » / « Passer à la maison » (version 1.30.0) : les exercices pas commencés prennent la charge
   * et la cible du suivi du nouveau lieu ; ce qui est déjà fait reste tel quel.
   */
  function switchPlace() {
    if (!active) return;
    setConfirmSwitch(false);
    void commit(switchLocation(active, !home, (variantId) => ctxFor(variantId, !home), Date.now()));
  }

  async function cancel() {
    if (!active) return;
    openCardio(false);
    const ok = active.locked ? await commit(cancelAdditions(active, Date.now())) : await deleteSession(active.id);
    if (!ok) {
      setCancelFailed(true);
      return;
    }
    memory.sessionId = null;
    // Plus de séance en cours : pas d'entrée de garde en revenant sur l'onglet Séance.
    setSessionActive(false);
    navigate('');
  }

  return (
    <main className="screen session gym-mode">
      <header className="session-header">
        <a href="#/" className="back" aria-label="Accueil">
          ‹
        </a>
        <div className="session-title">
          <span className="muted small">{titleOf(active, variants)}</span>
          {/* À la maison, pas de chronomètre (version 1.26.0) : la durée n'a pas d'importance. */}
          {active.location === 'maison' ? (
            <span className="session-place" data-testid="session-place">
              À la maison
            </span>
          ) : (
            <span className="chrono" role="timer" aria-label="Durée de la séance" data-testid="chrono">
              {formatDuration(elapsedMs(active, now))}
            </span>
          )}
        </div>
        <SaveIndicator />
        {/* Annuler la séance : dans un menu, jamais dans la barre du pouce (appui par erreur). */}
        <ActionMenu
          label="Séance"
          actions={[
            // Confirmation seulement si des séries ou du cardio sont déjà validés.
            ...(switchable ? [{ label: switchLabel, onSelect: () => (switchKept(active) ? setConfirmSwitch(true) : switchPlace()) }] : []),
            {
              label: completing ? 'Annuler les ajouts' : 'Annuler la séance',
              danger: true,
              onSelect: () => {
                setCancelFailed(false);
                setConfirmCancel(true);
              },
            },
          ]}
        />
      </header>

      {steps.length === 0 && <p className="empty muted">Ajoute un premier exercice.</p>}

      <div className="cards">
        {steps.map((step) => {
          if (step.kind === 'exercise') {
            const p = step.performance;
            return (
              <ExerciseCard
                key={step.key}
                session={active}
                performance={p}
                locked={step.locked}
                open={!step.locked && step.key === current}
                onToggle={() => setOpenId(step.key === current ? '' : step.key)}
                onFinished={() => openNext(step.key)}
                onLater={laterFor(step.key)}
              />
            );
          }
          const b = step.block;
          if (step.locked) {
            // Cardio déjà fait d'une séance complétée : fermé, corrigé depuis l'historique.
            return (
              <div key={step.key} className="card recap-item cardio-item locked" data-cardio={b.id}>
                <div className="card-line">
                  <CardioLine block={b} prefix="Déjà fait" />
                </div>
              </div>
            );
          }
          if (!step.pending) {
            return (
              <CardioItem
                key={step.key}
                as="div"
                block={b}
                machines={cardioMachines}
                newId={newId}
                onSave={(block) => void commit(updateCardio(active, block, Date.now()))}
                onRemove={(block) => void commit(removeCardio(active, block.id, Date.now()), 'Cardio retiré')}
              />
            );
          }
          // Cardio prévu : « Valider » l'enregistre en un appui. Ouvert (élément en cours), c'est l'action principale, et
          // l'élément suivant non terminé s'ouvre ensuite. Menu « ⋯ » : « Plus tard », quand un autre élément reste à faire.
          const open = step.key === current;
          const later = laterFor(step.key);
          return (
            <div
              key={step.key}
              className={`card recap-item cardio-item planned-cardio${open ? ' open' : ''}`}
              data-cardio={b.id}
              aria-current={open ? 'step' : undefined}
            >
              <div className="card-line">
                <CardioLine block={b} prefix="Prévu" />
                <button
                  type="button"
                  className={`btn${open ? ' primary' : ''}`}
                  aria-label={`Valider le cardio prévu : ${formatCardio(b)}`}
                  onClick={() => {
                    void commit(addCardio(active, b, Date.now()));
                    if (open) openNext(step.key);
                  }}
                >
                  Valider
                </button>
                {later && <ActionMenu label={`cardio prévu ${formatCardio(b)}`} actions={[{ label: 'Plus tard', onSelect: later }]} />}
              </div>
            </div>
          );
        })}
      </div>

      {addingCardio && (
        <CardioForm
          machines={cardioMachines}
          newId={newId}
          memory={memory.cardio}
          onCancel={() => openCardio(false)}
          onDraft={setCardioDraft}
          onSave={(block) => {
            openCardio(false);
            void commit(addCardio(active, block, Date.now()));
          }}
        />
      )}

      <nav className="session-bar" aria-label="Actions de la séance">
        <a className="btn primary" href="#/ajouter" aria-label="Ajouter un exercice">
          + Exercice
        </a>
        <button type="button" className="btn" aria-label="Ajouter du cardio" onClick={showCardio}>
          + Cardio
        </button>
        <button
          type="button"
          className="btn"
          aria-label="Terminer la séance"
          aria-expanded={confirmFinish !== null}
          onClick={() => setConfirmFinish(missingFeelings(active).map((p) => p.variantId))}
        >
          Terminer
        </button>
      </nav>

      {confirmCancel && (
        <BottomSheet title={completing ? 'Annuler les ajouts\u00a0?' : 'Annuler cette séance\u00a0?'} onClose={() => setConfirmCancel(false)}>
          <p data-testid="cancel-loss">
            {cancelLoss(active)}
            {completing && ' La séance terminée reste enregistrée.'}
          </p>
          {cancelFailed && (
            <p className="field-error" role="alert">
              Annulation impossible : réessaie.
            </p>
          )}
          <div className="sheet-buttons">
            <button type="button" className="btn big primary" onClick={() => setConfirmCancel(false)}>
              Non, continuer
            </button>
            <button type="button" className="btn big danger" onClick={() => void cancel()}>
              {completing ? 'Oui, annuler les ajouts' : 'Oui, annuler la séance'}
            </button>
          </div>
        </BottomSheet>
      )}

      {confirmSwitch && (
        <BottomSheet title={`${switchLabel} ?`} onClose={() => setConfirmSwitch(false)}>
          <p data-testid="switch-kept">{switchKept(active)}</p>
          <div className="sheet-buttons">
            <button type="button" className="btn big primary" onClick={switchPlace}>
              {home ? 'Oui, passer à la salle' : 'Oui, passer à la maison'}
            </button>
            <button type="button" className="btn big" onClick={() => setConfirmSwitch(false)}>
              {home ? 'Non, rester à la maison' : 'Non, rester à la salle'}
            </button>
          </div>
        </BottomSheet>
      )}

      {confirmFinish && (
        <BottomSheet title="Terminer la séance ?" onClose={() => setConfirmFinish(null)}>
          <MissingFeelings session={active} variantIds={confirmFinish} />
          {(notDone.exercises.length > 0 || notDone.cardio.length > 0) && (
            <p className="planned-not-done" data-testid="planned-not-done">
              {[
                notDone.exercises.length > 0 &&
                  `${notDone.exercises.length === 1 ? '1 exercice prévu non fait' : `${notDone.exercises.length} exercices prévus non faits`} (${notDone.exercises
                    .map((p) => displayName(variants.get(p.variantId)))
                    .join(', ')})`,
                notDone.cardio.length > 0 && `${notDone.cardio.length === 1 ? '1 cardio prévu non fait' : `${notDone.cardio.length} cardios prévus non faits`}`,
              ]
                .filter(Boolean)
                .join(' · ')}
              {' : pas enregistrés.'}
            </p>
          )}
          {unsavedCardio?.kind === 'block' && (
            <p data-testid="unsaved-cardio">Cardio non validé : {formatCardio(unsavedCardio.block)}</p>
          )}
          {unsavedCardio?.kind === 'error' && (
            <p className="field-error" role="alert">
              Cardio non validé : {unsavedCardio.message} Corrige-le ou annule-le.
            </p>
          )}
          <div className="sheet-buttons">
            {unsavedCardio?.kind !== 'error' && (
              <button
                type="button"
                className={`btn big${remainingFeelings(active, confirmFinish) && !unsavedCardio ? '' : ' primary'}`}
                onClick={() => void finish()}
              >
                {unsavedCardio ? 'Enregistrer le cardio et terminer' : finishLabel(active, confirmFinish)}
              </button>
            )}
            <button type="button" className="btn big" onClick={() => setConfirmFinish(null)}>
              Non, continuer la séance
            </button>
          </div>
        </BottomSheet>
      )}
    </main>
  );
}

/**
 * Confirmation de fin de séance (§5.6), ou d'annulation, en volet fixé en bas de l'écran : toujours visible sans
 * défiler, quelle que soit la longueur de la séance. Le fond assombri ferme le volet (comme « Non »).
 */
function BottomSheet({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="sheet-backdrop" aria-hidden="true" onClick={onClose} />
      <div className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="finish-title">
        <h2 id="finish-title" className="sheet-title">
          {title}
        </h2>
        {children}
      </div>
    </>
  );
}
