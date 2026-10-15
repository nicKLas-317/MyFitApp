import { useApp } from '../../app/store';

const PERSIST_LABELS = {
  granted: 'accordé',
  denied: 'non accordé (le navigateur peut effacer les données en cas de manque de place)',
  unsupported: 'non pris en charge par ce navigateur',
} as const;

export function Settings() {
  const { persist } = useApp();
  return (
    <main className="screen settings">
      <header className="simple-header">
        <a href="#/" className="back" aria-label="Accueil">
          ‹
        </a>
        <h1>Réglages</h1>
      </header>
      <dl className="settings-list">
        <dt>Stockage persistant</dt>
        <dd data-testid="persist-state">{persist ? PERSIST_LABELS[persist] : '…'}</dd>
        <dt>Version</dt>
        <dd>{__APP_VERSION__}</dd>
      </dl>
      <div className="settings-links">
        <a className="btn big" href="#/bibliotheque">
          Exercices, variantes et réglages par exercice
        </a>
        <a className="btn big" href="#/donnees">
          Importer ou exporter mes données
        </a>
      </div>
    </main>
  );
}
