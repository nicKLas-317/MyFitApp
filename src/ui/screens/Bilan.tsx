import { useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import { analyzeProgress, recentChanges, type ProgressCategory } from '../../analysis/progress';
import { changeText } from '../labels';
import { displayName } from '../../library/catalog';
import { formatIsoDay, formatNumericDay } from '../../session/format';
import { exerciseColorProps } from '../groupColors';

const SECTIONS: { category: ProgressCategory; title: string; icon: string; hint: string }[] = [
  { category: 'progressing', title: 'En progression', icon: '↗', hint: 'Au moins un palier validé sur les 6 dernières séances.' },
  { category: 'stable', title: 'Stables', icon: '→', hint: 'Aucun palier validé sur les 6 dernières séances, sans rouges répétées.' },
  { category: 'difficulty', title: 'En difficulté', icon: '↘', hint: 'Au moins 2 séances rouges consécutives en cours.' },
  { category: 'new', title: 'Trop tôt', icon: '…', hint: 'Une seule séance sur cet exercice.' },
];

const count = (n: number) => `${n} exercice${n > 1 ? 's' : ''}`;

export type BilanFilter = ProgressCategory | 'all';
const FILTER_KEY = 'myfitapp.bilan.filtre';

/** Dernier filtre choisi, mémorisé sur cet appareil ; absent ou illisible : toutes les catégories. */
function readFilter(): BilanFilter {
  try {
    const v = localStorage.getItem(FILTER_KEY);
    return v && SECTIONS.some((x) => x.category === v) ? (v as ProgressCategory) : 'all';
  } catch {
    return 'all';
  }
}

function saveFilter(filter: BilanFilter): void {
  try {
    localStorage.setItem(FILTER_KEY, filter);
  } catch {
    // Préférence d'affichage seulement : sans stockage, le bilan s'ouvre sur toutes les catégories.
  }
}

/**
 * Bilan synthétique facultatif (§19.3) : classement factuel, sans score inventé. Catégories bien distinctes
 * (pictogramme, titre, nombre d'exercices), en cadres neutres ; chaque exercice à la couleur de son groupe (§3.2) ; un exercice ouvre sa fiche sur son graphique.
 */
export function Bilan() {
  const { replay, sessions, variants } = useApp();
  const progress = useMemo(() => analyzeProgress(replay.evaluations, replay.profile), [replay]);
  const changes = useMemo(() => recentChanges(replay.evaluations, sessions), [replay, sessions]);
  const name = (id: string) => displayName(variants.get(id));
  const byCategory = SECTIONS.map((section) => ({
    ...section,
    list: progress.filter((p) => p.category === section.category).sort((a, b) => name(a.variantId).localeCompare(name(b.variantId), 'fr')),
  }));
  const [chosen, setChosen] = useState<BilanFilter>(readFilter);
  // Une catégorie mémorisée devenue vide : toutes les catégories.
  const filter: BilanFilter = chosen !== 'all' && byCategory.some((c) => c.category === chosen && c.list.length > 0) ? chosen : 'all';
  const choose = (next: BilanFilter) => {
    setChosen(next);
    saveFilter(next);
  };

  return (
    <main className="screen bilan">
      <header className="simple-header">
        <a href="#/progres" className="back" aria-label="Progrès">
          ‹
        </a>
        <h1>Bilan de progression</h1>
      </header>
      <a className="btn big report-link" href="#/bilan-periode">
        Bilan de la semaine / du mois
      </a>
      <a className="btn big report-link" href="#/bilan-groupes">
        Par groupe musculaire
      </a>
      {progress.length === 0 ? (
        <p className="empty muted">Pas encore de séance évaluée.</p>
      ) : (
        <div className="chip-row bilan-filters" role="group" aria-label="Filtrer par catégorie">
          <button type="button" className="btn bilan-filter bilan-all" aria-pressed={filter === 'all'} onClick={() => choose('all')}>
            <span className="bilan-filter-label">Tous</span>
            <strong>{progress.length}</strong>
          </button>
          {byCategory.map(({ category, title, icon, list }) => (
            <button
              key={category}
              type="button"
              className={`btn bilan-filter bilan-${category}`}
              data-category={category}
              aria-pressed={filter === category}
              disabled={list.length === 0}
              // Un nouvel appui sur le filtre actif réaffiche toutes les catégories.
              onClick={() => choose(filter === category ? 'all' : category)}
            >
              <span className="bilan-icon" aria-hidden="true">
                {icon}
              </span>
              <span className="bilan-filter-label">{title}</span>
              <strong data-testid={`count-${category}`}>{list.length}</strong>
            </button>
          ))}
        </div>
      )}
      {byCategory.map(({ category, title, icon, hint, list }) => {
        if (list.length === 0 || (filter !== 'all' && filter !== category)) return null;
        return (
          <section key={category} aria-label={title} data-category={category} className={`frame bilan-section bilan-${category}`}>
            <h2 className="bilan-title">
              <span className="bilan-icon" aria-hidden="true">
                {icon}
              </span>
              <span className="bilan-name">{title}</span>
              <span className="bilan-count">{count(list.length)}</span>
            </h2>
            <p className="muted small">{hint}</p>
            <ul className="bilan-list">
              {list.map((p) => (
                <li key={p.variantId}>
                  <a className="bilan-item" href={`#/exercice/${encodeURIComponent(p.variantId)}/evolution`} {...exerciseColorProps(variants.get(p.variantId)?.exercise)}>
                    <span className="bilan-item-text">
                      <strong>{name(p.variantId)}</strong>
                      <span className="muted small">
                        {p.sessions} séance{p.sessions > 1 ? 's' : ''}
                        {p.validated > 0 && ` · ${p.validated} palier${p.validated > 1 ? 's' : ''} validé${p.validated > 1 ? 's' : ''}`}
                        {p.redStreak >= 2 && ` · ${p.redStreak} rouges de suite`}
                      </span>
                    </span>
                    <span className="bilan-chevron" aria-hidden="true">
                      ›
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {filter === 'all' && changes.length > 0 && (
        <section aria-label="Dernières évolutions" className="frame">
          <h2 className="section-title">Dernières évolutions</h2>
          <ul className="change-list">
            {changes.map((c) => (
              <li key={`${c.sessionId}-${c.variantId}`} className="change-line">
                <span className="muted small">
                  <span aria-hidden="true">{formatNumericDay(c.date)}</span>
                  <span className="visually-hidden">{formatIsoDay(c.date)} : </span>
                </span>
                <span className="change-name">{name(c.variantId)}</span>
                <span className="small change-what">{changeText(c)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
