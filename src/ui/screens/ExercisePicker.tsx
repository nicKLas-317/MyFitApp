import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/store';
import { navigate } from '../../app/hooks';
import type { VariantRef } from '../../library/catalog';
import { addExercise, checkWeight, findPerformance } from '../../session/ops';
import { ExerciseBrowser } from '../library/ExerciseBrowser';
import { NEUTRAL_FRAMES } from '../groupColors';

/**
 * Choix d'un exercice pour la séance en cours (§5.2), avec la recherche de la bibliothèque (§4.1).
 * `variantId` (route `#/ajouter/<id>`) ajoute directement cet exercice, poids de départ demandé si besoin.
 */
export function ExercisePicker({ variantId }: { variantId?: string }) {
  const { active, variants, ctxFor, commit } = useApp();
  const [query, setQuery] = useState('');
  const [startFor, setStartFor] = useState<string | null>(null);
  const [startWeight, setStartWeight] = useState('');
  const [startError, setStartError] = useState(false);
  const handled = useRef<string | null>(null);

  async function pick(ref: VariantRef, startKg?: number) {
    if (!active) return;
    const id = ref.variant.id;
    if (findPerformance(active, id)) {
      navigate('seance', id);
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
    navigate('seance', id);
    await commit(session);
  }

  // Exercice désigné par la route : ajouté une seule fois.
  const direct = variantId ? variants.get(variantId) : undefined;
  useEffect(() => {
    if (!direct || handled.current === direct.variant.id) return;
    handled.current = direct.variant.id;
    void pick(direct);
  }, [direct]);

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
    <main className="screen picker" {...NEUTRAL_FRAMES}>
      <header className="picker-header">
        <a href="#/seance" className="back" aria-label="Retour à la séance">
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
          note={(ref) => (findPerformance(active, ref.variant.id) ? 'dans la séance' : null)}
          createHref={(q) => `#/nouvel-exercice/${encodeURIComponent(q)}/seance`}
        />
      )}
    </main>
  );
}
