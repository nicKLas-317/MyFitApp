import { useState } from 'react';
import type { MuscleGroup } from '../../domain/types';
import { useApp } from '../../app/store';
import { navigate } from '../../app/hooks';
import { displayName } from '../../library/catalog';
import { perDumbbell } from '../../library/search';
import { MUSCLE_GROUP_LABELS } from '../../library/seed';
import { newId } from '../../session/ops';
import { formatCardio } from '../../cardio/model';
import { plannedPerformance, startFromPlan } from '../../plan/model';
import { SUGGEST_MAX, suggestionPlan, type SkipReason } from '../../plan/suggest';
import { groupColorProps } from '../groupColors';
import { ExercisePicto } from '../Pictogram';
import { cardHint, NextTarget } from '../TargetSummary';
import { useWeekSuggestion } from '../WeekSuggestion';

const names = (groups: readonly MuscleGroup[]) => groups.map((g) => MUSCLE_GROUP_LABELS[g]).join(', ');

/**
 * Séance pour compléter la semaine (version 1.39.0, §5.15) : l'échauffement, les exercices avec la charge et la cible
 * du moteur (comme la séance prévue), ce que la séance apporterait et ce qui n'est pas proposé. Rien ne se modifie
 * ici : « En faire ma séance prévue » la copie dans le plan (modifiable), « Démarrer cette séance » la déroule comme
 * une séance prévue sans toucher au plan.
 */
export function SuggestionScreen() {
  const { active, plan, savePlan, variants, ctxFor, commit, recapSettings } = useApp();
  const suggestion = useWeekSuggestion();
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [failed, setFailed] = useState(false);

  const header = (
    <header className="simple-header">
      <a href="#/" className="back" aria-label="Accueil">
        ‹
      </a>
      <h1>Compléter la semaine</h1>
    </header>
  );
  if (active || !suggestion) {
    return (
      <main className="screen tab-screen suggest-screen">
        {header}
        <p className="muted">{active ? 'Une séance est en cours.' : 'Rien à compléter pour l’instant.'}</p>
        <a className="btn primary big" href={active ? '#/seance' : '#/'}>
          {active ? 'Reprendre la séance' : 'Accueil'}
        </a>
      </main>
    );
  }

  const s = suggestion;
  const available = (id: string) => {
    const ref = variants.get(id);
    return !!ref && !ref.exercise.archived && !ref.variant.archived;
  };

  async function start() {
    const now = Date.now();
    // Déroulée comme une séance prévue (ordre, élément suivant ouvert au ressenti), avec son propre identifiant de
    // plan : la séance prévue enregistrée n'est ni remplacée ni consommée.
    if (await commit(startFromPlan(suggestionPlan(s, now, newId), ctxFor, available, now, newId()))) navigate('seance');
  }

  async function makePlan() {
    setConfirmReplace(false);
    const ok = await savePlan(suggestionPlan(s, Date.now(), newId));
    setFailed(!ok);
    if (ok) navigate('seance-prevue');
  }

  const skipped = (reason: SkipReason) => s.skipped.filter((x) => x.reason === reason).map((x) => x.group);
  const eve = skipped('veille');
  const noRoom = skipped('place');
  const none = skipped('aucun');

  return (
    <main className="screen tab-screen suggest-screen">
      {header}
      <p className="muted">
        Pour {s.tomorrow ? 'demain' : 'aujourd’hui'}, à la salle : les groupes de ton récapitulatif encore sous {recapSettings.redThreshold}
        {' '}séances cette semaine.
      </p>
      {failed && (
        <p className="field-error" role="alert">
          Enregistrement impossible : réessaie.
        </p>
      )}

      <ol className="plan-list" aria-label="Séance proposée">
        {s.cardio && (
          <li className="card plan-item suggest-cardio" data-testid="suggest-cardio">
            <p>
              <strong>Échauffement</strong> · {formatCardio(s.cardio)}
            </p>
          </li>
        )}
        {s.exercises.map((e) => {
          const ref = variants.get(e.variantId);
          const name = displayName(ref);
          const ctx = ctxFor(e.variantId);
          const p = plannedPerformance({ variantId: e.variantId }, ctx);
          const { hint } = p ? cardHint(ctx.state, ctx.cfg.assisted, p, ctx.cfg.seconds) : { hint: null };
          return (
            <li key={e.variantId} className="card plan-item" data-variant={e.variantId} aria-label={name} {...(ref ? groupColorProps(ref.exercise.primaryGroup) : {})}>
              <div className="plan-name">
                {ref && <ExercisePicto exercise={ref.exercise} variantId={ref.variant.id} />}
                <strong>{name}</strong>
              </div>
              <div className="plan-target-text">
                {p ? (
                  <NextTarget
                    target={{ sets: p.plannedSets ?? 0, reps: p.targetReps ?? 0, weightKg: p.weightKg }}
                    assisted={ctx.cfg.assisted}
                    seconds={ctx.cfg.seconds}
                    perDumbbell={perDumbbell(ref)}
                    hint={hint}
                  />
                ) : (
                  <p className="muted">Exercice introuvable.</p>
                )}
                {e.bonus && <p className="muted suggest-bonus">Bonus abdos, en fin de séance</p>}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="suggest-notes" data-testid="suggest-notes">
        {s.reached.length > 0 && (
          <p>
            Avec cette séance, à l’objectif : <strong>{names(s.reached)}</strong>.
          </p>
        )}
        {s.remaining.length > 0 && <p className="muted">Encore sous l’objectif : {names(s.remaining)}.</p>}
        {s.covered.map((c) => (
          <p key={c.group} className="muted">
            {MUSCLE_GROUP_LABELS[c.group]} : complété par {displayName(variants.get(c.by))} (groupe secondaire).
          </p>
        ))}
        {eve.length > 0 && (
          <p className="muted">
            Pas cette fois (séance à la salle {s.tomorrow ? 'aujourd’hui' : 'hier'}) : {names(eve)}.
          </p>
        )}
        {noRoom.length > 0 && (
          <p className="muted">
            Pas de place ({SUGGEST_MAX} exercices au plus) : {names(noRoom)}.
          </p>
        )}
        {none.length > 0 && <p className="muted">Aucun exercice fait récemment à la salle : {names(none)}.</p>}
      </div>

      <div className="suggest-actions">
        <button type="button" className="btn primary huge" onClick={() => void start()}>
          Démarrer cette séance
        </button>
        {confirmReplace ? (
          <div className="confirm-box" role="alertdialog" aria-label="Remplacer ta séance prévue ?">
            <p>Remplacer ta séance prévue par cette séance ?</p>
            <div className="row">
              <button type="button" className="btn primary" onClick={() => void makePlan()}>
                Oui, remplacer
              </button>
              <button type="button" className="btn" onClick={() => setConfirmReplace(false)}>
                Non
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn big" onClick={() => (plan ? setConfirmReplace(true) : void makePlan())}>
            {plan ? 'Remplacer ma séance prévue' : 'En faire ma séance prévue'}
          </button>
        )}
      </div>
    </main>
  );
}
