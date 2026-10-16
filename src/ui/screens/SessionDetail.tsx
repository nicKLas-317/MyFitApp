import { useId, useState } from 'react';
import type { Feeling, Performance, Session } from '../../domain/types';
import { useApp } from '../../app/store';
import { navigate } from '../../app/hooks';
import { createSessionFromTemplate } from '../../engine';
import { correctPerformance, removePastPerformance, setSessionDate, type CorrectionError } from '../../history/ops';
import { displayName } from '../../library/catalog';
import { defaultSessionName, formatDurationLong, formatHour, formatIsoDay, formatKg, localDate } from '../../session/format';
import { elapsedMs, newId, parseWeight, renameSession } from '../../session/ops';
import { FEELING_LABELS } from '../labels';
import { StatusBadge } from '../StatusBadge';
import { addCardio, cardioOf, removeCardio, updateCardio } from '../../cardio/model';
import { CardioForm, CardioList } from '../CardioForm';
import { NEUTRAL_FRAMES, exerciseColorProps } from '../groupColors';

const FEELING_ORDER: Feeling[] = ['tres_bien', 'bien', 'moyen', 'mal', 'tres_mal', 'inconnu'];

const ERROR_LABELS: Record<CorrectionError, string> = {
  invalid_weight: 'Poids invalide.',
  invalid_target: 'Cible invalide.',
  invalid_planned_sets: 'Nombre de séries invalide.',
  invalid_reps: 'Répétitions invalides.',
  reps_above_target: 'Une série dépasse la cible.',
  too_many_sets: 'Plus de séries réalisées que prévues.',
  not_found: 'Exercice introuvable.',
  no_sets: 'Au moins une série est nécessaire.',
};

/** Détail d'une séance passée : consultation, renommage, correction, suppression, réutilisation (§10). */
export function SessionDetail({ sessionId }: { sessionId: string }) {
  const { sessions, variants, replay, settings, active, commit, deleteSession, ctxFor, cardioMachines } = useApp();
  const session = sessions.find((s) => s.id === sessionId);
  const [name, setName] = useState(session?.name ?? '');
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingCardio, setAddingCardio] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = useId();

  if (!session || session.state !== 'done') {
    return (
      <main className="screen">
        <p className="empty">Séance introuvable.</p>
        <a className="btn primary big" href="#/historique">
          Historique
        </a>
      </main>
    );
  }

  const evaluation = (variantId: string) => replay.evaluations.find((e) => e.sessionId === session.id && e.variantId === variantId);

  async function save(next: Session) {
    setFailed(!(await commit(next)));
  }

  async function reuse() {
    if (!session || active) return;
    const now = Date.now();
    const { session: created } = createSessionFromTemplate(session, replay.profile, settings, {
      id: newId(),
      name: defaultSessionName(now),
      date: localDate(now),
      now,
    });
    if (await commit(created)) navigate('seance');
    else setFailed(true);
  }

  async function remove() {
    if (await deleteSession(sessionId)) navigate('historique');
    else setFailed(true);
  }

  return (
    <main className="screen session-detail" {...NEUTRAL_FRAMES}>
      <header className="simple-header">
        <a href="#/historique" className="back" aria-label="Historique">
          ‹
        </a>
        <h1>{session.name}</h1>
      </header>
      <p className="muted">
        {formatIsoDay(session.date)}
        {session.startedAt !== null && ` · ${formatHour(session.startedAt)}`}
        {session.startedAt !== null && session.endedAt !== null && ` – ${formatHour(session.endedAt)} · ${formatDurationLong(elapsedMs(session, session.endedAt))}`}
        {session.origin === 'import' ? ' · importée' : ' · saisie dans l’application'}
      </p>
      {failed && (
        <p className="field-error" role="alert">
          Enregistrement impossible : réessayez.
        </p>
      )}

      <ul className="recap-list" aria-label="Exercices de la séance">
        {session.performances.map((p) => (
          <li key={p.variantId} className="card recap-item" data-variant={p.variantId} {...exerciseColorProps(variants.get(p.variantId)?.exercise)}>
            <div className="recap-head">
              <a href={`#/exercice/${encodeURIComponent(p.variantId)}`}>
                <strong>{displayName(variants.get(p.variantId))}</strong>
              </a>
              <StatusBadge status={evaluation(p.variantId)?.status} />
            </div>
            <div>
              {ctxFor(p.variantId).cfg.assisted && 'aide '}
              {formatKg(p.weightKg)}
              {p.partial ? (
                <span className="muted"> · historique partiel</span>
              ) : (
                <>
                  {' '}
                  · {p.reps.join(' · ')} <span className="muted small">(cible {p.plannedSets} × {p.targetReps})</span>
                </>
              )}
            </div>
            {!p.partial && (
              <div className="muted small">
                {FEELING_LABELS[p.feeling]}
                {p.feelingSymbol && ` (${p.feelingSymbol})`}
              </div>
            )}
            {editing === p.variantId ? (
              <PerformanceEditor
                performance={p}
                onCancel={() => setEditing(null)}
                onSave={(patch) => {
                  const result = correctPerformance(session, p.variantId, patch, Date.now());
                  if (result.errors.length === 0) {
                    setEditing(null);
                    void save(result.session);
                  }
                  return result.errors;
                }}
                onRemove={() => {
                  setEditing(null);
                  void save(removePastPerformance(session, p.variantId, Date.now()));
                }}
              />
            ) : (
              <button type="button" className="link small" onClick={() => setEditing(p.variantId)}>
                Corriger
              </button>
            )}
          </li>
        ))}
      </ul>

      <CardioList
        blocks={cardioOf(session)}
        machines={cardioMachines}
        newId={newId}
        confirmRemove
        onSave={(block) => void save(updateCardio(session, block, Date.now()))}
        onRemove={(block) => void save(removeCardio(session, block.id, Date.now()))}
      />
      {addingCardio ? (
        <CardioForm
          machines={cardioMachines}
          newId={newId}
          onCancel={() => setAddingCardio(false)}
          onSave={(block) => {
            setAddingCardio(false);
            void save(addCardio(session, block, Date.now()));
          }}
        />
      ) : (
        <button type="button" className="link small" onClick={() => setAddingCardio(true)}>
          + Ajouter du cardio à cette séance
        </button>
      )}

      <form
        className="name-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save(renameSession(session, name, Date.now()));
        }}
      >
        <label htmlFor={`${id}-name`}>Nom de la séance</label>
        <div className="row">
          <input id={`${id}-name`} type="text" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn">
            Renommer
          </button>
        </div>
      </form>
      <div className="name-form">
        <label htmlFor={`${id}-date`}>Date de la séance</label>
        <input
          id={`${id}-date`}
          type="date"
          value={session.date}
          max={localDate(Date.now())}
          onChange={(e) => {
            if (e.target.value) void save(setSessionDate(session, e.target.value, Date.now()));
          }}
        />
      </div>

      <div className="sheet-actions">
        {active ? (
          <p className="muted small">
            Une séance est en cours : terminez-la pour en démarrer une nouvelle à partir de celle-ci.{' '}
            <a href="#/seance">Reprendre la séance</a>
          </p>
        ) : (
          <button type="button" className="btn primary big" onClick={() => void reuse()}>
            Nouvelle séance à partir de celle-ci
          </button>
        )}
        {confirmDelete ? (
          <div className="confirm-box" role="group" aria-label="Supprimer la séance">
            <p>Supprimer définitivement cette séance ? Les recommandations seront recalculées.</p>
            <div className="row">
              <button type="button" className="btn danger" onClick={() => void remove()}>
                Oui, supprimer
              </button>
              <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="link danger" onClick={() => setConfirmDelete(true)}>
            Supprimer la séance
          </button>
        )}
      </div>

      {session.sourceText && (
        <details className="source-text">
          <summary>Texte d’origine</summary>
          <pre>{session.sourceText}</pre>
        </details>
      )}
    </main>
  );
}

interface EditorProps {
  performance: Performance;
  onSave(patch: { weightKg?: number; targetReps?: number; plannedSets?: number; reps?: number[]; feeling?: Feeling }): CorrectionError[];
  onCancel(): void;
  onRemove(): void;
}

/** Correction d'une performance passée ; la performance reste cohérente (cible jamais dépassée…). */
function PerformanceEditor({ performance: p, onSave, onCancel, onRemove }: EditorProps) {
  const id = useId();
  const [weight, setWeight] = useState(String(p.weightKg).replace('.', ','));
  const [reps, setReps] = useState(p.reps.join('-'));
  const [sets, setSets] = useState(String(p.plannedSets ?? (p.reps.length || 3)));
  const [target, setTarget] = useState(String(p.targetReps ?? Math.max(0, ...p.reps)));
  const [feeling, setFeeling] = useState<Feeling>(p.feeling);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmRemove, setConfirmRemove] = useState(false);

  function submit() {
    const weightKg = parseWeight(weight);
    const list = (reps.match(/\d+/g) ?? []).map(Number);
    if (weightKg === null) return setErrors(['Poids invalide.']);
    const result = onSave({ weightKg, reps: list, plannedSets: Number(sets), targetReps: Number(target), feeling });
    setErrors([...new Set(result.map((e) => ERROR_LABELS[e]))]);
  }

  return (
    <form
      className="perf-editor"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="field-grid">
        <div className="draft-field">
          <label htmlFor={`${id}-w`}>Poids (kg)</label>
          <input id={`${id}-w`} type="text" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div className="draft-field">
          <label htmlFor={`${id}-r`}>Répétitions</label>
          <input id={`${id}-r`} type="text" value={reps} placeholder="8-8-8" onChange={(e) => setReps(e.target.value)} />
        </div>
        <div className="draft-field">
          <label htmlFor={`${id}-s`}>Séries prévues</label>
          <input id={`${id}-s`} type="text" inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value)} />
        </div>
        <div className="draft-field">
          <label htmlFor={`${id}-t`}>Cible</label>
          <input id={`${id}-t`} type="text" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
      </div>
      <div className="draft-field">
        <label htmlFor={`${id}-f`}>Ressenti</label>
        <select id={`${id}-f`} value={feeling} onChange={(e) => setFeeling(e.target.value as Feeling)}>
          {FEELING_ORDER.map((f) => (
            <option key={f} value={f}>
              {f === 'inconnu' ? 'Inconnu' : FEELING_LABELS[f]}
            </option>
          ))}
        </select>
      </div>
      {errors.length > 0 && (
        <ul className="problems" role="alert">
          {errors.map((e) => (
            <li key={e} className="problem error">
              {e}
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <button type="submit" className="btn primary">
          Enregistrer la correction
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Annuler
        </button>
      </div>
      {confirmRemove ? (
        <div className="row">
          <span className="small">Retirer cet exercice de la séance ?</span>
          <button type="button" className="btn danger" onClick={onRemove}>
            Oui, retirer
          </button>
          <button type="button" className="btn" onClick={() => setConfirmRemove(false)}>
            Non
          </button>
        </div>
      ) : (
        <button type="button" className="link danger small" onClick={() => setConfirmRemove(true)}>
          Retirer l’exercice de cette séance
        </button>
      )}
    </form>
  );
}
