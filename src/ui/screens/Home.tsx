import { useApp } from '../../app/store';
import { navigate, useNow } from '../../app/hooks';
import { elapsedMs, startSession } from '../../session/ops';
import { formatDuration } from '../../session/format';
import { needsBackupReminder } from '../../transfer/backup';
import { downloadBackup } from '../download';

export function Home() {
  const { active, commit, sessions, exercises, lastExportAt, markExported } = useApp();
  const now = useNow();
  const remind = needsBackupReminder(sessions, lastExportAt, now);

  async function start() {
    const session = startSession(Date.now());
    await commit(session);
    navigate('seance');
  }

  return (
    <main className="screen home">
      <h1 className="brand">MyFitApp</h1>
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
      {remind && (
        <div className="banner info reminder" role="status">
          <span>{lastExportAt ? 'Aucune sauvegarde depuis plus de 14 jours.' : 'Pensez à sauvegarder vos séances.'}</span>
          <button type="button" className="btn" onClick={() => void markExported(downloadBackup({ sessions, exercises }))}>
            Exporter
          </button>
        </div>
      )}
      <nav className="home-nav">
        <a className="btn" href="#/donnees">
          Importer / exporter
        </a>
        <a className="btn" href="#/reglages">
          Réglages
        </a>
      </nav>
    </main>
  );
}
