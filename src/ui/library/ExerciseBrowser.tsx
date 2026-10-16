import { useMemo, type ReactNode } from 'react';
import type { MuscleGroup } from '../../domain/types';
import { useApp } from '../../app/store';
import { displayName, variantLabel, type VariantRef } from '../../library/catalog';
import { buildSearchIndex, recentVariantIds, searchWithInfo, type MatchField } from '../../library/search';
import { MUSCLE_GROUP_LABELS } from '../../library/seed';
import { formatKg } from '../../session/format';
import { groupColorProps } from '../groupColors';
import { ExercisePicto } from '../Pictogram';
import { StatusBadge } from '../StatusBadge';

const GROUP_ORDER = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[];

interface Props {
  query: string;
  /** Action principale sur un exercice (ouvrir la fiche, ou l'ajouter à la séance). */
  onPick(ref: VariantRef): void;
  /** Contenu affiché sous un exercice (ex. saisie du poids de départ). */
  below?(ref: VariantRef): ReactNode;
  /** Action secondaire à droite d'un exercice. */
  aside?(ref: VariantRef): ReactNode;
  /** Mention ajoutée au nom (ex. « dans la séance »). */
  note?(ref: VariantRef): string | null;
  /** Lien de création proposé quand rien ne correspond. */
  createHref(query: string): string;
}

/** Liste des exercices : résultats de recherche, ou favoris, récents et bibliothèque par groupe (§4.2). */
export function ExerciseBrowser({ query, onPick, below, aside, note, createHref }: Props) {
  const { exercises, sessions, variants } = useApp();
  const index = useMemo(() => buildSearchIndex(exercises), [exercises]);
  const { results, ignored } = useMemo(() => searchWithInfo(index, query), [index, query]);
  const trimmed = query.trim();

  const item = (ref: VariantRef, via?: MatchField) => (
    <ExerciseItem key={ref.variant.id} ref_={ref} via={via} onPick={onPick} below={below} aside={aside} note={note} />
  );

  if (trimmed) {
    return results.length > 0 ? (
      <>
        {ignored.length > 0 && (
          <p className="muted small ignored-words" data-testid="ignored-words">
            Mot{ignored.length > 1 ? 's' : ''} non reconnu{ignored.length > 1 ? 's' : ''}, ignoré{ignored.length > 1 ? 's' : ''} : {ignored.join(', ')}
          </p>
        )}
        <ul className="pick-list" aria-label="Résultats">
          {results.map((r) => item({ exercise: r.entry.exercise, variant: r.entry.variant }, r.via))}
        </ul>
      </>
    ) : (
      <div className="no-result">
        <p className="muted">Aucun exercice trouvé.</p>
        <a className="btn" href={createHref(trimmed)}>
          Créer l’exercice « {trimmed} »
        </a>
      </div>
    );
  }

  const visible = index.map((e) => ({ exercise: e.exercise, variant: e.variant }));
  const favorites = visible.filter((r) => r.variant.favorite);
  const recent = recentVariantIds(sessions)
    .map((id) => variants.get(id))
    .filter((r): r is VariantRef => !!r && !r.exercise.archived && !r.variant.archived);

  return (
    <>
      {favorites.length > 0 && (
        <section>
          <h2 className="section-title">Favoris</h2>
          <ul className="pick-list">{favorites.map((r) => item(r))}</ul>
        </section>
      )}
      {recent.length > 0 && (
        <section>
          <h2 className="section-title">Récents</h2>
          <ul className="pick-list">{recent.map((r) => item(r))}</ul>
        </section>
      )}
      {GROUP_ORDER.map((g) => {
        const list = visible
          .filter((r) => r.exercise.primaryGroup === g)
          .sort((a, b) => displayName(a).localeCompare(displayName(b), 'fr'));
        if (list.length === 0) return null;
        return (
          <section key={g}>
            <h2 className="section-title">{MUSCLE_GROUP_LABELS[g]}</h2>
            <ul className="pick-list">{list.map((r) => item(r))}</ul>
          </section>
        );
      })}
    </>
  );
}

interface ItemProps {
  ref_: VariantRef;
  via?: MatchField;
  onPick(ref: VariantRef): void;
  below?(ref: VariantRef): ReactNode;
  aside?(ref: VariantRef): ReactNode;
  note?(ref: VariantRef): string | null;
}

/** Un exercice-variante : pictogramme, nom, variante, groupe principal, dernier poids et statut. */
function ExerciseItem({ ref_: ref, via, onPick, below, aside, note }: ItemProps) {
  const { replay } = useApp();
  const state = replay.profile.variants[ref.variant.id];
  const extra = note?.(ref);
  const secondary = via === 'secondary' ? ref.exercise.secondaryGroups.map((g) => MUSCLE_GROUP_LABELS[g]).join(', ') : null;
  return (
    <li className="pick-item" data-variant={ref.variant.id} {...groupColorProps(ref.exercise.primaryGroup)}>
      <div className="pick-row">
        <button type="button" className="pick-button" onClick={() => onPick(ref)}>
          <ExercisePicto exercise={ref.exercise} variantId={ref.variant.id} />
          <span className="pick-name">
            <strong>{ref.exercise.name}</strong>
            <span className="muted small">
              {variantLabel(ref) && <span className="variant-tag">{variantLabel(ref)}</span>}
              {MUSCLE_GROUP_LABELS[ref.exercise.primaryGroup]}
              {secondary && ` · secondaire : ${secondary}`}
              {extra && ` · ${extra}`}
            </span>
          </span>
          <span className="pick-meta">
            {state && <span className="small">{formatKg(state.palier.weightKg)}</span>}
            <StatusBadge status={state?.lastStatus} />
          </span>
        </button>
        {aside?.(ref)}
      </div>
      {below?.(ref)}
    </li>
  );
}
