import { Fragment, useMemo, useState, type ReactNode } from 'react';
import type { Exercise, MuscleGroup } from '../../domain/types';
import { useApp } from '../../app/store';
import { displayName, groupGrips, variantLabel, type VariantRef } from '../../library/catalog';
import { buildSearchIndex, recentVariantIds, searchWithInfo, type MatchField } from '../../library/search';
import { gripOf } from '../../library/text';
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

/** Exercice-variante d'une liste, avec le champ qui l'a fait trouver. */
interface Listed {
  ref: VariantRef;
  via?: MatchField;
}

/** Filtre par groupe gardé le temps de l'ouverture de l'appli (retour depuis une fiche). */
const memory: { group: MuscleGroup | null } = { group: null };

/**
 * Liste des exercices : résultats de recherche, ou puces de filtre par groupe, récents, favoris et bibliothèque par
 * groupe (§4.2). Les prises d'un même exercice sont regroupées en une entrée.
 */
export function ExerciseBrowser({ query, onPick, below, aside, note, createHref }: Props) {
  const { exercises, sessions, variants } = useApp();
  const index = useMemo(() => buildSearchIndex(exercises), [exercises]);
  const { results, ignored } = useMemo(() => searchWithInfo(index, query), [index, query]);
  const [chosen, setChosen] = useState<MuscleGroup | null>(memory.group);
  const trimmed = query.trim();
  const shared = { onPick, below, aside, note };

  const list = (items: Listed[], label?: string) => (
    <ul className="pick-list" aria-label={label}>
      {groupGrips(items).map((e) =>
        e.kind === 'single' ? (
          <ExerciseItem key={e.item.ref.variant.id} ref_={e.item.ref} via={e.item.via} {...shared} />
        ) : (
          <GripItem key={`grips-${e.exercise.id}`} exercise={e.exercise} items={e.items} {...shared} />
        ),
      )}
    </ul>
  );

  if (trimmed) {
    return results.length > 0 ? (
      <>
        {ignored.length > 0 && (
          <p className="muted small ignored-words" data-testid="ignored-words">
            Mot{ignored.length > 1 ? 's' : ''} non reconnu{ignored.length > 1 ? 's' : ''}, ignoré{ignored.length > 1 ? 's' : ''} : {ignored.join(', ')}
          </p>
        )}
        {list(results.map((r) => ({ ref: { exercise: r.entry.exercise, variant: r.entry.variant }, via: r.via })), 'Résultats')}
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
  const groups = GROUP_ORDER.filter((g) => visible.some((r) => r.exercise.primaryGroup === g));
  const group = chosen && groups.includes(chosen) ? chosen : null;
  const choose = (g: MuscleGroup | null) => {
    memory.group = g;
    setChosen(g);
  };
  const inGroup = (r: VariantRef) => !group || r.exercise.primaryGroup === group;
  const favorites = visible.filter((r) => r.variant.favorite && inGroup(r));
  const recent = recentVariantIds(sessions)
    .map((id) => variants.get(id))
    .filter((r): r is VariantRef => !!r && !r.exercise.archived && !r.variant.archived && inGroup(r));

  return (
    <>
      <div className="chip-row group-filters" role="group" aria-label="Filtrer par groupe musculaire">
        <button type="button" className="chip" aria-pressed={!group} onClick={() => choose(null)}>
          Tous
        </button>
        {groups.map((g) => (
          <button key={g} type="button" className="chip" aria-pressed={group === g} onClick={() => choose(group === g ? null : g)}>
            {MUSCLE_GROUP_LABELS[g]}
          </button>
        ))}
      </div>
      {recent.length > 0 && (
        <section>
          <h2 className="section-title">Récents</h2>
          {list(recent.map((ref) => ({ ref })))}
        </section>
      )}
      {favorites.length > 0 && (
        <section>
          <h2 className="section-title">Favoris</h2>
          {list(favorites.map((ref) => ({ ref })))}
        </section>
      )}
      {(group ? [group] : groups).map((g) => {
        const items = visible
          .filter((r) => r.exercise.primaryGroup === g)
          .sort((a, b) => displayName(a).localeCompare(displayName(b), 'fr'));
        return (
          <section key={g}>
            <h2 className="section-title">{MUSCLE_GROUP_LABELS[g]}</h2>
            {list(items.map((ref) => ({ ref })))}
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

const secondaryOf = (exercise: Exercise, via?: MatchField) =>
  via === 'secondary' ? exercise.secondaryGroups.map((g) => MUSCLE_GROUP_LABELS[g]).join(', ') : null;

/** Un exercice-variante : pictogramme, nom, variante, groupe principal, dernier poids et statut. */
function ExerciseItem({ ref_: ref, via, onPick, below, aside, note }: ItemProps) {
  const { replay } = useApp();
  const state = replay.profile.variants[ref.variant.id];
  const extra = note?.(ref);
  const secondary = secondaryOf(ref.exercise, via);
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

/** Nom court d'une prise, dans sa puce : « Très large », « Moyenne », « Serrée ». */
function gripLabel(ref: VariantRef): string {
  const grip = (gripOf(ref.variant.name) ?? ref.variant.name).replace(/^Prise /, '');
  return grip.charAt(0).toUpperCase() + grip.slice(1);
}

/**
 * Prises d'un même exercice, en une seule entrée (§4.3.1) : nom et groupe une fois, puis une puce par prise (dernier
 * poids et statut de la variante). Un appui sur une puce agit sur cette variante (fiche, ou ajout à la séance).
 */
function GripItem({ exercise, items, onPick, below, note }: { exercise: Exercise; items: Listed[] } & Omit<ItemProps, 'ref_' | 'via'>) {
  const { replay } = useApp();
  const secondary = secondaryOf(exercise, items.find((i) => i.via === 'secondary')?.via);
  return (
    <li className="pick-item grip-item" data-exercise={exercise.id} {...groupColorProps(exercise.primaryGroup)}>
      <div className="grip-head">
        <ExercisePicto exercise={exercise} variantId={exercise.id} />
        <span className="pick-name">
          <strong>{exercise.name}</strong>
          <span className="muted small">
            {MUSCLE_GROUP_LABELS[exercise.primaryGroup]}
            {secondary && ` · secondaire : ${secondary}`}
          </span>
        </span>
      </div>
      <div className="grip-chips" role="group" aria-label={`Prises : ${exercise.name}`}>
        {items.map(({ ref }) => {
          const state = replay.profile.variants[ref.variant.id];
          const extra = note?.(ref);
          return (
            <button
              key={ref.variant.id}
              type="button"
              className="chip grip-chip"
              data-variant={ref.variant.id}
              aria-label={`${exercise.name} ${ref.variant.name}${extra ? `, ${extra}` : ''}`}
              onClick={() => onPick(ref)}
            >
              <span>{gripLabel(ref)}</span>
              {state && <span className="muted">{formatKg(state.palier.weightKg)}</span>}
              <StatusBadge status={state?.lastStatus} />
              {extra && <span aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </div>
      {items.map(({ ref }) => {
        const content = below?.(ref);
        return content ? <Fragment key={ref.variant.id}>{content}</Fragment> : null;
      })}
    </li>
  );
}
