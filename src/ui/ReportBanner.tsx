import { useEffect, useState } from 'react';
import { useApp } from '../app/store';
import { navigate, useNow } from '../app/hooks';
import { periodKey, type ReportPeriod } from '../analysis/reportPeriod';
import { pendingReports } from '../analysis/reportSettings';
import { useCoachExport } from './coachExport';

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

/**
 * Rappel de l'export pour le coach dans le bandeau de la semaine (version 1.47.0, §19.13) : la semaine signalée, le
 * réglage coché, l'export possible pour cette semaine ; `sent` : déjà partagé ou téléchargé.
 */
function useCoachReminder(pending: readonly ReportPeriod[]) {
  const { reportSettings, coachSent } = useApp();
  const coach = useCoachExport();
  const week = pending.find((p) => p.kind === 'week');
  const shown = !!week && reportSettings.coachReminder && coach.available && periodKey(week) === periodKey(coach.period);
  return { coach, shown, sent: shown && coachSent === periodKey(week) };
}

/**
 * Le bandeau propose « Partager pour le coach » (pas encore envoyé) : le bouton sous « Cardio » est alors masqué, un
 * seul bouton à l'écran (version 1.57.0) ; il revient une fois l'envoi fait (« Envoyé au coach ✓ »), pour repartager.
 */
export function useCoachInBanner(): boolean {
  const pending = usePendingReports();
  const { shown, sent } = useCoachReminder(pending);
  return shown && !sent;
}

/**
 * Bandeau en haut de l'onglet Progrès : « Ton bilan de la semaine est prêt », « Voir » ou « Plus tard ». Celui de la
 * semaine porte aussi le rappel de l'export pour le coach (version 1.47.0, §19.13) : « Partager pour le coach », puis
 * « Envoyé au coach ✓ » une fois le fichier partagé ou téléchargé ; masqué par le réglage « Rappel de l'export coach ».
 * Version 1.57.0 : les deux bilans prêts ensemble (le lundi d'un début de mois), un seul bandeau, « Tes bilans de la
 * semaine et du mois sont prêts », « Voir la semaine », « Voir le mois », « Plus tard » (les deux).
 */
export function ReportBanner() {
  const pending = usePendingReports();
  const { coach, shown, sent } = useCoachReminder(pending);
  if (pending.length === 0) return null;
  const open = (p: ReportPeriod) => navigate('bilan-periode', p.kind === 'week' ? 'semaine' : 'mois', periodKey(p));
  const reminder =
    shown &&
    (sent ? (
      <span className="coach-sent" data-testid="coach-sent">
        Envoyé au coach ✓
      </span>
    ) : (
      <button type="button" className="btn coach-reminder" onClick={() => void coach.share()}>
        Partager pour le coach
      </button>
    ));
  const week = pending.find((p) => p.kind === 'week');
  const month = pending.find((p) => p.kind === 'month');
  if (week && month) {
    return (
      <div className="banner info report-banner" role="status" data-report="both">
        <span>Tes bilans de la semaine et du mois sont prêts</span>
        <span className="row">
          <button type="button" className="btn primary" onClick={() => open(week)}>
            Voir la semaine
          </button>
          <button type="button" className="btn primary" onClick={() => open(month)}>
            Voir le mois
          </button>
          <button type="button" className="btn" onClick={() => (postpone(week), postpone(month))}>
            Plus tard
          </button>
        </span>
        {reminder}
      </div>
    );
  }
  return (
    <>
      {pending.map((p) => (
        <div key={idOf(p)} className="banner info report-banner" role="status" data-report={p.kind}>
          <span>{TEXTS[p.kind]}</span>
          <span className="row">
            <button type="button" className="btn primary" onClick={() => open(p)}>
              Voir
            </button>
            <button type="button" className="btn" onClick={() => postpone(p)}>
              Plus tard
            </button>
          </span>
          {p.kind === 'week' && reminder}
        </div>
      ))}
    </>
  );
}
