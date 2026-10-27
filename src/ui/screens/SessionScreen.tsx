import { useEffect, useState, type ReactNode } from 'react';
import { useApp } from '../../app/store';
import { navigateReplace, useNow } from '../../app/hooks';
import { elapsedMs, finishSession, missingFeelings, newId } from '../../session/ops';
import { addCardio, cardioOf, formatCardio, removeCardio, updateCardio } from '../../cardio/model';
import { CardioForm, CardioLine, CardioList, type CardioDraft, type CardioFormMemory } from '../CardioForm';
import { pendingPlanCardio, plannedNotDone } from '../../plan/model';
import { displayName } from '../../library/catalog';
import { formatDuration } from '../../session/format';
import { ExerciseCard } from '../ExerciseCard';
import { finishLabel, MissingFeelings, remainingFeelings } from '../MissingFeelings';
import { SaveIndicator } from '../SaveIndicator';

/**
 * État d'écran de la séance gardé en mémoire le temps de l'ouverture de l'appli : quitter le mode salle (fiche,
 * onglet Séance, bouton retour) puis revenir retrouve l'exercice ouvert et le cardio en cours de saisie.
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
  const { active, commit, setLastFinish, cardioMachines, variants } = useApp();
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
  if (active.fromPlan && openId === undefined && memory.openId === undefined) {
    memory.openId = active.performances.find((p) => p.plannedSets === null || p.reps.length < p.plannedSets)?.variantId;
  }
  const current = openId ?? memory.openId ?? active.performances.at(-1)?.variantId;
  const notDone = plannedNotDone(active);
  const unsavedCardio = addingCardio && cardioDraft.kind !== 'empty' ? cardioDraft : null;

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

  return (
    <main className="screen session gym-mode">
      <header className="session-header">
        <a href="#/" className="back" aria-label="Accueil">
          ‹
        </a>
        <div className="session-title">
          <span className="muted small">{active.name}</span>
          <span className="chrono" role="timer" aria-label="Durée de la séance" data-testid="chrono">
            {formatDuration(elapsedMs(active, now))}
          </span>
        </div>
        <SaveIndicator />
      </header>

      {active.performances.length === 0 && cardioOf(active).length === 0 && <p className="empty muted">Ajoute un premier exercice.</p>}

      <div className="cards">
        {active.performances.map((p) => (
          <ExerciseCard
            key={p.variantId}
            session={active}
            performance={p}
            open={p.variantId === current}
            onToggle={() => setOpenId(p.variantId === current ? '' : p.variantId)}
          />
        ))}
      </div>

      <CardioList
        blocks={cardioOf(active)}
        machines={cardioMachines}
        newId={newId}
        onSave={(block) => void commit(updateCardio(active, block, Date.now()))}
        onRemove={(block) => void commit(removeCardio(active, block.id, Date.now()), 'Cardio retiré')}
      />

      {pendingPlanCardio(active).length > 0 && (
        <ul className="recap-list cardio-list planned-cardio" aria-label="Cardio prévu">
          {pendingPlanCardio(active).map((b) => (
            <li key={b.id} className="card recap-item cardio-item" data-cardio={b.id}>
              <div className="card-line">
                <CardioLine block={b} prefix="Prévu" />
                {/* Le cardio prévu s'enregistre en un appui ; « Corriger » dans son menu une fois validé. */}
                <button
                  type="button"
                  className="btn primary"
                  aria-label={`Valider le cardio prévu : ${formatCardio(b)}`}
                  onClick={() => void commit(addCardio(active, b, Date.now()))}
                >
                  Valider
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

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

      {confirmFinish && (
        <FinishSheet onClose={() => setConfirmFinish(null)}>
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
        </FinishSheet>
      )}
    </main>
  );
}

/**
 * Confirmation de fin de séance (§5.6), en volet fixé en bas de l'écran : toujours visible sans défiler, quelle que
 * soit la longueur de la séance. Le fond assombri ferme le volet (comme « Non »).
 */
function FinishSheet({ onClose, children }: { onClose(): void; children: ReactNode }) {
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
          Terminer la séance ?
        </h2>
        {children}
      </div>
    </>
  );
}
