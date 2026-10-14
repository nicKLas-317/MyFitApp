import { useState } from 'react';
import { useApp } from '../app/store';
import { navigate } from '../app/hooks';
import { finishSession, isForgotten } from '../session/ops';
import { formatDurationLong, fromDateTimeLocal, toDateTimeLocal } from '../session/format';

/**
 * Séance oubliée (§6) : ouverte depuis plus de 4 heures à la réouverture.
 * Propose de la terminer à l'heure réelle (préremplie avec la dernière modification) ou de la poursuivre.
 * Rien n'est jamais terminé ni supprimé automatiquement.
 */
export function ForgottenDialog() {
  const { active, commit, setLastFinish } = useApp();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());
  const [endText, setEndText] = useState<string | null>(null);
  const [error, setError] = useState(false);

  if (!active || active.startedAt === null || dismissed === active.id || !isForgotten(active, openedAt)) return null;
  const startedAt = active.startedAt;
  const value = endText ?? toDateTimeLocal(Math.max(active.updatedAt, startedAt));

  async function finish() {
    if (!active) return;
    const end = fromDateTimeLocal(value);
    if (end === null || end < startedAt - 60_000 || end > Date.now() + 60_000) {
      setError(true);
      return;
    }
    const { session, removed } = finishSession(active, end);
    setLastFinish({ sessionId: session.id, removed });
    setDismissed(active.id);
    navigate('recap', session.id);
    await commit(session);
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="forgotten-title">
      <div className="dialog">
        <h2 id="forgotten-title">Séance toujours en cours</h2>
        <p>Cette séance est ouverte depuis {formatDurationLong(openedAt - startedAt)}.</p>
        <label htmlFor="forgotten-end">Heure de fin réelle</label>
        <input
          id="forgotten-end"
          type="datetime-local"
          value={value}
          min={toDateTimeLocal(startedAt)}
          max={toDateTimeLocal(Date.now())}
          aria-invalid={error}
          onChange={(e) => {
            setEndText(e.target.value);
            setError(false);
          }}
        />
        {error && (
          <p className="field-error" role="alert">
            L’heure de fin doit se situer entre le début de la séance et maintenant.
          </p>
        )}
        <div className="row">
          <button type="button" className="btn primary" onClick={() => void finish()}>
            Terminer la séance
          </button>
          <button type="button" className="btn" onClick={() => setDismissed(active.id)}>
            Poursuivre
          </button>
        </div>
      </div>
    </div>
  );
}
