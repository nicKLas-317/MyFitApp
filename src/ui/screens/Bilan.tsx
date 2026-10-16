import { useMemo } from 'react';
import { useApp } from '../../app/store';
import { analyzeProgress, recentChanges, type ProgressCategory } from '../../analysis/progress';
import { displayName } from '../../library/catalog';
import { formatIsoDay, formatKg } from '../../session/format';

const SECTIONS: { category: ProgressCategory; title: string; icon: string; hint: string }[] = [
  { category: 'progressing', title: 'En progression', icon: '↗', hint: 'Au moins un palier validé sur les 6 dernières séances.' },
  { category: 'stable', title: 'Stables', icon: '→', hint: 'Aucun palier validé sur les 6 dernières séances, sans rouges répétées.' },
  { category: 'difficulty', title: 'En difficulté', icon: '↘', hint: 'Au moins 2 séances rouges consécutives en cours.' },
  { category: 'new', title: 'Trop tôt pour conclure', icon: '…', hint: 'Une seule séance sur cet exercice.' },
];

const count = (n: number) => `${n} exercice${n > 1 ? 's' : ''}`;

/**
 * Bilan synthétique facultatif (§19.3) : classement factuel, sans score inventé. Catégories bien distinctes
 * (pictogramme, style, nombre d'exercices), sans les couleurs des statuts ; un exercice ouvre sa fiche sur son graphique.
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

  return (
    <main className="screen bilan">
      <header className="simple-header">
        <a href="#/" className="back" aria-label="Accueil">
          ‹
        </a>
        <h1>Bilan de progression</h1>
      </header>
      {progress.length === 0 ? (
        <p className="empty muted">Pas encore de séance évaluée.</p>
      ) : (
        <ul className="bilan-summary" aria-label="Résumé du bilan">
          {byCategory.map(({ category, title, icon, list }) => (
            <li key={category} className={`bilan-chip bilan-${category}`} data-category={category}>
              <span className="bilan-icon" aria-hidden="true">
                {icon}
              </span>
              <span>
                {title} <strong data-testid={`count-${category}`}>{list.length}</strong>
              </span>
            </li>
          ))}
        </ul>
      )}
      {byCategory.map(({ category, title, icon, hint, list }) => {
        if (list.length === 0) return null;
        return (
          <section key={category} aria-label={title} data-category={category} className={`bilan-section bilan-${category}`}>
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
                  <a className="bilan-item" href={`#/exercice/${encodeURIComponent(p.variantId)}/evolution`}>
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
      {changes.length > 0 && (
        <section aria-label="Dernières évolutions">
          <h2 className="section-title">Dernières évolutions</h2>
          <ul className="plain-list">
            {changes.map((c) => (
              <li key={`${c.sessionId}-${c.variantId}`}>
                <span className="muted small">{formatIsoDay(c.date)} · </span>
                {name(c.variantId)} :{' '}
                <span className="small">
                  {formatKg(c.from.weightKg)}, cible {c.from.targetReps} → {formatKg(c.to.weightKg)}, cible {c.to.targetReps}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
