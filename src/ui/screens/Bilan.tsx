import { useMemo } from 'react';
import { useApp } from '../../app/store';
import { analyzeProgress, recentChanges, type ProgressCategory } from '../../analysis/progress';
import { displayName } from '../../library/catalog';
import { formatIsoDay, formatKg } from '../../session/format';

const SECTIONS: { category: ProgressCategory; title: string; hint: string }[] = [
  { category: 'progressing', title: 'En progression', hint: 'Au moins un palier validé sur les 6 dernières séances.' },
  { category: 'stable', title: 'Stables', hint: 'Aucun palier validé sur les 6 dernières séances, sans rouges répétées.' },
  { category: 'difficulty', title: 'En difficulté', hint: 'Au moins 2 séances rouges consécutives en cours.' },
  { category: 'new', title: 'Trop tôt pour conclure', hint: 'Une seule séance enregistrée.' },
];

/** Bilan synthétique facultatif (§19.3) : classement factuel, sans score inventé. */
export function Bilan() {
  const { replay, sessions, variants } = useApp();
  const progress = useMemo(() => analyzeProgress(replay.evaluations, replay.profile), [replay]);
  const changes = useMemo(() => recentChanges(replay.evaluations, sessions), [replay, sessions]);
  const name = (id: string) => displayName(variants.get(id));

  return (
    <main className="screen bilan">
      <header className="simple-header">
        <a href="#/historique" className="back" aria-label="Historique">
          ‹
        </a>
        <h1>Bilan</h1>
      </header>
      {progress.length === 0 && <p className="empty muted">Pas encore de séance évaluée.</p>}
      {SECTIONS.map(({ category, title, hint }) => {
        const list = progress.filter((p) => p.category === category).sort((a, b) => name(a.variantId).localeCompare(name(b.variantId), 'fr'));
        if (list.length === 0) return null;
        return (
          <section key={category} aria-label={title} data-category={category}>
            <h2 className="section-title">{title}</h2>
            <p className="muted small">{hint}</p>
            <ul className="plain-list">
              {list.map((p) => (
                <li key={p.variantId}>
                  <a href={`#/exercice/${encodeURIComponent(p.variantId)}`}>{name(p.variantId)}</a>
                  <span className="muted small">
                    {' '}
                    · {p.sessions} séance{p.sessions > 1 ? 's' : ''}
                    {p.validated > 0 && ` · ${p.validated} palier${p.validated > 1 ? 's' : ''} validé${p.validated > 1 ? 's' : ''}`}
                    {p.redStreak >= 2 && ` · ${p.redStreak} rouges de suite`}
                  </span>
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
