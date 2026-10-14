import { useApp } from '../../app/store';
import { navigate, useNow } from '../../app/hooks';
import { elapsedMs, startSession } from '../../session/ops';
import { formatDuration } from '../../session/format';

export function Home() {
  const { active, commit } = useApp();
  const now = useNow();

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
      <nav className="home-nav">
        <a className="btn" href="#/reglages">
          Réglages
        </a>
      </nav>
    </main>
  );
}
