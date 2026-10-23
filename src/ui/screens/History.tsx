import { useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import { navigateBack } from '../../app/hooks';
import type { Session } from '../../domain/types';
import { searchSessions } from '../../history/ops';
import { formatDurationLong, formatIsoDay } from '../../session/format';
import { cardioMinutes, formatMinutes } from '../../cardio/model';
import { activityLabel, activityMinutes, activityStart, doneActivities, formatClock, type ActivityRecord } from '../../activities/model';
import { sessionStartTime } from '../../analysis/weekly';
import { MUSCLE_GROUP_LABELS } from '../../library/seed';
import { normalizeName } from '../../library/text';
import { SessionDetail } from './SessionDetail';

/** « 2 ex. · 20 min cardio », « 15 min cardio », « 3 ex. ». */
function contentSummary(s: Session): string {
  const minutes = cardioMinutes(s);
  const parts = s.performances.length > 0 || minutes === 0 ? [`${s.performances.length} ex.`] : [];
  if (minutes > 0) parts.push(`${formatMinutes(minutes)} cardio`);
  return parts.join(' · ');
}

type Entry = { kind: 'session'; time: number; date: string; session: Session } | { kind: 'activity'; time: number; date: string; activity: ActivityRecord };

const MONTH_FORMAT = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const WEEKDAY_FORMAT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });

const dayOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

/** Intertitre d'un mois : « Octobre 2026 ». */
function monthTitle(date: string): string {
  const text = MONTH_FORMAT.format(dayOf(date));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Historique chronologique des séances et des activités habituelles confirmées, avec recherche par nom (§10) :
 * regroupé par mois, une ligne compacte par séance ou activité. Suppression dans le détail seulement.
 */
export function History() {
  const { sessions, activities } = useApp();
  const [query, setQuery] = useState('');
  const done = useMemo(() => doneActivities(activities), [activities]);
  const months = useMemo(() => {
    const words = normalizeName(query).split(' ').filter(Boolean);
    const entries: Entry[] = [
      ...searchSessions(sessions, query).map((session) => ({ kind: 'session' as const, time: sessionStartTime(session), date: session.date, session })),
      ...done
        .filter((a) => words.every((w) => normalizeName(a.name).includes(w)))
        .map((activity) => ({ kind: 'activity' as const, time: activityStart(activity), date: activity.date, activity })),
    ];
    // Du plus récent au plus ancien ; l'ordre des séances entre elles reste celui de la recherche.
    const sorted = entries.map((e, i) => ({ e, i })).sort((a, b) => b.e.time - a.e.time || a.i - b.i).map(({ e }) => e);
    const out: { key: string; entries: Entry[] }[] = [];
    for (const e of sorted) {
      const key = e.date.slice(0, 7);
      if (out.at(-1)?.key === key) out.at(-1)!.entries.push(e);
      else out.push({ key, entries: [e] });
    }
    return out;
  }, [sessions, done, query]);
  const total = sessions.filter((s) => s.state === 'done').length + done.length;

  return (
    <main className="screen tab-screen history-screen">
      <header className="picker-header">
        <input
          type="search"
          className="search"
          placeholder="Rechercher une séance par son nom"
          aria-label="Rechercher une séance"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>

      {total === 0 ? (
        <p className="empty muted">Aucune séance terminée pour l’instant.</p>
      ) : months.length === 0 ? (
        <p className="empty muted">Aucune séance ne porte ce nom.</p>
      ) : (
        months.map(({ key, entries }) => (
          <section key={key} className="history-month" aria-labelledby={`month-${key}`}>
            <h2 id={`month-${key}`} className="section-title">
              {monthTitle(`${key}-01`)}
            </h2>
            <ul className="frame history-list" aria-label={`Séances : ${monthTitle(`${key}-01`)}`}>
              {entries.map((entry) =>
                entry.kind === 'activity' ? (
                  <HistoryRow
                    key={entry.activity.id}
                    className="activity-link"
                    href={`#/historique/${encodeURIComponent(entry.activity.id)}`}
                    date={entry.date}
                    title={activityLabel(entry.activity)}
                    meta="activité"
                  />
                ) : (
                  <HistoryRow
                    key={entry.session.id}
                    className="session-link"
                    href={`#/historique/${encodeURIComponent(entry.session.id)}`}
                    date={entry.date}
                    title={entry.session.name}
                    meta={`${contentSummary(entry.session)}${entry.session.origin === 'import' ? ' · importée' : ''}`}
                  />
                ),
              )}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}

/** Ligne compacte : jour à gauche, titre sur une ligne au plus, contenu dessous. */
function HistoryRow({ className, href, date, title, meta }: { className: string; href: string; date: string; title: string; meta: string }) {
  const day = dayOf(date);
  return (
    <li className="history-row">
      <a className={`history-line ${className}`} href={href}>
        <span className="history-day" aria-hidden="true">
          <span className="small muted">{WEEKDAY_FORMAT.format(day)}</span>
          <strong>{day.getDate()}</strong>
        </span>
        <span className="visually-hidden">{formatIsoDay(date)} : </span>
        <span className="history-text">
          <strong className="history-title">{title}</strong>
          <span className="muted small">{meta}</span>
        </span>
        <span className="history-chevron" aria-hidden="true">
          ›
        </span>
      </a>
    </li>
  );
}

/** Détail d'une entrée de l'historique (`#/historique/<id>`) : séance passée ou activité habituelle. */
export function HistoryDetail({ id }: { id: string }) {
  const { activities } = useApp();
  const activity = activities.find((a) => a.id === id);
  if (!activity) return <SessionDetail sessionId={id} />;
  if (activity.status === 'done') return <ActivityDetail activity={activity} />;
  return (
    <main className="screen">
      <p className="empty">Activité supprimée.</p>
      <a className="btn primary big" href="#/historique">
        Historique
      </a>
    </main>
  );
}

/** Détail d'une activité habituelle confirmée (§19.8) : nom, date, heures, groupes ; suppression après confirmation. */
export function ActivityDetail({ activity: a }: { activity: ActivityRecord }) {
  const { removeActivity } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);

  async function remove() {
    if (await removeActivity(a.id)) navigateBack('historique');
    else {
      setFailed(true);
      setConfirming(false);
    }
  }

  return (
    <main className="screen session-detail activity-detail">
      <header className="simple-header">
        <a href="#/historique" className="back" aria-label="Historique">
          ‹
        </a>
        <h1>{activityLabel(a)}</h1>
      </header>
      <p className="muted">
        {a.oneOff
          ? `${formatIsoDay(a.date)} · ${formatDurationLong(activityMinutes(a) * 60_000)} · activité ponctuelle`
          : `${formatIsoDay(a.date)} · ${formatClock(a.start)} – ${formatClock(a.end)} · activité habituelle`}
      </p>
      {a.groups.length > 0 && <p>Groupes sollicités (en indirect) : {a.groups.map((g) => MUSCLE_GROUP_LABELS[g]).join(', ')}</p>}
      {failed && (
        <p className="field-error" role="alert">
          Suppression impossible : réessayez.
        </p>
      )}
      <div className="sheet-actions">
        {confirming ? (
          <div className="confirm-box" role="group" aria-label="Supprimer l’activité">
            <p>Supprimer cette activité ? La question ne sera plus posée pour ce jour.</p>
            <div className="row">
              <button type="button" className="btn danger" onClick={() => void remove()}>
                Confirmer la suppression
              </button>
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="link danger" onClick={() => setConfirming(true)}>
            Supprimer l’activité
          </button>
        )}
      </div>
    </main>
  );
}
