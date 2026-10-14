import { useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import { navigate } from '../../app/hooks';
import { displayName, type VariantRef } from '../../library/catalog';
import { MUSCLE_GROUP_LABELS } from '../../library/seed';
import { formatKg } from '../../session/format';
import { addExercise, checkWeight, findPerformance } from '../../session/ops';
import { StatusBadge } from '../StatusBadge';

const normalize = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/**
 * Choix d'un exercice pour la séance en cours. Filtre simple sur le nom, les synonymes et le groupe :
 * la recherche structurée complète arrive avec la bibliothèque (phase 4).
 */
export function ExercisePicker() {
  const { active, variants, replay, sessions, ctxFor, commit } = useApp();
  const [query, setQuery] = useState('');
  const [startFor, setStartFor] = useState<string | null>(null);
  const [startWeight, setStartWeight] = useState('');
  const [startError, setStartError] = useState(false);

  const refs = useMemo(
    () => [...variants.values()].filter((r) => !r.exercise.archived && !r.variant.archived),
    [variants],
  );

  // Exercices récents : ordre de dernière utilisation dans les séances terminées.
  const recentIds = useMemo(() => {
    const ids: string[] = [];
    const done = sessions.filter((s) => s.state === 'done').sort((a, b) => (b.startedAt ?? b.createdAt) - (a.startedAt ?? a.createdAt));
    for (const s of done) for (const p of s.performances) if (!ids.includes(p.variantId)) ids.push(p.variantId);
    return ids.slice(0, 6);
  }, [sessions]);

  const results = useMemo(() => {
    const q = normalize(query);
    if (!q) return refs;
    return refs.filter((r) =>
      [r.exercise.name, r.variant.name, ...r.exercise.synonyms, ...r.variant.synonyms, MUSCLE_GROUP_LABELS[r.exercise.primaryGroup]]
        .some((text) => normalize(text).includes(q)),
    );
  }, [query, refs]);

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

  function submitStart(ref: VariantRef) {
    const check = checkWeight(startWeight, undefined);
    if (check.kind === 'invalid') {
      setStartError(true);
      return;
    }
    void pick(ref, check.value);
  }

  const recent = query ? [] : recentIds.map((id) => variants.get(id)).filter((r): r is VariantRef => !!r);
  const list = query ? results : results.filter((r) => !recentIds.includes(r.variant.id));

  const renderItem = (ref: VariantRef) => {
    const id = ref.variant.id;
    const state = replay.profile.variants[id];
    const inSession = !!findPerformance(active, id);
    return (
      <li key={id} className="pick-item">
        <button type="button" className="pick-button" onClick={() => void pick(ref)}>
          <span className="pick-name">
            <strong>{displayName(ref)}</strong>
            <span className="muted small">
              {MUSCLE_GROUP_LABELS[ref.exercise.primaryGroup]}
              {inSession && ' · dans la séance'}
            </span>
          </span>
          <span className="pick-meta">
            {state && <span className="small">{formatKg(state.palier.weightKg)}</span>}
            <StatusBadge status={state?.lastStatus} />
          </span>
        </button>
        {startFor === id && (
          <form
            className="start-weight"
            onSubmit={(e) => {
              e.preventDefault();
              submitStart(ref);
            }}
          >
            <label htmlFor={`start-${id}`}>Poids de départ (kg)</label>
            <div className="row">
              <input
                id={`start-${id}`}
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
        )}
      </li>
    );
  };

  return (
    <main className="screen picker">
      <header className="picker-header">
        <a href="#/seance" className="back" aria-label="Retour à la séance">
          ‹
        </a>
        <input
          type="search"
          className="search"
          placeholder="Exercice, machine ou muscle"
          aria-label="Rechercher un exercice"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>
      {recent.length > 0 && (
        <section>
          <h2 className="section-title">Récents</h2>
          <ul className="pick-list">{recent.map(renderItem)}</ul>
        </section>
      )}
      <section>
        {!query && recent.length > 0 && <h2 className="section-title">Tous les exercices</h2>}
        {list.length > 0 ? <ul className="pick-list">{list.map(renderItem)}</ul> : <p className="empty muted">Aucun exercice trouvé.</p>}
      </section>
    </main>
  );
}
