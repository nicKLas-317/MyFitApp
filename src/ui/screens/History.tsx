import { useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import type { Session } from '../../domain/types';
import { searchSessions } from '../../history/ops';
import { formatDurationLong, formatHour, formatIsoDay } from '../../session/format';
import { elapsedMs } from '../../session/ops';
import { cardioMinutes, formatMinutes } from '../../cardio/model';
import { NEUTRAL_FRAMES } from '../groupColors';

/** « 2 ex. · 20 min cardio », « 15 min cardio », « 3 ex. ». */
function contentSummary(s: Session): string {
  const minutes = cardioMinutes(s);
  const parts = s.performances.length > 0 || minutes === 0 ? [`${s.performances.length} ex.`] : [];
  if (minutes > 0) parts.push(`${formatMinutes(minutes)} cardio`);
  return parts.join(' · ');
}

/** Historique chronologique des séances, avec recherche par nom (§10). */
export function History() {
  const { sessions } = useApp();
  const [query, setQuery] = useState('');
  const list = useMemo(() => searchSessions(sessions, query), [sessions, query]);
  const total = sessions.filter((s) => s.state === 'done').length;

  return (
    <main className="screen history-screen" {...NEUTRAL_FRAMES}>
      <header className="picker-header">
        <a href="#/" className="back" aria-label="Accueil">
          ‹
        </a>
        <input
          type="search"
          className="search"
          placeholder="Rechercher une séance par son nom"
          aria-label="Rechercher une séance"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>
      <div className="row history-links">
        <a className="btn" href="#/bilan">
          Bilan de progression
        </a>
      </div>

      {total === 0 ? (
        <p className="empty muted">Aucune séance terminée pour l’instant.</p>
      ) : list.length === 0 ? (
        <p className="empty muted">Aucune séance ne porte ce nom.</p>
      ) : (
        <ul className="pick-list" aria-label="Séances">
          {list.map((s) => (
            <li key={s.id} className="pick-item">
              <a className="pick-button session-link" href={`#/historique/${encodeURIComponent(s.id)}`}>
                <span className="pick-name">
                  <strong>{s.name}</strong>
                  <span className="muted small">
                    {formatIsoDay(s.date)}
                    {s.startedAt !== null && ` · ${formatHour(s.startedAt)}`}
                    {s.startedAt !== null && s.endedAt !== null && ` – ${formatHour(s.endedAt)} · ${formatDurationLong(elapsedMs(s, s.endedAt))}`}
                  </span>
                </span>
                <span className="pick-meta small">
                  {contentSummary(s)}
                  {s.origin === 'import' && <span className="tag">importée</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
