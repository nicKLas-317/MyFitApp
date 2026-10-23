import { useApp } from '../../app/store';
import { navigate, useNow } from '../../app/hooks';
import { elapsedMs, startSession } from '../../session/ops';
import { formatDuration } from '../../session/format';
import { needsBackupReminder } from '../../transfer/backup';
import { useBody } from '../../body/store';
import { downloadBackup } from '../download';
import { ActivityBanner } from '../ActivityBanner';
import { ActivityEntry } from '../ActivityEntry';
import { WeeklyRecapBlock } from '../WeeklyRecap';

export function Home() {
  const { active, commit, sessions, exercises, lastExportAt, markExported, generalSettings, activities } = useApp();
  const now = useNow();
  const remind = needsBackupReminder(sessions, lastExportAt, now);
  const body = useBody();

  async function exportNow() {
    const bodyTracking = (await body.snapshot()) ?? undefined;
    await markExported(downloadBackup({ sessions, exercises, bodyTracking, settings: generalSettings, activities }));
  }

  async function start() {
    const session = startSession(Date.now());
    await commit(session);
    navigate('seance');
  }

  return (
    <main className="screen tab-screen home">
      <h1 className="brand">MyFitApp</h1>
      <ActivityBanner />
      <WeeklyRecapBlock />
      {active ? (
        <button type="button" className="btn primary huge" onClick={() => navigate('seance')}>
          Reprendre la séance
          <span className="chrono-inline">{formatDuration(elapsedMs(active, now))}</span>
        </button>
      ) : (
        <button type="button" className="btn primary huge" onClick={() => void start()}>
          Démarrer une séance
        </button>
      )}
      <ActivityEntry />
      {remind && (
        <div className="banner info reminder" role="status">
          <span>{lastExportAt ? 'Aucune sauvegarde depuis plus de 14 jours.' : 'Pense à sauvegarder tes séances.'}</span>
          <button type="button" className="btn" onClick={() => void exportNow()}>
            Exporter
          </button>
        </div>
      )}
    </main>
  );
}
