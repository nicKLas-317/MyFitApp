import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/store';
import { navigateBack } from '../../app/hooks';
import type { VariantRef } from '../../library/catalog';
import { addExercise, checkWeight, findPerformance, newId } from '../../session/ops';
import { addToPlan, inPlan, newPlan } from '../../plan/model';
import { ExerciseBrowser } from '../library/ExerciseBrowser';

/**
 * Choix d'un exercice pour la séance en cours (§5.2), avec la recherche de la bibliothèque (§4.1).
 * `variantId` (route `#/ajouter/<id>`) ajoute directement cet exercice, poids de départ demandé si besoin.
 * `forPlan` : même écran pour la séance prévue (§5.9, route `#/seance-prevue/ajouter`).
 */
export function ExercisePicker({ variantId, forPlan = false }: { variantId?: string; forPlan?: boolean }) {
  const { active, variants, ctxFor, commit, plan, savePlan } = useApp();
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [startFor, setStartFor] = useState<string | null>(null);
  const [startWeight, setStartWeight] = useState('');
  const [startError, setStartError] = useState(false);
  const handled = useRef<string | null>(null);

  async function pick(ref: VariantRef, startKg?: number) {
    if (forPlan) return pickForPlan(ref, startKg);
    if (!active) return;
    const id = ref.variant.id;
    if (findPerformance(active, id)) {
      navigateBack('seance', id);
      return;
    }
    const ctx = ctxFor(id);
    if (!ctx.state && startKg === undefined) {
      setStartFor(id);
      setStartWeight('');
      setStartError(false);
      return;
    }
    const { session } = addExercise(active, id, ctx, Date.now(), startKg);
    navigateBack('seance', id);
    await commit(session);
  }

  /** Séance prévue : l'exercice est ajouté à la fin ; un exercice jamais réalisé demande son poids de départ. */
  async function pickForPlan(ref: VariantRef, startKg?: number) {
    const id = ref.variant.id;
    if (inPlan(plan, id)) {
      navigateBack('seance-prevue');
      return;
    }
    if (!ctxFor(id).state && startKg === undefined) {
      setStartFor(id);
      setStartWeight('');
      setStartError(false);
      return;
    }
    const now = Date.now();
    if (await savePlan(addToPlan(plan ?? newPlan(now, newId()), id, now, ctxFor(id).state ? undefined : startKg))) navigateBack('seance-prevue');
    else setFailed(true);
  }

  // Exercice désigné par la route : ajouté une seule fois.
  const direct = variantId ? variants.get(variantId) : undefined;
  useEffect(() => {
    if (!direct || handled.current === direct.variant.id) return;
    handled.current = direct.variant.id;
    void pick(direct);
  }, [direct]);

  if (!active && !forPlan) {
    return (
      <main className="screen">
        <p className="empty">Aucune séance en cours.</p>
        <a className="btn primary big" href="#/">
          Accueil
        </a>
      </main>
    );
  }

  function submitStart(ref: VariantRef) {
    const check = checkWeight(startWeight, undefined);
    if (check.kind === 'invalid') {
      setStartError(true);
      return;
    }
    void pick(ref, check.value);
  }

  const startForm = (ref: VariantRef) =>
    startFor === ref.variant.id ? (
      <form
        className="start-weight"
        onSubmit={(e) => {
          e.preventDefault();
          submitStart(ref);
        }}
      >
        <label htmlFor={`start-${ref.variant.id}`}>{ctxFor(ref.variant.id).cfg.assisted ? 'Aide de départ (kg)' : 'Poids de départ (kg)'}</label>
        <div className="row">
          <input
            id={`start-${ref.variant.id}`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            value={startWeight}
            aria-invalid={startError}
            onChange={(e) => {
              setStartWeight(e.target.value);
              setStartError(false);
            }}
          />
          <button type="submit" className="btn primary">
            Ajouter
          </button>
        </div>
        {startError && (
          <p className="field-error" role="alert">
            Poids invalide : saisir un nombre supérieur à 0.
          </p>
        )}
      </form>
    ) : null;

  return (
    <main className="screen picker">
      <header className="picker-header">
        <a href={forPlan ? '#/seance-prevue' : '#/seance'} className="back" aria-label={forPlan ? 'Retour à la séance prévue' : 'Retour à la séance'}>
          ‹
        </a>
        <input
          type="search"
          className="search"
          placeholder="Exercice, machine ou muscle"
          aria-label="Rechercher un exercice"
          autoFocus={!direct}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>
      {failed && (
        <p className="field-error" role="alert">
          Enregistrement impossible : réessaie.
        </p>
      )}
      {direct && startFor === direct.variant.id && !query ? (
        <ul className="pick-list">
          <li className="pick-item">
            <p className="direct-name">
              <strong>{direct.exercise.name}</strong>
              {direct.variant.id !== direct.exercise.id && <span className="muted"> — {direct.variant.name}</span>}
            </p>
            {startForm(direct)}
          </li>
        </ul>
      ) : (
        <ExerciseBrowser
          query={query}
          onPick={(ref) => void pick(ref)}
          below={startForm}
          note={(ref) =>
            forPlan ? (inPlan(plan, ref.variant.id) ? 'déjà prévu' : null) : active && findPerformance(active, ref.variant.id) ? 'dans la séance' : null
          }
          createHref={(q) => `#/nouvel-exercice/${encodeURIComponent(q)}/${forPlan ? 'prevue' : 'seance'}`}
        />
      )}
    </main>
  );
}
