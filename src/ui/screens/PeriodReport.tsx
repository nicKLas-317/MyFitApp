import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import { navigate } from '../../app/hooks';
import { useBody } from '../../body/store';
import {
  buildReport,
  defaultPeriod,
  firstPeriod,
  inProgressNote,
  lineText,
  mailSubject,
  parsePeriodKey,
  periodKey,
  periodTitle,
  reportSections,
  reportText,
  shiftPeriod,
  type ReportKind,
} from '../../analysis/report';
import { displayName } from '../../library/catalog';
import { copyText, openMailto, sendByMail } from '../share';

const KIND_SEGMENTS: Record<ReportKind, string> = { week: 'semaine', month: 'mois' };
const TABS: { kind: ReportKind; label: string }[] = [
  { kind: 'week', label: 'Semaine' },
  { kind: 'month', label: 'Mois' },
];

/** À l'écran seulement : un nombre n'est jamais séparé de son unité en fin de ligne (« 30 min », « 12 kg », « 21 oct. »). */
function keepUnits(line: string): string {
  return line.replace(/(\d) (min|kg|h|séances?|[a-zéû]+\.)/g, '$1\u00a0$2');
}

export function kindOfSegment(segment: string | undefined): ReportKind {
  return segment === 'mois' ? 'month' : 'week';
}

/**
 * Bilan de la semaine ou du mois (§19.7) : court, factuel, sans score ni conseil, envoyable par mail en un geste.
 * Écran lié à plusieurs groupes : cadres neutres (§3.2), aucune couleur de statut.
 */
export function PeriodReport({ kind, periodParam }: { kind: ReportKind; periodParam?: string }) {
  const { sessions, exercises, replay, settings, variants, recapSettings, reportSettings, markReportSeen, activities } = useApp();
  const body = useBody();
  const now = Date.now();
  const period = (periodParam ? parsePeriodKey(kind, periodParam) : null) ?? defaultPeriod(kind, sessions, now);
  const key = periodKey(period);
  const weighIns = body.status === 'ready' ? body.data.weighIns : [];
  const report = useMemo(
    () => buildReport(period, { sessions, exercises, evaluations: replay.evaluations, settings, groups: recapSettings.groups, weighIns, activities, now }),
    // `now` change à chaque rendu : la période (clé) et les données suffisent.
    [key, kind, sessions, exercises, replay, settings, recapSettings, weighIns, activities],
  );
  const name = (id: string) => displayName(variants.get(id));
  const sections = reportSections(report, name);
  const subject = mailSubject(period);
  const text = reportText(report, name);
  const note = inProgressNote(report);
  const first = firstPeriod(kind, sessions);
  const hasPrevious = first !== null && first.start.getTime() < period.start.getTime();
  const [message, setMessage] = useState<string | null>(null);

  // Bilan ouvert : le bandeau de l'accueil disparaît pour cette période (si elle est terminée).
  useEffect(() => {
    void markReportSeen(period);
    setMessage(null);
  }, [key, kind]);

  const go = (k: ReportKind, p?: string) => navigate('bilan-periode', KIND_SEGMENTS[k], ...(p ? [p] : []));

  async function send() {
    const result = await sendByMail(subject, text, reportSettings.email);
    if (result === 'mailto') setMessage('Application de mail ouverte.');
  }

  async function copy() {
    setMessage((await copyText(text)) ? 'Texte copié.' : 'Copie impossible : sélectionnez le texte ci-dessous.');
  }

  return (
    <main className="screen period-report">
      <header className="simple-header">
        <a href="#/bilan" className="back" aria-label="Bilan de progression">
          ‹
        </a>
        <h1>Bilan de la période</h1>
      </header>
      <div className="report-tabs" role="group" aria-label="Période">
        {TABS.map((t) => (
          <button key={t.kind} type="button" className="btn report-tab" aria-pressed={kind === t.kind} onClick={() => go(t.kind)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="report-nav">
        {hasPrevious ? (
          <button type="button" className="btn" aria-label={kind === 'week' ? 'Semaine précédente' : 'Mois précédent'} onClick={() => go(kind, periodKey(shiftPeriod(period, -1)))}>
            ‹
          </button>
        ) : (
          <span className="report-nav-spacer" />
        )}
        <div className="report-heading">
          <h2 data-testid="report-title">{periodTitle(period)}</h2>
          {note && <p className="muted small">{note}</p>}
        </div>
        {report.inProgress ? (
          <span className="report-nav-spacer" />
        ) : (
          <button type="button" className="btn" aria-label={kind === 'week' ? 'Semaine suivante' : 'Mois suivant'} onClick={() => go(kind, periodKey(shiftPeriod(period, 1)))}>
            ›
          </button>
        )}
      </div>
      {sections.map((s) => (
        <section key={s.title} className="frame report-section" aria-label={s.title}>
          <h3 className="section-title">{s.title}</h3>
          <ul className="report-lines">
            {s.lines.map((line) => (
              <li key={lineText(line)}>
                {line.map((part, i) =>
                  typeof part === 'string' ? (
                    keepUnits(part)
                  ) : (
                    <strong key={i} className="report-em">
                      {keepUnits(part.em)}
                    </strong>
                  ),
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="report-actions">
        <button type="button" className="btn primary big" onClick={() => void send()}>
          Envoyer par mail
        </button>
        <button type="button" className="btn big" onClick={() => void copy()}>
          Copier le texte
        </button>
        {reportSettings.email && typeof navigator.share === 'function' && (
          <button type="button" className="btn big" onClick={() => openMailto(reportSettings.email, subject, text)}>
            Mail à {reportSettings.email}
          </button>
        )}
        {message && (
          <p className="report-message small" role="status">
            {message}
          </p>
        )}
      </div>
      <details className="report-text">
        <summary>Texte du mail</summary>
        <pre data-testid="report-text">{text}</pre>
      </details>
    </main>
  );
}
