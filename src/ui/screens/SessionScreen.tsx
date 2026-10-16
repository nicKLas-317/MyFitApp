import { useEffect, useState } from 'react';
import { useApp } from '../../app/store';
import { navigate, useNow } from '../../app/hooks';
import { elapsedMs, finishSession, missingFeelings, newId } from '../../session/ops';
import { addCardio, cardioOf, removeCardio, updateCardio } from '../../cardio/model';
import { CardioForm, CardioList } from '../CardioForm';
import { formatDuration } from '../../session/format';
import { ExerciseCard } from '../ExerciseCard';
import { finishLabel, MissingFeelings } from '../MissingFeelings';
import { SaveIndicator } from '../SaveIndicator';
import { NEUTRAL_FRAMES } from '../groupColors';

export function SessionScreen({ openVariantId }: { openVariantId: string | undefined }) {
  const { active, commit, setLastFinish, cardioMachines } = useApp();
  const now = useNow();
  const [openId, setOpenId] = useState<string | undefined>(openVariantId);
  /** Confirmation de fin ouverte : exercices sans ressenti relevés à l'ouverture. */
  const [confirmFinish, setConfirmFinish] = useState<string[] | null>(null);
  const [addingCardio, setAddingCardio] = useState(false);

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

  async function finish() {
    if (!active) return;
    const { session, removed } = finishSession(active, Date.now());
    setLastFinish({ sessionId: session.id, removed });
    navigate('recap', session.id);
    await commit(session);
  }

  return (
    <main className="screen session" {...NEUTRAL_FRAMES}>
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
            onCancel={() => setAddingCardio(false)}
            onSave={(block) => {
              setAddingCardio(false);
              void commit(addCardio(active, block, Date.now()));
            }}
          />
        ) : (
          <button type="button" className="btn big" onClick={() => setAddingCardio(true)}>
            + Ajouter du cardio
          </button>
        )}
        {confirmFinish ? (
          <div className="confirm-box" role="group" aria-label="Terminer la séance">
            <p>Terminer la séance ?</p>
            <MissingFeelings session={active} variantIds={confirmFinish} />
            <div className="row">
              <button type="button" className="btn primary" onClick={() => void finish()}>
                {finishLabel(active, confirmFinish)}
              </button>
              <button type="button" className="btn" onClick={() => setConfirmFinish(null)}>
                Non
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn big"
            onClick={() => setConfirmFinish(missingFeelings(active).map((p) => p.variantId))}
          >
            Terminer la séance
          </button>
        )}
      </div>
    </main>
  );
}
