import { useId, useState } from 'react';
import type { Feeling, Performance, Session } from '../../domain/types';
import { useApp } from '../../app/store';
import { navigateBack, routeHash } from '../../app/hooks';
import { goTab } from '../../app/navigation';
import { createSessionFromTemplate } from '../../engine';
import { correctPerformance, removePastPerformance, setSessionDate, setSessionLocation, type CorrectionError } from '../../history/ops';
import { displayName } from '../../library/catalog';
import { perDumbbell } from '../../library/search';
import { defaultSessionName, formatDurationLong, formatHour, formatIsoDay, formatKg, formatReps, formatSetsReps, kgUnit, localDate } from '../../session/format';
import { canComplete, elapsedMs, newId, parseWeight, renameSession, reopenSession } from '../../session/ops';
import { FEELING_LABELS } from '../labels';
import { StatusBadge } from '../StatusBadge';
import { addCardio, cardioOf, removeCardio, updateCardio } from '../../cardio/model';
import { CardioForm, CardioList } from '../CardioForm';
import { exerciseColorProps } from '../groupColors';
import { Crown } from '../Crown';
import { recordKeys } from '../../analysis/records';
import { autoTitleOf, titleOf } from '../sessionTitle';

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
  const { sessions, variants, replay, settings, active, commit, deleteSession, ctxFor, cardioMachines, records } = useApp();
  const session = sessions.find((s) => s.id === sessionId);
  // Nom saisi ; null tant que le champ n'a pas été touché : il montre le nom affiché, qui suit la séance (version 1.32.0).
  const [name, setName] = useState<string | null>(null);
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
  const title = titleOf(session, variants);
  const home = session.location === 'maison';
  // Séance du jour saisie dans l'appli : elle peut être complétée (version 1.28.0).
  const completable = canComplete(session, Date.now());
  const broke = recordKeys(records);

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
    if (await commit(created)) goTab(routeHash('seance'));
    else setFailed(true);
  }

  /** Compléter la séance du jour (version 1.28.0) : elle se rouvre, ce qui était fait restant fermé. */
  async function complete() {
    if (!session || active) return;
    if (await commit(reopenSession(session, Date.now()))) goTab(routeHash('seance'));
    else setFailed(true);
  }

  async function remove() {
    if (await deleteSession(sessionId)) navigateBack('historique');
    else setFailed(true);
  }

  return (
    <main className="screen session-detail">
      <header className="simple-header">
        <a href="#/historique" className="back" aria-label="Historique">
          ‹
        </a>
        <h1>{title}</h1>
      </header>
      <p className="muted">
        {formatIsoDay(session.date)}
        {/* À la maison, la durée n'a pas d'importance : ni heures ni durée (version 1.26.0). */}
        {home && ' · à la maison'}
        {!home && session.startedAt !== null && ` · ${formatHour(session.startedAt)}`}
        {!home &&
          session.startedAt !== null &&
          session.endedAt !== null &&
          ` – ${formatHour(session.endedAt)} · ${formatDurationLong(elapsedMs(session, session.endedAt))}`}
        {session.origin === 'import' ? ' · importée' : ' · saisie dans l’application'}
      </p>
      {failed && (
        <p className="field-error" role="alert">
          Enregistrement impossible : réessaie.
        </p>
      )}

      <ul className="recap-list" aria-label="Exercices de la séance">
        {session.performances.map((p) => (
          <li key={p.variantId} className="card recap-item" data-variant={p.variantId} {...exerciseColorProps(variants.get(p.variantId)?.exercise)}>
            <div className="recap-head">
              <a className="head-link" href={`#/exercice/${encodeURIComponent(p.variantId)}`}>
                <strong>{displayName(variants.get(p.variantId))}</strong>
                {broke.has(`${session.id}|${p.variantId}`) && (
                  <>
                    {' '}
                    <Crown label="Record battu" />
                  </>
                )}
              </a>
              <StatusBadge status={evaluation(p.variantId)?.status} />
            </div>
            <div>
              {ctxFor(p.variantId, home).cfg.assisted && 'aide '}
              {/* Poids du corps : pas de charge (0), seulement les répétitions. */}
              {p.weightKg > 0 && formatKg(p.weightKg, perDumbbell(variants.get(p.variantId)))}
              {p.partial ? (
                <span className="muted"> · historique partiel</span>
              ) : (
                <>
                  {p.weightKg > 0 && ' · '}
                  {p.reps.map((r) => formatReps(r, ctxFor(p.variantId).cfg.seconds)).join(' · ')}{' '}
                  <span className="muted small">(cible {formatSetsReps(p.plannedSets ?? 0, p.targetReps ?? 0, ctxFor(p.variantId).cfg.seconds)})</span>
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
                bodyweight={!!ctxFor(p.variantId).cfg.bodyweight}
                seconds={!!ctxFor(p.variantId).cfg.seconds}
                dumbbell={perDumbbell(variants.get(p.variantId))}
                onCancel={() => setEditing(null)}
                onSave={(patch) => {
                  const result = correctPerformance(session, p.variantId, patch, Date.now(), ctxFor(p.variantId).cfg.bodyweight);
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
              <button type="button" className="link" onClick={() => setEditing(p.variantId)}>
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
          void save(renameSession(session, name ?? title, Date.now(), autoTitleOf(session, variants)));
          setName(null);
        }}
      >
        <label htmlFor={`${id}-name`}>Nom de la séance</label>
        <div className="row">
          <input id={`${id}-name`} type="text" value={name ?? title} onChange={(e) => setName(e.target.value)} />
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
      {/* Lieu (version 1.26.0) : le changer fait passer les exercices à charge d'un suivi à l'autre, tous deux recalculés. */}
      <div className="name-form">
        <p className="field-label" id={`${id}-place`}>
          Lieu de la séance
        </p>
        <div className="place-choice" role="group" aria-labelledby={`${id}-place`}>
          {(['Salle', 'Maison'] as const).map((label) => (
            <button
              key={label}
              type="button"
              className="chip"
              aria-pressed={home === (label === 'Maison')}
              onClick={() => void save(setSessionLocation(session, label === 'Maison', Date.now()))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="sheet-actions">
        {active ? (
          <p className="muted small">
            Une séance est en cours : termine-la pour en démarrer une nouvelle à partir de celle-ci.{' '}
            <a href="#/seance">Reprendre la séance</a>
          </p>
        ) : (
          <>
            {completable && (
              <button type="button" className="btn primary big" onClick={() => void complete()}>
                Compléter cette séance
              </button>
            )}
            <button type="button" className={`btn big${completable ? '' : ' primary'}`} onClick={() => void reuse()}>
              Nouvelle séance à partir de celle-ci
            </button>
          </>
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
  /** Exercice au poids du corps : pas de champ de poids. */
  bodyweight: boolean;
  /** Exercice en secondes (gainage) : durées par série au lieu des répétitions. */
  seconds: boolean;
  /** Exercice aux haltères : poids d'un haltère, « kg / haltère » (§4.4). */
  dumbbell: boolean;
  onSave(patch: { weightKg?: number; targetReps?: number; plannedSets?: number; reps?: number[]; feeling?: Feeling }): CorrectionError[];
  onCancel(): void;
  onRemove(): void;
}

/** Correction d'une performance passée ; la performance reste cohérente (cible jamais dépassée…). */
function PerformanceEditor({ performance: p, bodyweight, seconds, dumbbell, onSave, onCancel, onRemove }: EditorProps) {
  const id = useId();
  const [weight, setWeight] = useState(String(p.weightKg).replace('.', ','));
  const [reps, setReps] = useState(p.reps.join('-'));
  const [sets, setSets] = useState(String(p.plannedSets ?? (p.reps.length || 3)));
  const [target, setTarget] = useState(String(p.targetReps ?? Math.max(0, ...p.reps)));
  const [feeling, setFeeling] = useState<Feeling>(p.feeling);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmRemove, setConfirmRemove] = useState(false);

  function submit() {
    const weightKg = bodyweight ? 0 : parseWeight(weight);
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
        {!bodyweight && (
          <div className="draft-field">
            <label htmlFor={`${id}-w`}>Poids ({kgUnit(dumbbell)})</label>
            <input id={`${id}-w`} type="text" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
        )}
        <div className="draft-field">
          <label htmlFor={`${id}-r`}>{seconds ? 'Secondes' : 'Répétitions'}</label>
          <input id={`${id}-r`} type="text" value={reps} placeholder={seconds ? '30-30-30' : '8-8-8'} onChange={(e) => setReps(e.target.value)} />
        </div>
        <div className="draft-field">
          <label htmlFor={`${id}-s`}>Séries prévues</label>
          <input id={`${id}-s`} type="text" inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value)} />
        </div>
        <div className="draft-field">
          <label htmlFor={`${id}-t`}>{seconds ? 'Cible (s)' : 'Cible'}</label>
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
