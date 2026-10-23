import { useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import type { Session } from '../../domain/types';
import { searchSessions } from '../../history/ops';
import { formatDurationLong, formatHour, formatIsoDay } from '../../session/format';
import { elapsedMs } from '../../session/ops';
import { cardioMinutes, formatMinutes } from '../../cardio/model';
import { activityLabel, activityStart, doneActivities, formatClock, type ActivityRecord } from '../../activities/model';
import { sessionStartTime } from '../../analysis/weekly';
import { normalizeName } from '../../library/text';

/** « 2 ex. · 20 min cardio », « 15 min cardio », « 3 ex. ». */
function contentSummary(s: Session): string {
  const minutes = cardioMinutes(s);
  const parts = s.performances.length > 0 || minutes === 0 ? [`${s.performances.length} ex.`] : [];
  if (minutes > 0) parts.push(`${formatMinutes(minutes)} cardio`);
  return parts.join(' · ');
}

type Entry = { kind: 'session'; time: number; session: Session } | { kind: 'activity'; time: number; activity: ActivityRecord };

/** Historique chronologique des séances et des activités habituelles confirmées, avec recherche par nom (§10). */
export function History() {
  const { sessions, activities } = useApp();
  const [query, setQuery] = useState('');
  const done = useMemo(() => doneActivities(activities), [activities]);
  const list = useMemo(() => {
    const words = normalizeName(query).split(' ').filter(Boolean);
    const entries: Entry[] = [
      ...searchSessions(sessions, query).map((session) => ({ kind: 'session' as const, time: sessionStartTime(session), session })),
      ...done
        .filter((a) => words.every((w) => normalizeName(a.name).includes(w)))
        .map((activity) => ({ kind: 'activity' as const, time: activityStart(activity), activity })),
    ];
    // Du plus récent au plus ancien ; l'ordre des séances entre elles reste celui de la recherche.
    return entries.map((e, i) => ({ e, i })).sort((a, b) => b.e.time - a.e.time || a.i - b.i).map(({ e }) => e);
  }, [sessions, done, query]);
  const total = sessions.filter((s) => s.state === 'done').length + done.length;

  return (
    <main className="screen history-screen">
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
          {list.map((entry) =>
            entry.kind === 'activity' ? (
              <ActivityItem key={entry.activity.id} activity={entry.activity} />
            ) : (
              <SessionItem key={entry.session.id} session={entry.session} />
            ),
          )}
        </ul>
      )}
    </main>
  );
}

function SessionItem({ session: s }: { session: Session }) {
  return (
    <li className="pick-item">
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
  );
}

/** Activité habituelle confirmée (« Badminton · 1 h 30 ») : pas une séance de salle ; supprimable après confirmation. */
function ActivityItem({ activity: a }: { activity: ActivityRecord }) {
  const { removeActivity } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const label = activityLabel(a);

  return (
    <li className="pick-item activity-item" aria-label={label}>
      <div className="pick-button">
        <span className="pick-name">
          <strong>{label}</strong>
          <span className="muted small">
            {formatIsoDay(a.date)} · {formatClock(a.start)} – {formatClock(a.end)}
          </span>
        </span>
        <span className="pick-meta small">
          <span className="tag">activité</span>
        </span>
      </div>
      <div className="row activity-actions">
        {confirming ? (
          <>
            <span className="small">Supprimer cette activité ?</span>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const ok = await removeActivity(a.id);
                setFailed(!ok);
                if (!ok) setConfirming(false);
              }}
            >
              Confirmer la suppression
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(false)}>
              Annuler
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirming(true)}>
            Supprimer
          </button>
        )}
      </div>
      {failed && (
        <p className="report-message small activity-actions" role="alert">
          Suppression impossible : réessayez.
        </p>
      )}
    </li>
  );
}
