import { useEffect, useState } from 'react';
import { useApp } from '../app/store';
import { navigate, useNow } from '../app/hooks';
import { pendingReports, periodKey, type ReportPeriod } from '../analysis/report';

/** Bilans remis à plus tard pendant cette ouverture de l'appli : ils reviennent à la prochaine. */
const postponed = new Set<string>();
const idOf = (p: ReportPeriod) => `${p.kind}:${periodKey(p)}`;

const TEXTS = { week: 'Ton bilan de la semaine est prêt', month: 'Ton bilan du mois est prêt' } as const;

/** Composants à rafraîchir quand un bilan est remis à plus tard (bandeau et pastille de l'onglet). */
const listeners = new Set<() => void>();

function postpone(p: ReportPeriod): void {
  postponed.add(idOf(p));
  listeners.forEach((refresh) => refresh());
}

/**
 * Bilans à signaler (§19.7) : semaine écoulée à partir du lundi, mois écoulé à partir du 1er, jusqu'à leur ouverture,
 * selon les réglages ; ceux remis « à plus tard » sont masqués jusqu'à la prochaine ouverture de l'appli.
 */
export function usePendingReports(): ReportPeriod[] {
  const { sessions, reportSettings, reportSeen } = useApp();
  const now = useNow(60_000);
  const [, refresh] = useState(0);
  useEffect(() => {
    const listener = () => refresh((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return pendingReports(sessions, now, reportSettings, reportSeen).filter((p) => !postponed.has(idOf(p)));
}

/** Bandeau en haut de l'onglet Progrès : « Ton bilan de la semaine est prêt », « Voir » ou « Plus tard ». */
export function ReportBanner() {
  const pending = usePendingReports();
  if (pending.length === 0) return null;
  return (
    <>
      {pending.map((p) => (
        <div key={idOf(p)} className="banner info report-banner" role="status" data-report={p.kind}>
          <span>{TEXTS[p.kind]}</span>
          <span className="row">
            <button type="button" className="btn primary" onClick={() => navigate('bilan-periode', p.kind === 'week' ? 'semaine' : 'mois', periodKey(p))}>
              Voir
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => postpone(p)}
            >
              Plus tard
            </button>
          </span>
        </div>
      ))}
    </>
  );
}
