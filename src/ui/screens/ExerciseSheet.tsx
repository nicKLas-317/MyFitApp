import { useEffect, useState } from 'react';
import { useApp } from '../../app/store';
import { navigate, navigateReplace } from '../../app/hooks';
import { HOME_SUFFIX, sortSessions } from '../../engine';
import { displayName, variantLabel } from '../../library/catalog';
import { addVariant, updateVariant, validateVariantName } from '../../library/edit';
import { illustrationFor } from '../../library/illustrations';
import { chartSeries } from '../../analysis/progress';
import { ErrorBoundary } from '../ErrorBoundary';
import { LineChart } from '../LineChart';
import { MUSCLE_GROUP_LABELS } from '../../library/seed';
import { formatIsoDay, formatKg, formatNumericDay, formatSetsReps } from '../../session/format';
import { findPerformance } from '../../session/ops';
import { FEELING_LABELS } from '../labels';
import { groupColorProps } from '../groupColors';
import { equipmentLabel, ExercisePicto } from '../Pictogram';
import { StatusBadge } from '../StatusBadge';
import { recommendedTarget, TargetSummary } from '../TargetSummary';
import { Crown } from '../Crown';
import { recordKeys } from '../../analysis/records';

/** Séances affichées dans l'historique de la fiche avant « Voir tout ». */
const HISTORY_LIMIT = 5;

/** Jour d'une ligne d'historique : « 15/10 », année ajoutée hors de l'année en cours (« 15/10/25 »). */
function historyDay(date: string): string {
  return date.slice(0, 4) === String(new Date().getFullYear()) ? formatNumericDay(date) : `${formatNumericDay(date)}/${date.slice(2, 4)}`;
}

/**
 * Fiche d'un exercice-variante (§4) : prochaine cible et dernière fois en premier, puis l'exercice (illustration
 * réduite, agrandie au toucher), l'évolution, l'historique (5 dernières séances, « Voir tout »), les variantes.
 * `fromBilan` : ouverte depuis le bilan, directement sur le graphique d'évolution.
 */
export function ExerciseSheet({ variantId, fromBilan = false }: { variantId: string; fromBilan?: boolean }) {
  const { variants, exercises, sessions, replay, records, active, ctxFor, saveExercises } = useApp();
  const ref = variants.get(variantId);
  const [variantName, setVariantName] = useState<string | null>(null);
  const [variantError, setVariantError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [showAll, setShowAll] = useState(false);

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
  // Suivi de la maison d'un exercice à charge (version 1.26.0) : affiché à part, s'il existe.
  const homeCtx = ctxFor(variantId, true);
  const homeState = ctx.cfg.bodyweight ? undefined : homeCtx.state;
  const archived = exercise.archived || variant.archived;
  const inSession = active ? !!findPerformance(active, variantId) : false;
  const illustration = illustrationFor(exercise.id, variant.id);
  // Graphique secondaire (§19.2) : une seule variante, jamais mélangée avec une autre.
  // Exercice à charge : la salle seulement (les charges de la maison ne sont pas comparables).
  const series = chartSeries(variantId, sessions, replay.evaluations, (s) => !!ctx.cfg.bodyweight || s.location !== 'maison');
  const reps = series.flatMap((p) => (p.avgReps === null ? [] : [{ date: p.date, value: p.avgReps }]));
  const broke = recordKeys(records);

  // Historique de l'exercice-variante, du plus récent au plus ancien (§4, §19.1).
  const history = sortSessions(sessions.filter((s) => s.state === 'done'))
    .reverse()
    .flatMap((s) => {
      const p = s.performances.find((x) => x.variantId === variantId);
      return p ? [{ session: s, performance: p, evaluation: replay.evaluations.find((e) => e.sessionId === s.id && e.variantId === variantId) }] : [];
    });
  const last = history.find((h) => h.evaluation && !h.evaluation.home);
  const lastHome = history.find((h) => h.evaluation?.home);

  async function toggleFavorite() {
    await saveExercises([updateVariant(exercise, variantId, { favorite: !variant.favorite })]);
  }

  async function createVariant() {
    const name = variantName ?? '';
    const error = validateVariantName(exercise, name);
    if (error) {
      setVariantError(error === 'name_missing' ? 'Saisis un nom de variante.' : 'Cette variante existe déjà.');
      return;
    }
    const { exercise: next, variantId: id } = addVariant(exercise, name, exercises);
    if (await saveExercises([next])) {
      setVariantName(null);
      navigateReplace('exercice', id);
    }
  }

  const shown = showAll ? history : history.slice(0, HISTORY_LIMIT);

  return (
    <main className="screen sheet" {...groupColorProps(exercise.primaryGroup)}>
      <header className="simple-header">
        <a href={fromBilan ? '#/bilan' : '#/bibliotheque'} className="back" aria-label={fromBilan ? 'Bilan' : 'Bibliothèque'}>
          ‹
        </a>
        <h1>{exercise.name}</h1>
      </header>

      {archived && <p className="banner info">Exercice archivé : masqué de la recherche, historique conservé.</p>}

      <section className="card sheet-status">
        <TargetSummary
          state={state}
          assisted={ctx.cfg.assisted}
          lastDate={last?.session.date ?? null}
          label={homeState ? 'Prochaine cible à la salle' : 'Prochaine cible'}
          {...recommendedTarget(state, { sets: ctx.cfg.sets, reps: ctx.cfg.minReps }, ctx.cfg.assisted, ctx.cfg.seconds)}
          targetTestId="sheet-next"
          record={records.current.get(variantId) ?? null}
          bodyweight={ctx.cfg.bodyweight}
          seconds={ctx.cfg.seconds}
        />
      </section>
      {homeState && (
        <section className="card sheet-status" aria-label="À la maison" data-testid="sheet-home">
          <TargetSummary
            state={homeState}
            assisted={homeCtx.cfg.assisted}
            lastDate={lastHome?.session.date ?? null}
            label="Prochaine cible à la maison"
            {...recommendedTarget(homeState, { sets: homeCtx.cfg.sets, reps: homeCtx.cfg.minReps }, homeCtx.cfg.assisted)}
            targetTestId="sheet-next-home"
            record={records.current.get(`${variantId}${HOME_SUFFIX}`) ?? null}
          />
        </section>
      )}

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

      <div className="sheet-head">
        {illustration ? (
          <button
            type="button"
            className="illustration-thumb"
            aria-expanded={zoomed}
            aria-controls="illustration"
            aria-label={zoomed ? 'Réduire l’illustration' : 'Agrandir l’illustration'}
            onClick={() => setZoomed(!zoomed)}
          >
            <ExercisePicto exercise={exercise} variantId={variant.id} large />
          </button>
        ) : (
          <ExercisePicto exercise={exercise} variantId={variant.id} large />
        )}
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
          {ctx.cfg.bodyweight && (
            <p className="small assisted-note" data-testid="bodyweight">
              {ctx.cfg.seconds
                ? `Gainage : progression par la durée (${ctx.cfg.minReps} à ${ctx.cfg.maxReps} s)`
                : `Poids du corps : progression par les répétitions (${ctx.cfg.minReps} à ${ctx.cfg.maxReps})`}
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

      {illustration && zoomed && (
        <figure className="illustration" id="illustration">
          <button type="button" className="illustration-zoom" aria-label="Réduire l’illustration" onClick={() => setZoomed(false)}>
            <img src={illustration.src} alt={`${exercise.name} : positions de début et de fin du mouvement`} decoding="async" />
          </button>
          <figcaption className="attribution" data-testid="attribution">
            <span>
              Illustration : {illustration.author} ({illustration.origin}) · recadrée et assemblée
            </span>
            <span className="attribution-links">
              Licence
              <a href={illustration.licenseUrl} target="_blank" rel="noopener noreferrer license">
                {illustration.license}
              </a>
              · sources
              <a href={illustration.sources[0]} target="_blank" rel="noopener noreferrer">
                1
              </a>
              <a href={illustration.sources[1]} target="_blank" rel="noopener noreferrer">
                2
              </a>
            </span>
          </figcaption>
        </figure>
      )}

      {series.length > 0 && (
        <ErrorBoundary fallback={<p className="muted small">Graphique indisponible.</p>}>
        <section aria-label="Évolution" id="evolution">
          <h2 className="section-title">Évolution</h2>
          {series.length < 2 && (
            <p className="muted small" data-testid="chart-hint">
              Le graphique se complètera au fil des séances.
            </p>
          )}
          {/* Poids du corps : pas de charge, seulement les répétitions. */}
          {!ctx.cfg.bodyweight && (
            <>
              <p className="muted small">{ctx.cfg.assisted ? 'Aide (kg)' : 'Charge (kg)'}</p>
              <LineChart data={series.map((p) => ({ date: p.date, value: p.weightKg }))} label={ctx.cfg.assisted ? 'Évolution de l’aide' : 'Évolution de la charge'} unit="kg" testId="chart-weight" />
            </>
          )}
          {reps.length > 0 && (
            <>
              <p className="muted small">{ctx.cfg.seconds ? 'Durée par série (moyenne, s)' : 'Répétitions par série (moyenne)'}</p>
              <LineChart
                data={reps}
                label={ctx.cfg.seconds ? 'Évolution de la durée' : 'Évolution des répétitions'}
                unit={ctx.cfg.seconds ? 'secondes' : 'répétitions'}
                testId="chart-reps"
              />
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
          <>
            <ul className="frame sheet-history" aria-label="Historique de l’exercice">
              {shown.map(({ session, performance: p, evaluation }) => (
                <li key={session.id} className="sheet-history-row">
                  <span className="history-date">
                    <span aria-hidden="true">{historyDay(session.date)}</span>
                    <span className="visually-hidden">{formatIsoDay(session.date)}</span>
                  </span>
                  <span className="sheet-history-main">
                    {/* Poids du corps : pas de charge (0), seulement les répétitions. */}
                    {p.weightKg > 0 && formatKg(p.weightKg)}
                    {p.partial ? (
                      <span className="muted"> · historique partiel</span>
                    ) : p.weightKg > 0 ? (
                      <>
                        {' '}
                        · {p.reps.join('-')}
                      </>
                    ) : (
                      `${p.reps.join('-')}${ctx.cfg.seconds ? ' s' : ''}`
                    )}
                    {broke.has(`${session.id}|${variantId}`) && (
                      <>
                        {' '}
                        <Crown label="Record battu" />
                      </>
                    )}
                  </span>
                  <StatusBadge status={evaluation?.status} />
                  <span className="muted small sheet-history-sub">
                    {[
                      p.partial ? null : `cible ${formatSetsReps(p.plannedSets ?? 0, p.targetReps ?? 0, ctx.cfg.seconds)}`,
                      p.partial ? null : `${FEELING_LABELS[p.feeling]}${p.feelingSymbol ? ` (${p.feelingSymbol})` : ''}`,
                      session.location === 'maison' ? 'maison' : null,
                      session.origin === 'import' ? 'importée' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
            {history.length > HISTORY_LIMIT && (
              <button type="button" className="link" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
                {showAll ? `Voir les ${HISTORY_LIMIT} dernières` : `Voir tout (${history.length} séances)`}
              </button>
            )}
          </>
        )}
      </section>

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
    </main>
  );
}
