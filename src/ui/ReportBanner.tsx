import { useState } from 'react';
import { useApp } from '../app/store';
import { navigate, useNow } from '../app/hooks';
import { pendingReports, periodKey, type ReportPeriod } from '../analysis/report';

/** Bilans remis à plus tard pendant cette ouverture de l'appli : ils reviennent à la prochaine. */
const postponed = new Set<string>();
const idOf = (p: ReportPeriod) => `${p.kind}:${periodKey(p)}`;

const TEXTS = { week: 'Ton bilan de la semaine est prêt', month: 'Ton bilan du mois est prêt' } as const;

/**
 * Bandeau discret de l'accueil (§19.7) : bilan de la semaine écoulée à partir du lundi, du mois écoulé à partir
 * du 1er. Il disparaît une fois le bilan ouvert ; « Plus tard » le masque jusqu'à la prochaine ouverture de l'appli.
 */
export function ReportBanner() {
  const { sessions, reportSettings, reportSeen } = useApp();
  const now = useNow(60_000);
  const [, refresh] = useState(0);
  const pending = pendingReports(sessions, now, reportSettings, reportSeen).filter((p) => !postponed.has(idOf(p)));
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
              onClick={() => {
                postponed.add(idOf(p));
                refresh((n) => n + 1);
              }}
            >
              Plus tard
            </button>
          </span>
        </div>
      ))}
    </>
  );
}
