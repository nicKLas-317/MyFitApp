import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/store';
import { navigate } from '../../app/hooks';
import { displayName } from '../../library/catalog';
import { formatDay, formatDurationLong, formatHour, formatKg, formatReps, formatSetsReps } from '../../session/format';
import { elapsedMs, renameSession } from '../../session/ops';
import { FEELING_LABELS, formatRecommendation } from '../labels';
import { StatusBadge } from '../StatusBadge';
import { cardioOf } from '../../cardio/model';
import { CardioLine } from '../CardioForm';
import { exerciseColorProps } from '../groupColors';
import { Crown } from '../Crown';
import { formatRecord } from '../../analysis/records';
import { perDumbbell } from '../../library/search';
import { autoTitleOf, titleOf } from '../sessionTitle';

/** Récapitulatif de fin de séance (§5.6) : la séance est déjà enregistrée, le nom est facultatif. */
export function Recap({ sessionId }: { sessionId: string }) {
  const { sessions, variants, replay, records, commit, lastFinish, ctxFor } = useApp();
  const session = sessions.find((s) => s.id === sessionId);
  // Nom saisi ; null tant que le champ n'a pas été touché : il montre le nom affiché (version 1.32.0).
  const [typed, setName] = useState<string | null>(null);
  const title = session ? titleOf(session, variants) : '';
  const name = typed ?? title;
  // Écran quitté sans enregistrer le nom (bouton retour, onglet) : le nom saisi est enregistré au passage.
  const latest = useRef({ session, name, title, variants, commit });
  latest.current = { session, name, title, variants, commit };
  useEffect(
    () => () => {
      const { session: s, name: n, title: shown, variants: refs, commit: save } = latest.current;
      if (s && n.trim() && n.trim() !== shown) void save(renameSession(s, n, Date.now(), autoTitleOf(s, refs)));
    },
    [],
  );

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
  // À la maison, un exercice à charge suit sa progression de la maison (version 1.26.0).
  const home = session.location === 'maison';
  // Records battus pendant cette séance (une toute première performance n'en fait pas partie).
  const broken = records.breaks.filter((b) => b.sessionId === session.id);
  const brokenIds = new Set(broken.map((b) => b.variantId));
  const evaluation = (variantId: string) =>
    replay.evaluations.find((e) => e.sessionId === session.id && e.variantId === variantId);

  async function saveName() {
    if (!session) return;
    const ok = await commit(renameSession(session, name, Date.now(), autoTitleOf(session, variants)));
    if (ok) navigate('');
  }

  return (
    <main className="screen recap">
      <h1>Séance terminée</h1>
      {home ? (
        // À la maison, la durée n'a pas d'importance : ni heures ni durée.
        <p className="muted">{session.startedAt !== null && `${formatDay(session.startedAt)} · `}à la maison</p>
      ) : (
        <p className="muted">
          {session.startedAt !== null && (
            <>
              {formatDay(session.startedAt)} · {formatHour(session.startedAt)}
              {session.endedAt !== null && ` – ${formatHour(session.endedAt)}`} ·{' '}
            </>
          )}
          <span data-testid="duration">{formatDurationLong(elapsedMs(session, Date.now()))}</span>
        </p>
      )}

      {/* Exercices sans série : toujours retirés (version 1.28.0), seulement signalés. */}
      {removed.length > 0 && (
        <div className="banner info" role="status">
          <span>
            {removed.length === 1 ? 'Exercice sans série retiré' : `${removed.length} exercices sans série retirés`} :{' '}
            {removed.map((r) => displayName(variants.get(r.performance.variantId))).join(', ')}
          </span>
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
            {name.trim() === title ? 'Garder ce nom' : 'Enregistrer le nom'}
          </button>
        </div>
      </form>

      {broken.length > 0 && (
        <section className="frame records-list" aria-label="Records battus">
          <h2 className="section-title">{broken.length > 1 ? 'Records battus' : 'Record battu'}</h2>
          {broken.map((b) => (
            <p key={b.variantId} className="record-line">
              <Crown />
              <span>
                {displayName(variants.get(b.variantId))} : <strong>{formatRecord(b, perDumbbell(variants.get(b.variantId)))}</strong>
              </span>
            </p>
          ))}
        </section>
      )}

      <ul className="recap-list">
        {session.performances.map((p) => {
          const ev = evaluation(p.variantId);
          const next = ctxFor(p.variantId, home).state?.recommendation;
          return (
            <li key={p.variantId} className="card recap-item" data-variant={p.variantId} {...exerciseColorProps(variants.get(p.variantId)?.exercise)}>
              <div className="recap-head">
                <strong>
                  {displayName(variants.get(p.variantId))}
                  {brokenIds.has(p.variantId) && (
                    <>
                      {' '}
                      <Crown label="Nouveau record" />
                    </>
                  )}
                </strong>
                <StatusBadge status={ev?.status} />
              </div>
              <div>
                {p.weightKg > 0 && `${formatKg(p.weightKg, perDumbbell(variants.get(p.variantId)))} · `}
                {p.reps.map((r) => formatReps(r, ctxFor(p.variantId).cfg.seconds)).join(' · ')}{' '}
                <span className="muted">(cible {formatSetsReps(p.plannedSets ?? 0, p.targetReps ?? 0, ctxFor(p.variantId).cfg.seconds)})</span>
              </div>
              <div className="muted small">{FEELING_LABELS[p.feeling]}</div>
              {next && (
                <div className="small">
                  Prochaine cible : <strong data-testid="next-target">{formatRecommendation(next, ctxFor(p.variantId, home).cfg.assisted, ctxFor(p.variantId, home).cfg.seconds)}</strong>
                </div>
              )}
            </li>
          );
        })}
        {cardioOf(session).map((b) => (
          <li key={b.id} className="card recap-item cardio-item" data-cardio={b.id}>
            <CardioLine block={b} />
          </li>
        ))}
      </ul>

      {/* Retour à l'accueil : le nom saisi, s'il a changé, est enregistré au passage. */}
      <button type="button" className="btn big" onClick={() => void saveName()}>
        Retour à l’accueil
      </button>
    </main>
  );
}
