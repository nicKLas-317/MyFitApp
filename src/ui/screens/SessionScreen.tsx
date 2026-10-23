import { useEffect, useState, type ReactNode } from 'react';
import { useApp } from '../../app/store';
import { navigate, useNow } from '../../app/hooks';
import { elapsedMs, finishSession, missingFeelings, newId } from '../../session/ops';
import { addCardio, cardioOf, formatCardio, removeCardio, updateCardio } from '../../cardio/model';
import { CardioForm, CardioList, type CardioDraft } from '../CardioForm';
import { formatDuration } from '../../session/format';
import { ExerciseCard } from '../ExerciseCard';
import { finishLabel, MissingFeelings, remainingFeelings } from '../MissingFeelings';
import { SaveIndicator } from '../SaveIndicator';

export function SessionScreen({ openVariantId }: { openVariantId: string | undefined }) {
  const { active, commit, setLastFinish, cardioMachines } = useApp();
  const now = useNow();
  const [openId, setOpenId] = useState<string | undefined>(openVariantId);
  /** Confirmation de fin ouverte : exercices sans ressenti relevés à l'ouverture. */
  const [confirmFinish, setConfirmFinish] = useState<string[] | null>(null);
  const [addingCardio, setAddingCardio] = useState(false);
  /** Saisie du formulaire de cardio ouvert, proposée à l'enregistrement si la séance est terminée sans « Valider ». */
  const [cardioDraft, setCardioDraft] = useState<CardioDraft>({ kind: 'empty' });

  useEffect(() => {
    if (!openVariantId) return;
    setOpenId(openVariantId);
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

  const current = openId ?? active.performances.at(-1)?.variantId;
  const unsavedCardio = addingCardio && cardioDraft.kind !== 'empty' ? cardioDraft : null;

  function openCardio(open: boolean) {
    setAddingCardio(open);
    setCardioDraft({ kind: 'empty' });
  }

  async function finish() {
    if (!active || unsavedCardio?.kind === 'error') return;
    const now = Date.now();
    // Un bloc rempli mais pas validé est enregistré avec la fin de la séance, dans la même écriture.
    const withCardio = unsavedCardio ? addCardio(active, unsavedCardio.block, now) : active;
    openCardio(false);
    const { session, removed } = finishSession(withCardio, now);
    setLastFinish({ sessionId: session.id, removed });
    navigate('recap', session.id);
    await commit(session);
  }

  return (
    <main className="screen session">
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

      {active.performances.length === 0 && cardioOf(active).length === 0 && <p className="empty muted">Ajoutez un premier exercice.</p>}

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

      <div className="session-actions">
        <a className="btn primary big" href="#/ajouter">
          + Ajouter un exercice
        </a>
        {addingCardio ? (
          <CardioForm
            machines={cardioMachines}
            newId={newId}
            onCancel={() => openCardio(false)}
            onDraft={setCardioDraft}
            onSave={(block) => {
              openCardio(false);
              void commit(addCardio(active, block, Date.now()));
            }}
          />
        ) : (
          <button type="button" className="btn big" onClick={() => openCardio(true)}>
            + Ajouter du cardio
          </button>
        )}
        <button
          type="button"
          className="btn big"
          aria-expanded={confirmFinish !== null}
          onClick={() => setConfirmFinish(missingFeelings(active).map((p) => p.variantId))}
        >
          Terminer la séance
        </button>
      </div>

      {confirmFinish && (
        <FinishSheet onClose={() => setConfirmFinish(null)}>
          <MissingFeelings session={active} variantIds={confirmFinish} />
          {unsavedCardio?.kind === 'block' && (
            <p data-testid="unsaved-cardio">Cardio non validé : {formatCardio(unsavedCardio.block)}</p>
          )}
          {unsavedCardio?.kind === 'error' && (
            <p className="field-error" role="alert">
              Cardio non validé : {unsavedCardio.message} Corrigez-le ou annulez-le.
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
