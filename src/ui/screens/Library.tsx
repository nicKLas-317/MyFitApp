import { useState } from 'react';
import { useApp } from '../../app/store';
import { navigate } from '../../app/hooks';
import { displayName } from '../../library/catalog';
import { findPerformance } from '../../session/ops';
import { ExerciseBrowser } from '../library/ExerciseBrowser';

/** Bibliothèque d'exercices (§4) : recherche unique, fiches, création et exercices archivés. */
export function Library() {
  const { active, exercises } = useApp();
  const [query, setQuery] = useState('');
  const archived = exercises
    .flatMap((exercise) => exercise.variants.map((variant) => ({ exercise, variant })))
    .filter((r) => r.exercise.archived || r.variant.archived)
    .sort((a, b) => displayName(a).localeCompare(displayName(b), 'fr'));

  return (
    <main className="screen picker library">
      <header className="picker-header">
        <a href="#/" className="back" aria-label="Accueil">
          ‹
        </a>
        <input
          type="search"
          className="search"
          placeholder="Exercice, machine ou muscle"
          aria-label="Rechercher un exercice"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>

      {!query.trim() && (
        <a className="btn big new-exercise" href="#/nouvel-exercice">
          + Nouvel exercice
        </a>
      )}

      <ExerciseBrowser
        query={query}
        onPick={(ref) => navigate('exercice', ref.variant.id)}
        note={(ref) => (active && findPerformance(active, ref.variant.id) ? 'dans la séance' : null)}
        aside={(ref) =>
          active && !findPerformance(active, ref.variant.id) ? (
            <button
              type="button"
              className="btn add-to-session"
              aria-label={`Ajouter ${displayName(ref)} à la séance`}
              onClick={() => navigate('ajouter', ref.variant.id)}
            >
              +
            </button>
          ) : null
        }
        createHref={(q) => `#/nouvel-exercice/${encodeURIComponent(q)}`}
      />

      {!query.trim() && archived.length > 0 && (
        <details className="archived">
          <summary>Archivés ({archived.length})</summary>
          <ul className="plain-list">
            {archived.map((r) => (
              <li key={r.variant.id}>
                <a href={`#/exercice/${encodeURIComponent(r.variant.id)}`}>{displayName(r)}</a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
