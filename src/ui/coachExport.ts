import { coachExportText, coachFileName, coachShareTitle, coachWeek, hasCoachWeek } from '../analysis/coach';
import type { ReportPeriod } from '../analysis/report';
import { useApp } from '../app/store';
import { EMPTY_BODY } from '../body/model';
import { useBody } from '../body/store';
import { shareFile, type FileShareResult } from './share';

export interface CoachExport {
  /** Une séance a été terminée avant la semaine en cours : il y a une semaine à exporter. */
  available: boolean;
  /** Dernière semaine terminée, celle qui sera exportée. */
  period: ReportPeriod;
  /** Nom du fichier de cette semaine. */
  fileName: string;
  /** Exporte la dernière semaine terminée au moment de l'appui ; partagée ou téléchargée, elle est notée envoyée. */
  share(): Promise<FileShareResult>;
}

/**
 * Export pour le coach (§19.13), une seule définition pour ses deux boutons : sous « Cardio » (version 1.46.0) et dans
 * le bandeau du bilan de la semaine (rappel, version 1.47.0). Une fois le fichier partagé ou téléchargé, la semaine est
 * mémorisée sur l'appareil (« Envoyé au coach ✓ » dans le bandeau) ; un partage annulé ne change rien.
 */
export function useCoachExport(): CoachExport {
  const { sessions, exercises, settings, recapSettings, activities, habits, cardioMachines, ignoredAlerts, markCoachSent } = useApp();
  const body = useBody();
  const now = Date.now();
  const period = coachWeek(now);
  return {
    available: hasCoachWeek(sessions, now),
    period,
    fileName: coachFileName(period),
    share: async () => {
      const at = Date.now();
      const week = coachWeek(at);
      const data = body.status === 'ready' ? body.data : EMPTY_BODY;
      const text = coachExportText({
        sessions,
        exercises,
        settings,
        recap: recapSettings,
        activities,
        habits,
        machines: cardioMachines,
        weighIns: data.weighIns,
        heightCm: data.heightCm,
        ignoredAlerts,
        appVersion: __APP_VERSION__,
        now: at,
      });
      const result = await shareFile(coachFileName(week), text, 'application/json', coachShareTitle(week));
      if (result !== 'cancelled') await markCoachSent(week);
      return result;
    },
  };
}
