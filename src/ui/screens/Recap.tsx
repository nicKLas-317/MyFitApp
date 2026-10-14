import { useState } from 'react';
import { useApp } from '../../app/store';
import { navigate } from '../../app/hooks';
import { displayName } from '../../library/catalog';
import { formatDay, formatDurationLong, formatHour, formatKg } from '../../session/format';
import { elapsedMs, renameSession, restoreRemoved } from '../../session/ops';
import { FEELING_LABELS, formatRecommendation } from '../labels';
import { StatusBadge } from '../StatusBadge';

/** Récapitulatif de fin de séance (§5.6) : la séance est déjà enregistrée, le nom est facultatif. */
export function Recap({ sessionId }: { sessionId: string }) {
  const { sessions, variants, replay, commit, lastFinish, setLastFinish } = useApp();
  const session = sessions.find((s) => s.id === sessionId);
  const [name, setName] = useState(session?.name ?? '');

  if (!session) {
    return (
      <main className="screen">
        <p className="empty">Séance introuvable.</p>
        <a className="btn primary big" href="#/">
          Accueil
        </a>
      </main>
    );
  }

  const removed = lastFinish?.sessionId === session.id ? lastFinish.removed : [];
  const evaluation = (variantId: string) =>
    replay.evaluations.find((e) => e.sessionId === session.id && e.variantId === variantId);

  async function saveName() {
    if (!session) return;
    const ok = await commit(renameSession(session, name, Date.now()));
    if (ok) navigate('');
  }

  return (
    <main className="screen recap">
      <h1>Séance terminée</h1>
      <p className="muted">
        {session.startedAt !== null && (
          <>
            {formatDay(session.startedAt)} · {formatHour(session.startedAt)}
            {session.endedAt !== null && ` – ${formatHour(session.endedAt)}`} ·{' '}
          </>
        )}
        <span data-testid="duration">{formatDurationLong(elapsedMs(session, Date.now()))}</span>
      </p>

      {removed.length > 0 && (
        <div className="banner info">
          <span>
            {removed.length === 1 ? 'Exercice sans série retiré' : `${removed.length} exercices sans série retirés`} :{' '}
            {removed.map((r) => displayName(variants.get(r.performance.variantId))).join(', ')}
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setLastFinish(null);
              void commit(restoreRemoved(session, removed, Date.now()));
            }}
          >
            Annuler
          </button>
        </div>
      )}

      <form
        className="name-form"
        onSubmit={(e) => {
          e.preventDefault();
          void saveName();
        }}
      >
        <label htmlFor="session-name">Nom de la séance</label>
        <input id="session-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="row">
          <button type="submit" className="btn primary">
            {name.trim() === session.name ? 'Garder ce nom' : 'Enregistrer le nom'}
          </button>
        </div>
      </form>

      <ul className="recap-list">
        {session.performances.map((p) => {
          const ev = evaluation(p.variantId);
          const next = replay.profile.variants[p.variantId]?.recommendation;
          return (
            <li key={p.variantId} className="card recap-item" data-variant={p.variantId}>
              <div className="recap-head">
                <strong>{displayName(variants.get(p.variantId))}</strong>
                <StatusBadge status={ev?.status} />
              </div>
              <div>
                {formatKg(p.weightKg)} · {p.reps.join(' · ')} <span className="muted">(cible {p.plannedSets} × {p.targetReps})</span>
              </div>
              <div className="muted small">{FEELING_LABELS[p.feeling]}</div>
              {next && (
                <div className="small">
                  Prochaine cible : <strong data-testid="next-target">{formatRecommendation(next)}</strong>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
