import { useEffect, useState } from 'react';
import { useApp } from '../../app/store';
import { navigate } from '../../app/hooks';
import { progressMarker, sortSessions } from '../../engine';
import { displayName, variantLabel } from '../../library/catalog';
import { addVariant, updateVariant, validateVariantName } from '../../library/edit';
import { illustrationFor } from '../../library/illustrations';
import { chartSeries } from '../../analysis/progress';
import { ErrorBoundary } from '../ErrorBoundary';
import { LineChart } from '../LineChart';
import { MUSCLE_GROUP_LABELS } from '../../library/seed';
import { formatIsoDay, formatKg } from '../../session/format';
import { findPerformance } from '../../session/ops';
import { FEELING_LABELS } from '../labels';
import { groupColorProps } from '../groupColors';
import { equipmentLabel, ExercisePicto } from '../Pictogram';
import { StatusBadge } from '../StatusBadge';
import { TargetSummary } from '../TargetSummary';

/** Fiche d'un exercice-variante (§4) : dernière performance, prochaine cible, statut, variantes et historique. */
/** Fiche d'un exercice-variante. `fromBilan` : ouverte depuis le bilan, directement sur le graphique d'évolution. */
export function ExerciseSheet({ variantId, fromBilan = false }: { variantId: string; fromBilan?: boolean }) {
  const { variants, exercises, sessions, replay, active, ctxFor, saveExercises } = useApp();
  const ref = variants.get(variantId);
  const [variantName, setVariantName] = useState<string | null>(null);
  const [variantError, setVariantError] = useState<string | null>(null);

  useEffect(() => {
    // Après la remise en haut de page faite à chaque changement d'écran.
    if (fromBilan) requestAnimationFrame(() => document.getElementById('evolution')?.scrollIntoView({ block: 'start' }));
  }, [fromBilan, variantId]);

  if (!ref) {
    return (
      <main className="screen">
        <p className="empty">Exercice introuvable.</p>
        <a className="btn primary big" href="#/bibliotheque">
          Bibliothèque
        </a>
      </main>
    );
  }

  const { exercise, variant } = ref;
  const ctx = ctxFor(variantId);
  const state = ctx.state;
  const archived = exercise.archived || variant.archived;
  const inSession = active ? !!findPerformance(active, variantId) : false;
  const illustration = illustrationFor(exercise.id, variant.id);
  // Graphique secondaire (§19.2) : une seule variante, jamais mélangée avec une autre.
  const series = chartSeries(variantId, sessions, replay.evaluations);
  const reps = series.flatMap((p) => (p.avgReps === null ? [] : [{ date: p.date, value: p.avgReps }]));

  // Historique de l'exercice-variante, du plus récent au plus ancien (§4, §19.1).
  const history = sortSessions(sessions.filter((s) => s.state === 'done'))
    .reverse()
    .flatMap((s) => {
      const p = s.performances.find((x) => x.variantId === variantId);
      return p ? [{ session: s, performance: p, evaluation: replay.evaluations.find((e) => e.sessionId === s.id && e.variantId === variantId) }] : [];
    });
  const last = history.find((h) => h.evaluation);

  async function toggleFavorite() {
    await saveExercises([updateVariant(exercise, variantId, { favorite: !variant.favorite })]);
  }

  async function createVariant() {
    const name = variantName ?? '';
    const error = validateVariantName(exercise, name);
    if (error) {
      setVariantError(error === 'name_missing' ? 'Saisissez un nom de variante.' : 'Cette variante existe déjà.');
      return;
    }
    const { exercise: next, variantId: id } = addVariant(exercise, name, exercises);
    if (await saveExercises([next])) {
      setVariantName(null);
      navigate('exercice', id);
    }
  }

  return (
    <main className="screen sheet" {...groupColorProps(exercise.primaryGroup)}>
      <header className="simple-header">
        <a href={fromBilan ? '#/bilan' : '#/bibliotheque'} className="back" aria-label={fromBilan ? 'Bilan' : 'Bibliothèque'}>
          ‹
        </a>
        <h1>{exercise.name}</h1>
      </header>

      <div className="sheet-head">
        <ExercisePicto exercise={exercise} variantId={variant.id} large />
        <div>
          {variantLabel({ exercise, variant }) && <p className="variant-line">Variante : {variant.name}</p>}
          <p>
            {MUSCLE_GROUP_LABELS[exercise.primaryGroup]}
            {exercise.secondaryGroups.length > 0 && (
              <span className="muted"> · secondaire : {exercise.secondaryGroups.map((g) => MUSCLE_GROUP_LABELS[g]).join(', ')}</span>
            )}
          </p>
          <p className="muted small">Matériel : {equipmentLabel(exercise)}</p>
          {ctx.cfg.assisted && (
            <p className="small assisted-note" data-testid="assisted">
              Exercice assisté : la charge est une aide (moins d’aide = plus dur)
            </p>
          )}
        </div>
        <button
          type="button"
          className="favorite"
          aria-pressed={!!variant.favorite}
          aria-label="Favori"
          title={variant.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          onClick={() => void toggleFavorite()}
        >
          {variant.favorite ? '★' : '☆'}
        </button>
      </div>

      {illustration && (
        <figure className="illustration">
          <img src={illustration.src} alt={`${exercise.name} : positions de début et de fin du mouvement`} decoding="async" />
          <figcaption className="attribution" data-testid="attribution">
            Illustration : {illustration.author} ·{' '}
            <a href={illustration.licenseUrl} target="_blank" rel="noopener noreferrer license">
              {illustration.license}
            </a>{' '}
            · sources{' '}
            <a href={illustration.sources[0]} target="_blank" rel="noopener noreferrer">
              1
            </a>
            ,{' '}
            <a href={illustration.sources[1]} target="_blank" rel="noopener noreferrer">
              2
            </a>{' '}
            ({illustration.origin}) · recadrée et assemblée
          </figcaption>
        </figure>
      )}

      {archived && <p className="banner info">Exercice archivé : masqué de la recherche, historique conservé.</p>}

      <section className="card sheet-status">
        <TargetSummary
          state={state}
          assisted={ctx.cfg.assisted}
          lastDate={last?.session.date ?? null}
          marker={progressMarker(state)}
          start={{ sets: ctx.cfg.sets, reps: ctx.cfg.minReps }}
          targetTestId="sheet-next"
        />
      </section>

      <div className="sheet-actions">
        {active && !archived && (
          inSession ? (
            <a className="btn primary big" href={`#/seance/${encodeURIComponent(variantId)}`}>
              Ouvrir dans la séance
            </a>
          ) : (
            <button type="button" className="btn primary big" onClick={() => navigate('ajouter', variantId)}>
              Ajouter à la séance
            </button>
          )
        )}
        <a className="btn big" href={`#/modifier/${encodeURIComponent(exercise.id)}`}>
          Modifier
        </a>
      </div>

      <section className="frame">
        <h2 className="section-title">Variantes</h2>
        <ul className="plain-list variants">
          {exercise.variants.map((v) => (
            <li key={v.id}>
              {v.id === variantId ? (
                <strong aria-current="true">{displayName({ exercise, variant: v })}</strong>
              ) : (
                <a href={`#/exercice/${encodeURIComponent(v.id)}`}>{displayName({ exercise, variant: v })}</a>
              )}
              {v.archived && <span className="muted small"> · archivée</span>}
            </li>
          ))}
        </ul>
        {variantName === null ? (
          <button type="button" className="link" onClick={() => setVariantName('')}>
            + Nouvelle variante (machine, prise, inclinaison…)
          </button>
        ) : (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              void createVariant();
            }}
          >
            <label htmlFor="variant-name">Nom de la variante</label>
            <div className="row">
              <input
                id="variant-name"
                type="text"
                autoFocus
                placeholder="ex. 70°, prise serrée"
                value={variantName}
                onChange={(e) => {
                  setVariantName(e.target.value);
                  setVariantError(null);
                }}
              />
              <button type="submit" className="btn primary">
                Créer
              </button>
              <button type="button" className="btn" onClick={() => setVariantName(null)}>
                Annuler
              </button>
            </div>
            {variantError && (
              <p className="field-error" role="alert">
                {variantError}
              </p>
            )}
            <p className="muted small">Une variante a son propre historique et sa propre progression.</p>
          </form>
        )}
      </section>

      {exercise.synonyms.length + variant.synonyms.length > 0 && (
        <section className="frame">
          <h2 className="section-title">Autres noms</h2>
          <p className="small">{[...exercise.synonyms, ...variant.synonyms].join(' · ')}</p>
        </section>
      )}

      {/* Graphique dès la première séance (§19.2) : un seul point tant qu'il n'y en a pas d'autre. */}
      {series.length > 0 && (
        <ErrorBoundary fallback={<p className="muted small">Graphique indisponible.</p>}>
        <section aria-label="Évolution" id="evolution">
          <h2 className="section-title">Évolution</h2>
          {series.length < 2 && (
            <p className="muted small" data-testid="chart-hint">
              Le graphique se complètera au fil des séances.
            </p>
          )}
          <p className="muted small">{ctx.cfg.assisted ? 'Aide (kg)' : 'Charge (kg)'}</p>
          <LineChart data={series.map((p) => ({ date: p.date, value: p.weightKg }))} label={ctx.cfg.assisted ? 'Évolution de l’aide' : 'Évolution de la charge'} unit="kg" testId="chart-weight" />
          {reps.length > 0 && (
            <>
              <p className="muted small">Répétitions par série (moyenne)</p>
              <LineChart data={reps} label="Évolution des répétitions" unit="répétitions" testId="chart-reps" />
            </>
          )}
        </section>
        </ErrorBoundary>
      )}

      <section>
        <h2 className="section-title">Historique</h2>
        {history.length === 0 ? (
          <p className="muted">Aucune séance pour l’instant.</p>
        ) : (
          <ul className="history" aria-label="Historique de l’exercice">
            {history.map(({ session, performance: p, evaluation }) => (
              <li key={session.id} className="history-item">
                <span className="history-date">{formatIsoDay(session.date)}</span>
                <span>
                  {formatKg(p.weightKg)}
                  {p.partial ? (
                    <span className="muted"> · historique partiel</span>
                  ) : (
                    <>
                      {' '}
                      · {p.reps.join(' · ')} <span className="muted small">(cible {p.plannedSets} × {p.targetReps})</span>
                    </>
                  )}
                </span>
                <span className="muted small">
                  {p.partial ? '' : FEELING_LABELS[p.feeling]}
                  {p.feelingSymbol && ` (${p.feelingSymbol})`}
                  {session.origin === 'import' && ' · importée'}
                </span>
                <StatusBadge status={evaluation?.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
